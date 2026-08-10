import { db } from '../db/index.ts';
import { trades, tradeTags, tags, journalEntries, userSettings } from '../db/schema.ts';
import { eq, and, or, ilike, gte, lte, desc, SQL } from 'drizzle-orm';
import { decryptText, decryptJson } from './crypto.ts';
import {
  winRate,
  expectancy,
  averageR,
  profitFactor,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  edgeScore,
  type StatTrade,
  computeNetPnl,
  STARTING_BALANCE_DEFAULT
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

// Helper to search journal entries with decryption support
export async function handleSearchJournal(userId: string, args: any) {
  const { query } = args;
  if (!query) return [];
  if (!db) return [];

  const rawEntries = await db.select({
    id: journalEntries.id,
    date: journalEntries.date,
    mood: journalEntries.mood,
    textContent: journalEntries.textContent,
  })
  .from(journalEntries)
  .where(eq(journalEntries.userId, userId))
  .orderBy(desc(journalEntries.date))
  .limit(50);

  const lowerQuery = query.toLowerCase();

  const decryptedEntries = rawEntries.map((e) => ({
    id: e.id,
    date: e.date,
    mood: decryptText(e.mood, userId),
    textContent: decryptText(e.textContent, userId),
  }));

  return decryptedEntries.filter((e) => {
    const textMatch = e.textContent && e.textContent.toLowerCase().includes(lowerQuery);
    const moodMatch = e.mood && e.mood.toLowerCase().includes(lowerQuery);
    return textMatch || moodMatch;
  }).slice(0, 10);
}

export async function handleGetRankProgression(userId: string) {
  const { LEVELS, resolveActiveLevel } = await import('@/lib/levels');

  if (!db) {
    return {
      startingBalance: STARTING_BALANCE_DEFAULT,
      currentBalance: STARTING_BALANCE_DEFAULT,
      totalClosedNetPnl: 0,
      currentRank: LEVELS[0].rank,
      activeLevelIndex: 0,
      nextRank: LEVELS[1].rank,
      nextRankTarget: LEVELS[1].target,
      progressPercentage: 0,
      riskAllowancePerTrade: LEVELS[0].risk
    };
  }

  const { trades, userSettings, capitalTransactions } = await import('@/db/schema');
  const { computeNetPnl, computeNetCapitalCashflow } = await import('@/lib/stats');

  const settingsRow = await db
    .select({
      startingBalance: userSettings.startingBalance,
      highestAchievedLevel: userSettings.highestAchievedLevel,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
    .then((rows) => rows[0]);

  const startingBalance = settingsRow?.startingBalance
    ? Number(settingsRow.startingBalance)
    : STARTING_BALANCE_DEFAULT;

  const storedHighestLevel = settingsRow?.highestAchievedLevel ?? 0;

  let txRows: any[] = [];
  try {
    txRows = await db
      .select({
        id: capitalTransactions.id,
        type: capitalTransactions.type,
        amount: capitalTransactions.amount,
        date: capitalTransactions.date,
      })
      .from(capitalTransactions)
      .where(eq(capitalTransactions.userId, userId));
  } catch (err) {
    console.warn('copilot-db capital_transactions query failed:', err);
  }

  const statTx = txRows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
  }));

  const netCashflow = computeNetCapitalCashflow(statTx);

  const tradesRows = await db
    .select({
      pnl: trades.pnl,
      commission: trades.commission,
      swap: trades.swap,
      fees: trades.fees,
      status: trades.status,
    })
    .from(trades)
    .where(eq(trades.userId, userId));

  let totalClosedNetPnl = 0;
  for (const t of tradesRows) {
    if (t.status === 'closed') {
      const gross = t.pnl ? Number(t.pnl) : 0;
      const commission = t.commission ? Number(t.commission) : 0;
      const swap = t.swap ? Number(t.swap) : 0;
      const fees = t.fees ? Number(t.fees) : 0;
      const netPnl = computeNetPnl(gross, commission, swap, fees);
      if (netPnl !== null) {
        totalClosedNetPnl += netPnl;
      }
    }
  }

  const currentBalance = startingBalance + netCashflow + totalClosedNetPnl;

  const resolved = resolveActiveLevel(currentBalance, storedHighestLevel);
  const activeLevelIdx = resolved.activeLevelIdx;
  const currentLevel = resolved.activeLevel;
  const nextLevel = resolved.nextLevel;

  if (resolved.newHighestAchieved) {
    try {
      await db
        .insert(userSettings)
        .values({
          userId: userId,
          highestAchievedLevel: activeLevelIdx,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            highestAchievedLevel: activeLevelIdx,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      console.warn('Failed to update highestAchievedLevel in copilot-db:', e);
    }
  }

  let progressPercentage = 100;
  if (nextLevel) {
    const range = nextLevel.target - currentLevel.target;
    const progress = currentBalance - currentLevel.target;
    progressPercentage = Math.min(Math.max((progress / range) * 100, 0), 100);
  }

  return {
    startingBalance,
    currentBalance,
    totalClosedNetPnl,
    currentRank: currentLevel.rank,
    activeLevelIndex: activeLevelIdx,
    nextRank: nextLevel ? nextLevel.rank : null,
    nextRankTarget: nextLevel ? nextLevel.target : null,
    progressPercentage,
    riskAllowancePerTrade: currentLevel.risk
  };
}
