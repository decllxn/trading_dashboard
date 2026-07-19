import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { db } from '../db/index.ts';
import { trades, journalEntries } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  handleGetTrades,
  handleGetTradeStats,
  handleSearchJournal,
  handleGetRankProgression
} from './copilot-db.ts';

const testUserId = '00000000-0000-0000-0000-000000000000';

test('Gemini copilot db handlers integration tests', { skip: !db }, async (t) => {
  if (!db) throw new Error('Database is not configured.');
  // 1. Clean up before testing
  await db.delete(trades).where(eq(trades.userId, testUserId));
  await db.delete(journalEntries).where(eq(journalEntries.userId, testUserId));

  // 2. Insert mock trade records
  const [trade1, trade2, trade3] = await db.insert(trades).values([
    {
      userId: testUserId,
      instrument: 'EUR/USD',
      assetClass: 'forex',
      direction: 'long',
      status: 'closed',
      pnl: '150.00000000',
      rMultiple: '1.5000',
      entryTime: new Date('2024-01-01T10:00:00Z'),
    },
    {
      userId: testUserId,
      instrument: 'AAPL',
      assetClass: 'equity',
      direction: 'short',
      status: 'closed',
      pnl: '-50.00000000',
      rMultiple: '-0.5000',
      entryTime: new Date('2024-01-02T15:00:00Z'),
    },
    {
      userId: testUserId,
      instrument: 'SPY',
      assetClass: 'equity',
      direction: 'long',
      status: 'open',
      pnl: null,
      rMultiple: null,
      entryTime: new Date('2024-01-03T09:30:00Z'),
    }
  ]).returning();

  // 3. Insert mock journal records
  await db.insert(journalEntries).values([
    {
      userId: testUserId,
      date: '2024-01-01',
      textContent: 'Felt very good today, executed plan well.',
      mood: 'calm',
    },
    {
      userId: testUserId,
      date: '2024-01-02',
      textContent: 'Had some FOMO on AAPL, entered early.',
      mood: 'anxious',
    }
  ]);

  await t.test('handleGetTrades returns filtered list of trades', async () => {
    // Test filtering by asset class
    const equityTrades = await handleGetTrades(testUserId, { assetClass: 'equity' });
    assert.equal(equityTrades.length, 2, 'Should return 2 equity trades');
    
    const tickers = equityTrades.map(t => t.instrument).sort();
    assert.deepEqual(tickers, ['AAPL', 'SPY'], 'Should return AAPL and SPY');

    // Test filtering by status
    const closedTrades = await handleGetTrades(testUserId, { status: 'closed' });
    assert.equal(closedTrades.length, 2, 'Should return 2 closed trades');
  });

  await t.test('handleGetTradeStats returns calculated performance stats', async () => {
    const stats = await handleGetTradeStats(testUserId, {});
    
    // Sane calculations:
    // Population: closed trades with non-null P&L -> trade1 (+150), trade2 (-50).
    // Total Trades: 2
    // Wins: 1, Losses: 1 -> Win Rate: 0.50
    // Total P&L: 100
    // Expectancy: 50
    // Profit Factor: 150 / 50 = 3
    assert.equal(stats.tradeCount, 2);
    assert.equal(stats.winRate, 0.50);
    assert.equal(stats.totalPnl, 100);
    assert.equal(stats.expectancy, 50);
    assert.equal(stats.profitFactor, 3);
  });

  await t.test('handleSearchJournal searches notes by content keywords', async () => {
    const fomoSearch = await handleSearchJournal(testUserId, { query: 'FOMO' });
    assert.equal(fomoSearch.length, 1);
    assert.equal(fomoSearch[0].mood, 'anxious');
    assert.ok(fomoSearch[0].textContent?.includes('AAPL'));

    const calmSearch = await handleSearchJournal(testUserId, { query: 'calm' });
    assert.equal(calmSearch.length, 1);
    assert.equal(calmSearch[0].date, '2024-01-01');
  });

  await t.test('handleGetRankProgression calculates correct active level and next target', async () => {
    const progression = await handleGetRankProgression(testUserId);
    // Mock settings default starting balance is 150.
    // Closed net PNL: +150 (EUR/USD) - 50 (AAPL) = 100
    // Current balance: 150 + 100 = 250
    // Target 0: Novice Cadet (150)
    // Target 1: Market Apprentice (300)
    // 250 >= 150 and < 300 -> Rank: Novice Cadet.
    // Next target: 300.
    // Progress: (250 - 150) / (300 - 150) = 100 / 150 = 66.66%
    assert.equal(progression.currentRank, 'Novice Cadet');
    assert.equal(progression.currentBalance, 250);
    assert.equal(progression.nextRank, 'Market Apprentice');
    assert.equal(progression.nextRankTarget, 300);
    assert.ok(Math.abs(progression.progressPercentage - 66.66) < 0.1);
  });

  // 4. Cleanup after testing
  await db.delete(trades).where(eq(trades.userId, testUserId));
  await db.delete(journalEntries).where(eq(journalEntries.userId, testUserId));
});
