import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { getMarketData, fetchTwelveDataBars } from './market-data.ts';
import { db } from '../db/index.ts';
import { marketDataCache } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';

const hasTwelveData = !!process.env.TWELVE_DATA_API_KEY;
const hasAlpaca = !!(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
const canTestMarketData = hasTwelveData || hasAlpaca;

test('getMarketData fetches and caches SPY daily bars', { skip: !canTestMarketData }, async () => {
  console.log('Fetching SPY bars via getMarketData...');
  const bars = await getMarketData('SPY', '1D', '2024-01-01');
  
  assert.ok(bars.length > 0, 'Should return at least one bar');
  
  // Find SPY bar on 2024-01-02
  const spyBar = bars.find(b => b.time === '2024-01-02');
  assert.ok(spyBar, 'Should contain bar for 2024-01-02');
  
  console.log(`Verified SPY close on 2024-01-02: $${spyBar.value}`);
  // Verify against known price: 472.65
  assert.equal(spyBar.value, 472.65, 'SPY close on 2024-01-02 should be 472.65');
});

test('Twelve Data client fetches EUR/USD daily bars', { skip: !hasTwelveData }, async () => {
  console.log('Fetching EUR/USD bars from Twelve Data...');
  const bars = await fetchTwelveDataBars('EUR/USD', '1D', '2024-01-01');
  
  assert.ok(bars.length > 0, 'Should return at least one bar');
  
  // Find EUR/USD bar on 2024-01-02
  const fxBar = bars.find(b => b.time === '2024-01-02');
  assert.ok(fxBar, 'Should contain bar for 2024-01-02');
  
  console.log(`Verified EUR/USD close on 2024-01-02: ${fxBar.value}`);
  // EUR/USD close on 2024-01-02 is around 1.10
  assert.ok(fxBar.value > 1.05 && fxBar.value < 1.15, 'EUR/USD rate should be within standard historical range');
});

test('Caching layer stores and retrieves cached responses', { skip: !db || !canTestMarketData }, async () => {
  const testSymbol = 'SPY';
  const timeframe = '1D';
  
  // Clear any existing cache for clean test
  await db.delete(marketDataCache).where(
    and(
      eq(marketDataCache.symbol, testSymbol),
      eq(marketDataCache.timeframe, timeframe)
    )
  );

  console.log('First call to getMarketData (should miss cache & fetch)...');
  const data1 = await getMarketData(testSymbol, timeframe, '2024-01-01');
  assert.ok(data1.length > 0);

  // Verify it exists in the database now
  const dbRow = await db.query.marketDataCache.findFirst({
    where: and(
      eq(marketDataCache.symbol, testSymbol),
      eq(marketDataCache.timeframe, timeframe)
    )
  });
  assert.ok(dbRow, 'Cache row should be written to DB');
  assert.equal(dbRow.data.length, data1.length);

  // Modify the data in DB cache to verify we load it from cache in next call
  const modifiedData = [{ time: '2024-01-02', value: 999.99 }];
  await db.update(marketDataCache)
    .set({ data: modifiedData })
    .where(
      and(
        eq(marketDataCache.symbol, testSymbol),
        eq(marketDataCache.timeframe, timeframe)
      )
    );

  console.log('Second call to getMarketData (should hit cache)...');
  const data2 = await getMarketData(testSymbol, timeframe, '2024-01-01');
  
  assert.equal(data2.length, 1, 'Should load the modified cached data');
  assert.equal(data2[0].value, 999.99, 'Should return the cached value 999.99');
  
  // Clean up
  await db.delete(marketDataCache).where(
    and(
      eq(marketDataCache.symbol, testSymbol),
      eq(marketDataCache.timeframe, timeframe)
    )
  );
  console.log('Caching verification complete.');
});
