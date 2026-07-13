import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { matchActivitiesToTrades } from './snaptrade.ts';

test('matchActivitiesToTrades - simple long round-trip', () => {
  const activities = [
    {
      id: 'act1',
      type: 'BUY',
      trade_date: '2026-07-10T10:00:00.000Z',
      units: 10,
      price: 150,
      amount: -1500,
      symbol: { symbol: 'AAPL', type: { code: 'cs' } },
    },
    {
      id: 'act2',
      type: 'SELL',
      trade_date: '2026-07-11T11:00:00.000Z',
      units: 10,
      price: 160,
      amount: 1600,
      symbol: { symbol: 'AAPL', type: { code: 'cs' } },
    },
  ];

  const trades = matchActivitiesToTrades(activities);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.instrument, 'AAPL');
  assert.equal(t.assetClass, 'equity');
  assert.equal(t.direction, 'long');
  assert.equal(t.status, 'closed');
  assert.equal(t.entryPrice, 150);
  assert.equal(t.exitPrice, 160);
  assert.equal(t.size, 10);
  assert.equal(t.entryTime, '2026-07-10T10:00:00.000Z');
  assert.equal(t.exitTime, '2026-07-11T11:00:00.000Z');
  assert.equal(t.pnl, 100);
});

test('matchActivitiesToTrades - simple short round-trip', () => {
  const activities = [
    {
      id: 'act1',
      type: 'SELL',
      trade_date: '2026-07-10T10:00:00.000Z',
      units: 5,
      price: 1000,
      amount: 5000,
      symbol: { symbol: 'ES', type: { code: 'futures' } },
    },
    {
      id: 'act2',
      type: 'BUY',
      trade_date: '2026-07-10T12:00:00.000Z',
      units: 5,
      price: 980,
      amount: -4900,
      symbol: { symbol: 'ES', type: { code: 'futures' } },
    },
  ];

  const trades = matchActivitiesToTrades(activities);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.instrument, 'ES');
  assert.equal(t.assetClass, 'futures');
  assert.equal(t.direction, 'short');
  assert.equal(t.status, 'closed');
  assert.equal(t.entryPrice, 1000);
  assert.equal(t.exitPrice, 980);
  assert.equal(t.size, 5);
  assert.equal(t.pnl, 100);
});

test('matchActivitiesToTrades - partial exits and open positions', () => {
  const activities = [
    // Entry buy 10 AAPL
    {
      id: 'act1',
      type: 'BUY',
      trade_date: '2026-07-10T10:00:00.000Z',
      units: 10,
      price: 150,
      amount: -1500,
      symbol: { symbol: 'AAPL', type: { code: 'cs' } },
    },
    // Partial sell 6 AAPL
    {
      id: 'act2',
      type: 'SELL',
      trade_date: '2026-07-11T10:00:00.000Z',
      units: 6,
      price: 160,
      amount: 960,
      symbol: { symbol: 'AAPL', type: { code: 'cs' } },
    },
  ];

  const trades = matchActivitiesToTrades(activities);
  // Expect 1 closed trade (size 6) and 1 open trade (size 4)
  assert.equal(trades.length, 2);

  const tClosed = trades.find((t) => t.status === 'closed');
  const tOpen = trades.find((t) => t.status === 'open');

  assert.ok(tClosed);
  assert.equal(tClosed.size, 6);
  assert.equal(tClosed.entryPrice, 150);
  assert.equal(tClosed.exitPrice, 160);
  // (160 - 150) * 6 = 60
  assert.equal(tClosed.pnl, 60);

  assert.ok(tOpen);
  assert.equal(tOpen.size, 4);
  assert.equal(tOpen.entryPrice, 150);
  assert.equal(tOpen.exitPrice, null);
  assert.equal(tOpen.pnl, null);
});

test('matchActivitiesToTrades - options contracts with 100x multiplier estimation', () => {
  const activities = [
    {
      id: 'act1',
      type: 'BUY',
      trade_date: '2026-07-10T10:00:00.000Z',
      units: 2,
      price: 3.5,
      amount: null, // Test amount estimation fallback
      option_symbol: { ticker: 'AAPL 260717C00200000' },
    },
    {
      id: 'act2',
      type: 'SELL',
      trade_date: '2026-07-11T10:00:00.000Z',
      units: 2,
      price: 4.5,
      amount: null, // Test amount estimation fallback
      option_symbol: { ticker: 'AAPL 260717C00200000' },
    },
  ];

  const trades = matchActivitiesToTrades(activities);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.instrument, 'AAPL 260717C00200000');
  assert.equal(t.assetClass, 'option');
  assert.equal(t.direction, 'long');
  assert.equal(t.status, 'closed');
  // PNL should be (4.5 - 3.5) * 2 * 100 = 200
  assert.equal(t.pnl, 200);
});
