import { db } from '../db/index.ts';
import { marketDataCache } from '../db/schema.ts';
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

  const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=${alpacaTimeframe}&start=${queryStart}&limit=10000&adjustment=all`;

  const bars: Bar[] = [];
  let nextPageToken: string | null = null;

  do {
    let fetchUrl: string = url;
    if (nextPageToken) {
      fetchUrl = `${url}&page_token=${nextPageToken}`;
    }
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
    time: v.datetime.split(' ')[0],
    value: Number(v.close),
  }));

  // Re-sort ascending (Twelve Data returns descending by default)
  return bars.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * High-level market data getter with a daily-refresh caching layer in Supabase.
 * Falls back to Twelve Data if Alpaca fails (e.g. unauthorized credentials).
 */
export async function getMarketData(
  symbol: string,
  timeframe: string = '1D',
  start?: string
): Promise<Bar[]> {
  const fetchFn = async (queryStart?: string) => {
    const isForex = symbol.includes('/') || symbol.includes('-') || symbol.length > 5;
    if (isForex) {
      return fetchTwelveDataBars(symbol, timeframe, queryStart);
    } else {
      try {
        return await fetchAlpacaBars(symbol, timeframe, queryStart);
      } catch (alpacaError) {
        console.warn(`Alpaca failed for ${symbol}, falling back to Twelve Data:`, alpacaError);
        return fetchTwelveDataBars(symbol, timeframe, queryStart);
      }
    }
  };

  if (!db) {
    return fetchFn(start);
  }

  try {
    const cached = await db.query.marketDataCache.findFirst({
      where: and(
        eq(marketDataCache.symbol, symbol),
        eq(marketDataCache.timeframe, timeframe)
      ),
    });

    const now = new Date();
    if (cached) {
      const cachedDate = new Date(cached.updatedAt);
      
      const isSameDay =
        now.getUTCDate() === cachedDate.getUTCDate() &&
        now.getUTCMonth() === cachedDate.getUTCMonth() &&
        now.getUTCFullYear() === cachedDate.getUTCFullYear();

      const ageMs = now.getTime() - cachedDate.getTime();
      const isRecent = ageMs < 24 * 60 * 60 * 1000;

      const earliestCachedDate = cached.data.length > 0 ? cached.data[0].time : null;
      let hasNeededHistory = false;
      if (!start) {
        hasNeededHistory = true;
      } else if (earliestCachedDate !== null) {
        if (earliestCachedDate <= start) {
          hasNeededHistory = true;
        } else {
          // If the cached date is within 4 days after the requested start, it's highly likely
          // that the start date fell on a weekend or holiday, and the cached date is the first trading day.
          const startMs = Date.parse(start);
          const cachedMs = Date.parse(earliestCachedDate);
          if (!Number.isNaN(startMs) && !Number.isNaN(cachedMs)) {
            const diffDays = (cachedMs - startMs) / (1000 * 60 * 60 * 24);
            if (diffDays <= 4) {
              hasNeededHistory = true;
            }
          }
        }
      }

      if ((isSameDay || isRecent) && hasNeededHistory) {
        return start
          ? cached.data.filter((pt) => pt.time >= start)
          : cached.data;
      }

      // If the cache is stale or missing older history, fetch fresh data.
      // Use the minimum of requested 'start' and 'earliestCachedDate' to avoid losing cached history.
      const fetchStart = start && earliestCachedDate && earliestCachedDate < start ? earliestCachedDate : start;
      const freshData = await fetchFn(fetchStart);

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

      return start
        ? freshData.filter((pt) => pt.time >= start)
        : freshData;
    }

    const freshData = await fetchFn(start);

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
    return fetchFn(start);
  }
}
