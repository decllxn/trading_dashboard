import { computeRMultiple } from './trades.ts';
import type { AssetClass, Direction, TradeStatus } from '../db/schema.ts';

const CTRADER_SERVICE_URL =
  process.env.CTRADER_SERVICE_URL || 'http://localhost:8001';

/**
 * Infer the dashboard assetClass from a cTrader symbol.
 */
export function inferAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace('/', '');
  // Major & minor forex pairs
  const forexCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  if (s.length === 6) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (forexCurrencies.includes(base) && forexCurrencies.includes(quote)) {
      return 'forex';
    }
  }

  // Commodities & metals
  if (['XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'NGAS', 'COPPER'].some((c) => s.includes(c))) {
    return 'futures';
  }

  // Indices
  if (
    [
      'US500',
      'SPX500',
      'NAS100',
      'USTECH',
      'US30',
      'GER40',
      'UK100',
      'FRA40',
      'EUSTX50',
      'JPN225',
      'AUS200',
    ].some((idx) => s.includes(idx))
  ) {
    return 'futures';
  }

  // Crypto
  if (['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'].some((c) => s.includes(c))) {
    return 'crypto';
  }

  return 'forex';
}

/**
 * Fetch authorization redirect URL from cTrader bridge service.
 */
export async function getCTraderAuthUrl(redirectUri: string): Promise<string> {
  const res = await fetch(
    `${CTRADER_SERVICE_URL}/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get cTrader auth URL: ${res.statusText}`);
  }
  const data = await res.json();
  return data.url;
}

/**
 * Exchange auth code for access & refresh tokens.
 */
export async function exchangeCTraderCode(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  errorCode?: string;
  description?: string;
}> {
  const res = await fetch(`${CTRADER_SERVICE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.description || 'Token exchange failed');
  }
  return data;
}

/**
 * Discover all cTrader accounts linked to the access token.
 */
export async function discoverCTraderAccounts(accessToken: string): Promise<
  Array<{
    ctidTraderAccountId: number;
    isLive: boolean;
    traderLogin?: number;
    lastClosingDealTimestamp?: number;
  }>
> {
  const res = await fetch(`${CTRADER_SERVICE_URL}/accounts/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to discover cTrader accounts');
  }
  return data.accounts || [];
}

/**
 * Authorize an account on the live socket in the bridge service.
 */
export async function authorizeSocketAccount(
  accountId: number,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${CTRADER_SERVICE_URL}/accounts/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, access_token: accessToken }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.warn(`Could not authorize socket account ${accountId}:`, err);
    return false;
  }
}

/**
 * Perform a full sync of an authorized cTrader account:
 * - Updates balance, equity, leverage in ctrader_accounts
 * - Appends a balance_snapshot
 * - Syncs open positions and historical deals into trades table
 */
export async function syncCTraderAccount(
  userId: string,
  ctidTraderAccountId: string,
  accessToken: string,
): Promise<{
  positionsCount: number;
  dealsCount: number;
  balance: number;
}> {
  const { createServerClient } = await import('./supabase.ts');
  const supabase = createServerClient();
  if (!supabase) throw new Error('Database client unavailable');

  const acctNum = parseInt(ctidTraderAccountId, 10);

  // 1. Authorize on socket
  await authorizeSocketAccount(acctNum, accessToken);

  // 2. Fetch trader profile
  let balance = 0;
  let brokerName = 'Pepperstone';
  let leverage = 100;
  try {
    const profileRes = await fetch(
      `${CTRADER_SERVICE_URL}/accounts/${acctNum}/profile`,
    );
    if (profileRes.ok) {
      const profile = await profileRes.json();
      balance = profile.balance || 0;
      brokerName = profile.brokerName || 'Pepperstone';
      leverage = profile.leverage || 100;
    }
  } catch (e) {
    console.warn('Could not fetch trader profile:', e);
  }

  // 3. Find active trading account for user
  const { data: activeAcct } = await supabase
    .from('trading_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const tradingAccountId = activeAcct?.id || null;

  // 4. Find or create broker_connection
  let brokerConnectionId: string | null = null;
  const { data: existingConn } = await supabase
    .from('broker_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'ctrader')
    .eq('external_account_id', ctidTraderAccountId)
    .maybeSingle();

  if (existingConn) {
    brokerConnectionId = existingConn.id;
    await supabase
      .from('broker_connections')
      .update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', brokerConnectionId);
  } else {
    const { data: newConn } = await supabase
      .from('broker_connections')
      .insert({
        user_id: userId,
        provider: 'ctrader',
        broker_name: brokerName,
        external_account_id: ctidTraderAccountId,
        status: 'active',
        last_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (newConn) brokerConnectionId = newConn.id;
  }

  // 5. Upsert ctrader_accounts record
  const { data: acctRow } = await supabase
    .from('ctrader_accounts')
    .upsert(
      {
        user_id: userId,
        broker_connection_id: brokerConnectionId,
        trading_account_id: tradingAccountId,
        ctid_trader_account_id: ctidTraderAccountId,
        broker_title: brokerName,
        balance: balance.toString(),
        equity: balance.toString(),
        leverage_in_cents: Math.round(leverage * 100),
        access_token: accessToken,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ctid_trader_account_id' },
    )
    .select('id')
    .single();

  const ctraderAccountId = acctRow?.id;

  // 6. Record balance snapshot
  if (ctraderAccountId && balance > 0) {
    await supabase.from('balance_snapshots').insert({
      user_id: userId,
      trading_account_id: tradingAccountId,
      ctrader_account_id: ctraderAccountId,
      balance: balance.toString(),
      equity: balance.toString(),
      recorded_at: new Date().toISOString(),
    });
  }

  // 7. Fetch open positions
  let positionsCount = 0;
  try {
    const posRes = await fetch(
      `${CTRADER_SERVICE_URL}/accounts/${acctNum}/positions`,
    );
    if (posRes.ok) {
      const posData = await posRes.json();
      const positions = posData.positions || [];
      positionsCount = positions.length;

      for (const pos of positions) {
        const extId = `ctrader_pos_${pos.positionId}`;
        const assetClass = inferAssetClass(pos.symbol);
        const direction: Direction = pos.direction === 'short' ? 'short' : 'long';
        const entryTime = pos.openTime
          ? new Date(pos.openTime).toISOString()
          : new Date().toISOString();

        const rMultiple = computeRMultiple(
          pos.entryPrice,
          pos.stopLoss,
          null,
          direction,
        );

        // Check if trade already exists
        const { data: existing } = await supabase
          .from('trades')
          .select('id')
          .eq('user_id', userId)
          .eq('external_trade_id', extId)
          .maybeSingle();

        const tradeData = {
          user_id: userId,
          trading_account_id: tradingAccountId,
          broker_connection_id: brokerConnectionId,
          instrument: pos.symbol,
          asset_class: assetClass,
          direction,
          status: 'open' as TradeStatus,
          source: 'ctrader' as const,
          entry_price: pos.entryPrice?.toString() ?? null,
          stop_price: pos.stopLoss?.toString() ?? null,
          target_price: pos.takeProfit?.toString() ?? null,
          size: pos.volume?.toString() ?? null,
          entry_time: entryTime,
          commission: pos.commission?.toString() ?? null,
          swap: pos.swap?.toString() ?? null,
          r_multiple: rMultiple != null ? rMultiple.toString() : null,
          external_trade_id: extId,
        };

        if (existing) {
          await supabase.from('trades').update(tradeData).eq('id', existing.id);
        } else {
          await supabase.from('trades').insert(tradeData);
        }
      }
    }
  } catch (err) {
    console.error('Error syncing cTrader open positions:', err);
  }

  // 8. Fetch historical closed deals
  let dealsCount = 0;
  try {
    const dealsRes = await fetch(
      `${CTRADER_SERVICE_URL}/accounts/${acctNum}/deals?from_days=365`,
    );
    if (dealsRes.ok) {
      const dealsData = await dealsRes.json();
      const deals = dealsData.deals || [];

      // Filter only closing deals (which have exit prices and realized P&L)
      const closedDeals = deals.filter((d: any) => d.isClose);
      dealsCount = closedDeals.length;

      for (const deal of closedDeals) {
        const extId = `ctrader_deal_${deal.dealId}`;
        const assetClass = inferAssetClass(deal.symbol);
        const direction: Direction = deal.tradeSide === 'short' ? 'short' : 'long';
        const exitTime = deal.executionTime
          ? new Date(deal.executionTime).toISOString()
          : new Date().toISOString();

        const rMultiple = computeRMultiple(
          deal.entryPrice,
          null,
          deal.exitPrice,
          direction,
        );

        const { data: existing } = await supabase
          .from('trades')
          .select('id')
          .eq('user_id', userId)
          .eq('external_trade_id', extId)
          .maybeSingle();

        const tradeData = {
          user_id: userId,
          trading_account_id: tradingAccountId,
          broker_connection_id: brokerConnectionId,
          instrument: deal.symbol,
          asset_class: assetClass,
          direction,
          status: 'closed' as TradeStatus,
          source: 'ctrader' as const,
          entry_price: deal.entryPrice?.toString() ?? null,
          exit_price: deal.exitPrice?.toString() ?? null,
          size: deal.volume?.toString() ?? null,
          exit_time: exitTime,
          pnl: deal.grossProfit?.toString() ?? null,
          commission: deal.commission?.toString() ?? null,
          swap: deal.swap?.toString() ?? null,
          r_multiple: rMultiple != null ? rMultiple.toString() : null,
          external_trade_id: extId,
        };

        if (existing) {
          await supabase.from('trades').update(tradeData).eq('id', existing.id);
        } else {
          await supabase.from('trades').insert(tradeData);
        }
      }
    }
  } catch (err) {
    console.error('Error syncing cTrader deals:', err);
  }

  return { positionsCount, dealsCount, balance };
}
