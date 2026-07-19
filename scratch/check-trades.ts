import { db } from '../db/index.ts';
import { trades, marketDataCache } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { cumulativePnlSeries, computeRollingStats } from '../lib/stats.ts';
import { getMarketData } from '../lib/market-data.ts';

async function run() {
  if (!db) {
    console.error("Database connection not configured");
    return;
  }

  const allTrades = await db.select().from(trades);
  console.log(`Total trades in DB: ${allTrades.length}`);
  
  const closedTrades = allTrades.filter(t => t.status === 'closed');
  console.log(`Closed trades: ${closedTrades.length}`);
  
  if (closedTrades.length > 0) {
    const entryDates = closedTrades.map((t) => t.entryTime).filter((d): d is Date => !!d);
    const startDate = entryDates.length > 0 ? entryDates.map(d => d.toISOString().split('T')[0]).sort()[0] : '2024-01-01';
    console.log(`Computed start date (earliest closed trade entryTime): ${startDate}`);

    // Let's format the trades as StatTrade
    const formattedTrades = allTrades.map(t => ({
      id: t.id,
      userId: t.userId,
      instrument: t.instrument,
      assetClass: t.assetClass,
      direction: t.direction,
      entryPrice: t.entryPrice ? Number(t.entryPrice) : null,
      exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
      size: t.size ? Number(t.size) : null,
      stopPrice: t.stopPrice ? Number(t.stopPrice) : null,
      targetPrice: t.targetPrice ? Number(t.targetPrice) : null,
      entryTime: t.entryTime ? t.entryTime.toISOString() : null,
      exitTime: t.exitTime ? t.exitTime.toISOString() : null,
      pnl: t.pnl ? Number(t.pnl) : null,
      commission: t.commission ? Number(t.commission) : null,
      swap: t.swap ? Number(t.swap) : null,
      fees: t.fees ? Number(t.fees) : null,
      rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
      status: t.status,
      source: t.source,
      annotations: t.annotations,
      brokerConnectionId: t.brokerConnectionId,
      dailyPdArray: t.dailyPdArray,
      oneHourPdArray: t.oneHourPdArray,
      thirtyMinutePdArray: t.thirtyMinutePdArray,
      images: t.images
    }));

    const pnlSeries = cumulativePnlSeries(formattedTrades);
    console.log(`pnlSeries length: ${pnlSeries.length}`);

    // First call (hits or updates cache if needed)
    console.log("Making first getMarketData call...");
    const spyData1 = await getMarketData('SPY', '1D', startDate);
    console.log(`First call SPY data length: ${spyData1.length}`);

    // Second call (must hit cache and return filtered data)
    console.log("Making second getMarketData call (should hit cache)...");
    const spyData2 = await getMarketData('SPY', '1D', startDate);
    console.log(`Second call SPY data length: ${spyData2.length}`);

    if (spyData2.length > 0) {
      console.log(`SPY range: ${spyData2[0].time} to ${spyData2[spyData2.length - 1].time}`);
    }

    const rollingStats = computeRollingStats(pnlSeries, spyData2, 30, 100000);
    console.log(`rollingStats length: ${rollingStats.length}`);
    if (rollingStats.length > 0) {
      const lastStat = rollingStats[rollingStats.length - 1];
      console.log(`Last rolling stat:`, lastStat);
    }
  }
  
  process.exit(0);
}

run();
