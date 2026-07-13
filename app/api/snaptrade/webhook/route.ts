import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhookSignature, syncBrokerTrades } from '@/lib/snaptrade';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('Signature') || request.headers.get('signature');

    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const { eventType, userId, accountId } = payload;

    if (
      eventType === 'ACCOUNT_TRANSACTIONS_INITIAL_UPDATE' ||
      eventType === 'ACCOUNT_TRANSACTIONS_UPDATED'
    ) {
      if (userId && accountId) {
        await syncBrokerTrades(userId, accountId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error handling SnapTrade webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error.' },
      { status: 500 },
    );
  }
}
