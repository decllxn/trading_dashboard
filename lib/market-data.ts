import { db } from '@/db';
import { marketDataCache } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface Bar {
  time: string; // YYYY-MM-DD
  value: number; // close price
}

/**
 * Fetch daily/intraday stock bars from Alpaca Market Data API v2.
 */
export async function fetchAlpacaBars(
  symbol: string,
  timeframe: string = '1D',
  start?: string
): Promise<Bar[]> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Alpaca API credentials missing in environment');
  }

  // Alpaca timeframe translation: '1D' -> '1Day'
  const alpacaTimeframe = timeframe === '1D' ? '1Day' : timeframe;
  const queryStart = start || '2024-01-01';

  // We request raw closing prices, split and dividend adjusted so performance returns are accurate
  const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=${alpacaTimeframe}&start=${queryStart}&limit=10000&adjustment=all`;

  const bars: Bar[] = [];
  let nextPageToken: string | null = null;

  do {
    const fetchUrl = nextPageToken ? `${url}&page_token=${nextPageToken}` : url;
    const res = await fetch(fetchUrl, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
        'accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Alpaca API error: ${res.status} ${res.statusText} - ${errText}`);
    }

    const json = await res.json();
    const symbolBars = json.bars?.[symbol] || [];

    for (const b of symbolBars) {
      // Parse ISO timestamp (e.g., 2024-01-02T05:00:00Z) to YYYY-MM-DD date string
      const dateStr = b.t.split('T')[0];
      bars.push({
        time: dateStr,
        value: Number(b.c), // close price
      });
    }

    nextPageToken = json.next_page_token;
  } while (nextPageToken);

  // Sort chronologically ascending
  return bars.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Fetch daily/intraday forex/index bars from Twelve Data API.
 */
export async function fetchTwelveDataBars(
  symbol: string,
  timeframe: string = '1D',
  start?: string
): Promise<Bar[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('Twelve Data API key missing in environment');
  }

  // Twelve Data timeframe: '1D' -> '1day'
  const twelveTimeframe = timeframe === '1D' ? '1day' : timeframe;
  const queryStart = start || '2024-01-01';

  // Twelve Data uses datetime for filtering and outputsize up to 5000
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${twelveTimeframe}&apikey=${apiKey}&start_date=${queryStart}&outputsize=5000`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.status === 'error') {
    throw new Error(`Twelve Data API error: ${json.message}`);
  }

  const values = json.values || [];
  const bars: Bar[] = values.map((v: any) => ({
    // Date formats can be YYYY-MM-DD or YYYY-MM-DD HH:mm:ss for intraday
    time: v.datetime.split(' ')[0],
    value: Number(v.close),
  }));

  // Re-sort ascending (Twelve Data returns descending by default)
  return bars.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * High-level market data getter with a daily-refresh caching layer in Supabase.
 */
export async function getMarketData(
  symbol: string,
  timeframe: string = '1D',
  start?: string
): Promise<Bar[]> {
  const fetchFn = async () => {
    // If it's a forex pair (contains a slash or is standard forex like EUR/USD, GBP/USD, etc.), use Twelve Data.
    // Otherwise, use Alpaca for US stocks.
    const isForex = symbol.includes('/') || symbol.includes('-') || symbol.length > 5;
    if (isForex) {
      return fetchTwelveDataBars(symbol, timeframe, start);
    } else {
      return fetchAlpacaBars(symbol, timeframe, start);
    }
  };

  if (!db) {
    // Graceful fallback if database is not configured
    return fetchFn();
  }

  try {
    // 1. Check if cached data exists
    const cached = await db.query.marketDataCache.findFirst({
      where: and(
        eq(marketDataCache.symbol, symbol),
        eq(marketDataCache.timeframe, timeframe)
      ),
    });

    const now = new Date();
    if (cached) {
      const cachedDate = new Date(cached.updatedAt);
      
      // Check if daily refresh is needed (same calendar day in UTC or older than 24 hours)
      const isSameDay =
        now.getUTCDate() === cachedDate.getUTCDate() &&
        now.getUTCMonth() === cachedDate.getUTCMonth() &&
        now.getUTCFullYear() === cachedDate.getUTCFullYear();

      const ageMs = now.getTime() - cachedDate.getTime();
      const isRecent = ageMs < 24 * 60 * 60 * 1000;

      if (isSameDay || isRecent) {
        return cached.data;
      }
    }

    // 2. Fetch fresh data
    const freshData = await fetchFn();

    // 3. Upsert cache in database
    await db
      .insert(marketDataCache)
      .values({
        symbol,
        timeframe,
        data: freshData,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [marketDataCache.symbol, marketDataCache.timeframe],
        set: {
          data: freshData,
          updatedAt: now,
        },
      });

    return freshData;
  } catch (error) {
    console.error(`Error in getMarketData for ${symbol}:`, error);
    // If the cache lookup or upsert fails, fallback to fresh API fetch so dashboard doesn't crash
    return fetchFn();
  }
}
