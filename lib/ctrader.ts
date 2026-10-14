import { computeRMultiple } from './trades.ts';
import { computeNetPnl } from './stats.ts';
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
 * In cTrader closed deals, deal.tradeSide is the closing order.
 * Selling to close (closing order = 'short') means the original trade position was LONG.
 * Buying to close (closing order = 'long') means the original trade position was SHORT.
 */
export function inferClosingPositionDirection(closingTradeSide: string): Direction {
  return closingTradeSide === 'short' ? 'long' : 'short';
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
  return {
    ...data,
    accessToken: data.accessToken || data.access_token,
    refreshToken: data.refreshToken || data.refresh_token,
    expiresIn: data.expiresIn || data.expires_in,
  };
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
  let brokerName = 'cTrader';
  let leverage = 100;
  let login: number | null = null;
  try {
    const profileRes = await fetch(
      `${CTRADER_SERVICE_URL}/accounts/${acctNum}/profile`,
    );
    if (profileRes.ok) {
      const profile = await profileRes.json();
      balance = profile.balance || 0;
      brokerName = profile.brokerName || 'cTrader';
      leverage = profile.leverage || 100;
      login = profile.login || null;
    }
  } catch (e) {
    console.warn('Could not fetch trader profile:', e);
  }

  // 3. Find active trading account for user
  const { data: activeAcct } = await supabase
    .from('trading_accounts')
    .select('id, starting_balance')
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
        broker_name: brokerName,
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
        account_number: login ? login.toString() : null,
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
  const activePositionExtIds: string[] = [];
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
        activePositionExtIds.push(extId);
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

        // Atomic upsert guarantees zero duplicates
        await supabase.from('trades').upsert(tradeData, {
          onConflict: 'user_id,external_trade_id',
        });
      }

      // Clean up previously synced open positions that have since closed
      if (brokerConnectionId) {
        let deleteQuery = supabase
          .from('trades')
          .delete()
          .eq('user_id', userId)
          .eq('broker_connection_id', brokerConnectionId)
          .eq('status', 'open')
          .eq('source', 'ctrader');

        if (activePositionExtIds.length > 0) {
          deleteQuery = deleteQuery.not('external_trade_id', 'in', `(${activePositionExtIds.map(id => `"${id}"`).join(',')})`);
        }
        await deleteQuery;
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
        
        // In cTrader closed deals, deal.tradeSide is the closing order.
        // Selling to close means the original trade position was LONG.
        const direction: Direction = inferClosingPositionDirection(deal.tradeSide);
        
        const exitTime = deal.executionTime
          ? new Date(deal.executionTime).toISOString()
          : new Date().toISOString();

        // Always guarantee non-null entry_time for proper date sorting and hourly analytics
        const entryTime = deal.openTime
          ? new Date(deal.openTime).toISOString()
          : exitTime;

        // If an open position row existed for this position, clean it up so closed and open states don't coexist
        if (deal.positionId) {
          await supabase
            .from('trades')
            .delete()
            .eq('user_id', userId)
            .eq('external_trade_id', `ctrader_pos_${deal.positionId}`);
        }

        const rMultiple = computeRMultiple(
          deal.entryPrice,
          null,
          deal.exitPrice,
          direction,
        );

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
          entry_time: entryTime,
          exit_time: exitTime,
          pnl: deal.grossProfit?.toString() ?? null,
          commission: deal.commission?.toString() ?? null,
          swap: deal.swap?.toString() ?? null,
          r_multiple: rMultiple != null ? rMultiple.toString() : null,
          external_trade_id: extId,
        };

        // Atomic upsert on (user_id, external_trade_id)
        await supabase.from('trades').upsert(tradeData, {
          onConflict: 'user_id,external_trade_id',
        });
      }
    }
  } catch (err) {
    console.error('Error syncing cTrader deals:', err);
  }

  // 9. Calibrate starting balance for active trading account so total equity matches live broker balance
  if (tradingAccountId && balance > 0) {
    try {
      const { data: closedRows } = await supabase
        .from('trades')
        .select('pnl, commission, swap, fees')
        .eq('user_id', userId)
        .eq('trading_account_id', tradingAccountId)
        .eq('status', 'closed');

      let totalClosedNetPnl = 0;
      if (closedRows) {
        for (const row of closedRows) {
          const net = computeNetPnl(
            row.pnl ? Number(row.pnl) : null,
            row.commission ? Number(row.commission) : null,
            row.swap ? Number(row.swap) : null,
            row.fees ? Number(row.fees) : null,
          );
          if (net != null) totalClosedNetPnl += net;
        }
      }

      const { data: txRows } = await supabase
        .from('capital_transactions')
        .select('type, amount')
        .eq('user_id', userId)
        .eq('trading_account_id', tradingAccountId);

      let netCashflow = 0;
      if (txRows) {
        for (const tx of txRows) {
          const amt = Number(tx.amount) || 0;
          if (tx.type === 'deposit') netCashflow += amt;
          else if (tx.type === 'withdrawal') netCashflow -= amt;
        }
      }

      // Baseline starting balance: brokerBalance - closedNetPnl - netCashflow
      // Result: currentBalance = startingBalance + netCashflow + closedNetPnl === brokerBalance
      const calibratedStartingBalance = Math.max(0, balance - totalClosedNetPnl - netCashflow);
      
      await supabase
        .from('trading_accounts')
        .update({
          starting_balance: calibratedStartingBalance.toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradingAccountId);
    } catch (calErr) {
      console.warn('Could not calibrate starting balance:', calErr);
    }
  }

  return { positionsCount, dealsCount, balance };
}
