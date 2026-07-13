import { db } from '../db/index.ts';
import { trades, tradeTags, tags, journalEntries } from '../db/schema.ts';
import { eq, and, or, ilike, gte, lte, desc, SQL } from 'drizzle-orm';
import {
  winRate,
  expectancy,
  averageR,
  profitFactor,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  edgeScore,
  type StatTrade
} from './stats.ts';

// Helper to query and filter trades
export async function handleGetTrades(userId: string, filters: any) {
  if (!db) return [];
  const query = db.select({
    id: trades.id,
    instrument: trades.instrument,
    assetClass: trades.assetClass,
    direction: trades.direction,
    entryPrice: trades.entryPrice,
    exitPrice: trades.exitPrice,
    size: trades.size,
    stopPrice: trades.stopPrice,
    targetPrice: trades.targetPrice,
    entryTime: trades.entryTime,
    exitTime: trades.exitTime,
    pnl: trades.pnl,
    rMultiple: trades.rMultiple,
    status: trades.status,
    source: trades.source,
  }).from(trades);

  const conditions: (SQL | undefined)[] = [eq(trades.userId, userId)];

  if (filters.assetClass) {
    conditions.push(eq(trades.assetClass, filters.assetClass));
  }
  if (filters.status) {
    conditions.push(eq(trades.status, filters.status));
  }
  if (filters.fromDate) {
    conditions.push(gte(trades.entryTime, new Date(filters.fromDate)));
  }
  if (filters.toDate) {
    conditions.push(lte(trades.entryTime, new Date(filters.toDate)));
  }

  let finalQuery;
  if (filters.tag) {
    finalQuery = query
      .innerJoin(tradeTags, eq(trades.id, tradeTags.tradeId))
      .innerJoin(tags, eq(tradeTags.tagId, tags.id))
      .where(and(
        ...conditions.filter((c): c is SQL => !!c),
        eq(tags.name, filters.tag)
      ));
  } else {
    finalQuery = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }

  const result = await finalQuery
    .orderBy(desc(trades.entryTime))
    .limit(filters.limit || 10);

  return result.map(t => ({
    ...t,
    pnl: t.pnl ? Number(t.pnl) : null,
    rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
  }));
}

// Helper to calculate statistics on filtered trades
export async function handleGetTradeStats(userId: string, filters: any) {
  if (!db) {
    return {
      tradeCount: 0,
      winRate: 0,
      expectancy: 0,
      profitFactor: 0,
      averageR: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      edgeScore: 0,
      totalPnl: 0,
    };
  }
  const query = db.select({
    id: trades.id,
    pnl: trades.pnl,
    rMultiple: trades.rMultiple,
    entryTime: trades.entryTime,
    status: trades.status,
  }).from(trades);

  const conditions: (SQL | undefined)[] = [eq(trades.userId, userId)];

  if (filters.assetClass) {
    conditions.push(eq(trades.assetClass, filters.assetClass));
  }
  if (filters.status) {
    conditions.push(eq(trades.status, filters.status));
  }
  if (filters.fromDate) {
    conditions.push(gte(trades.entryTime, new Date(filters.fromDate)));
  }
  if (filters.toDate) {
    conditions.push(lte(trades.entryTime, new Date(filters.toDate)));
  }

  let finalQuery;
  if (filters.tag) {
    finalQuery = query
      .innerJoin(tradeTags, eq(trades.id, tradeTags.tradeId))
      .innerJoin(tags, eq(tradeTags.tagId, tags.id))
      .where(and(
        ...conditions.filter((c): c is SQL => !!c),
        eq(tags.name, filters.tag)
      ));
  } else {
    finalQuery = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }

  const dbTrades = await finalQuery;
  const statsTrades: StatTrade[] = dbTrades.map(t => ({
    pnl: t.pnl ? Number(t.pnl) : null,
    rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
    entryTime: t.entryTime ? new Date(t.entryTime).toISOString() : null,
    status: t.status || undefined,
  }));

  const count = statsTrades.length;
  if (count === 0) {
    return {
      tradeCount: 0,
      winRate: 0,
      expectancy: 0,
      profitFactor: 0,
      averageR: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      edgeScore: 0,
      totalPnl: 0,
    };
  }

  return {
    tradeCount: count,
    winRate: winRate(statsTrades),
    expectancy: expectancy(statsTrades),
    profitFactor: profitFactor(statsTrades),
    averageR: averageR(statsTrades),
    maxDrawdown: maxDrawdown(statsTrades),
    sharpeRatio: sharpeRatio(statsTrades),
    sortinoRatio: sortinoRatio(statsTrades),
    edgeScore: edgeScore(statsTrades),
    totalPnl: statsTrades.reduce((acc, t) => acc + (t.pnl || 0), 0),
  };
}

// Helper to search journal entries
export async function handleSearchJournal(userId: string, args: any) {
  const { query } = args;
  if (!query) return [];
  if (!db) return [];

  const entries = await db.select({
    id: journalEntries.id,
    date: journalEntries.date,
    mood: journalEntries.mood,
    textContent: journalEntries.textContent,
  })
  .from(journalEntries)
  .where(and(
    eq(journalEntries.userId, userId),
    or(
      ilike(journalEntries.textContent, `%${query}%`),
      ilike(journalEntries.mood, `%${query}%`)
    )
  ))
  .orderBy(desc(journalEntries.date))
  .limit(10);

  return entries;
}
