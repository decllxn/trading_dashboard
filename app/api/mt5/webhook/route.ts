import { NextResponse } from 'next/server';
import { db } from '@/db';
import { trades, brokerConnections } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { computeRMultiple } from '@/lib/trades';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const token = searchParams.get('token');

    if (!userId || userId !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      symbol,
      direction, // "long" | "short"
      entry_price,
      exit_price,
      size,
      stop_loss,
      take_profit,
      entry_time,
      exit_time,
      pnl,
      broker_name,
    } = body;

    if (!symbol || !entry_time || !size) {
      return NextResponse.json({ error: 'Missing required parameters (symbol, entry_time, size)' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const finalBrokerName = broker_name || 'Pepperstone MT5 Webhook';
    let [conn] = await db
      .select()
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.userId, userId),
          eq(brokerConnections.brokerName, finalBrokerName)
        )
      )
      .limit(1);

    if (!conn) {
      [conn] = await db
        .insert(brokerConnections)
        .values({
          userId,
          provider: 'manual',
          brokerName: finalBrokerName,
          status: 'active',
          lastSyncedAt: new Date(),
        })
        .returning();
    } else {
      await db
        .update(brokerConnections)
        .set({ lastSyncedAt: new Date() })
        .where(eq(brokerConnections.id, conn.id));
    }

    const entryDate = new Date(entry_time);
    const [existing] = await db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          eq(trades.instrument, symbol),
          eq(trades.entryTime, entryDate)
        )
      )
      .limit(1);

    if (existing) {
      const rMult = exit_price
        ? computeRMultiple(Number(entry_price), Number(stop_loss), Number(exit_price), direction || 'long')
        : existing.rMultiple ? Number(existing.rMultiple) : null;

      await db
        .update(trades)
        .set({
          exitPrice: exit_price ? String(exit_price) : existing.exitPrice,
          exitTime: exit_time ? new Date(exit_time) : existing.exitTime,
          pnl: pnl !== undefined ? String(pnl) : existing.pnl,
          status: exit_time ? 'closed' : 'open',
          rMultiple: rMult ? String(rMult) : null,
        })
        .where(eq(trades.id, existing.id));

      return NextResponse.json({ success: true, action: 'updated', tradeId: existing.id });
    }

    const rMult = exit_price
      ? computeRMultiple(Number(entry_price), Number(stop_loss), Number(exit_price), direction || 'long')
      : null;

    const [newTrade] = await db
      .insert(trades)
      .values({
        userId,
        instrument: symbol,
        assetClass: 'forex',
        direction: direction || 'long',
        status: exit_time ? 'closed' : 'open',
        source: 'manual',
        entryPrice: entry_price ? String(entry_price) : null,
        exitPrice: exit_price ? String(exit_price) : null,
        size: size ? String(size) : null,
        stopPrice: stop_loss ? String(stop_loss) : null,
        targetPrice: take_profit ? String(take_profit) : null,
        entryTime: entryDate,
        exitTime: exit_time ? new Date(exit_time) : null,
        pnl: pnl !== undefined ? String(pnl) : null,
        rMultiple: rMult ? String(rMult) : null,
        brokerConnectionId: conn.id,
      })
      .returning();

    return NextResponse.json({ success: true, action: 'created', tradeId: newTrade.id });
  } catch (err: any) {
    console.error('MT5 Webhook Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
