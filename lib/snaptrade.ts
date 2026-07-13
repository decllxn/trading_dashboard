import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { Snaptrade } from 'snaptrade-typescript-sdk';
import { db, brokerConnections, snaptradeUsers, trades } from '../db/index.ts';
import { dedupeTrades, type ExistingTrade, type BuiltTrade } from './csv-mapping.ts';
import { computeRMultiple } from './trades.ts';

interface SnaptradeCredentials {
  userId: string;
  userSecret: string;
}

interface SnaptradeAccount {
  id: string;
  brokerage_authorization: string;
  institution_name: string;
  status?: 'open' | 'closed' | 'archived' | null;
  sync_status?: {
    holdings?: { last_successful_sync?: string | null };
  };
}

interface SnaptradeAuthorization {
  id?: string;
  disabled?: boolean;
  brokerage?: { name?: string };
}

export class SnaptradeConfigurationError extends Error {}

function getSnaptradeClient(): Snaptrade {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!clientId || !consumerKey) {
    throw new SnaptradeConfigurationError(
      'SnapTrade credentials are not configured on the server.',
    );
  }

  return new Snaptrade({ clientId, consumerKey });
}

function requireDatabase() {
  if (!db) {
    throw new SnaptradeConfigurationError(
      'Database access is required to connect a brokerage account.',
    );
  }

  return db;
}

async function findSnaptradeUser(userId: string) {
  const database = requireDatabase();
  const [record] = await database
    .select()
    .from(snaptradeUsers)
    .where(eq(snaptradeUsers.userId, userId))
    .limit(1);

  return record;
}

/** Registers a SnapTrade identity once and keeps its secret server-side. */
export async function ensureSnaptradeUser(
  userId: string,
): Promise<SnaptradeCredentials> {
  const existing = await findSnaptradeUser(userId);
  if (existing)
    return { userId: existing.userId, userSecret: existing.userSecret };

  const client = getSnaptradeClient();
  const { data } = await client.authentication.registerSnapTradeUser({
    userId,
  });
  if (!data.userSecret) {
    throw new Error('SnapTrade did not return a user secret.');
  }

  const database = requireDatabase();
  const [stored] = await database
    .insert(snaptradeUsers)
    .values({ userId: data.userId ?? userId, userSecret: data.userSecret })
    .onConflictDoNothing()
    .returning();

  if (stored) return { userId: stored.userId, userSecret: stored.userSecret };

  const concurrentRecord = await findSnaptradeUser(userId);
  if (!concurrentRecord) {
    throw new Error('Unable to securely store the SnapTrade user secret.');
  }

  return {
    userId: concurrentRecord.userId,
    userSecret: concurrentRecord.userSecret,
  };
}

/** Creates a short-lived Connection Portal URL for a read-only brokerage link. */
export async function createConnectionPortalUrl(
  credentials: SnaptradeCredentials,
  callbackUrl: string,
): Promise<string> {
  const client = getSnaptradeClient();
  const { data } = await client.authentication.loginSnapTradeUser({
    ...credentials,
    immediateRedirect: true,
    customRedirect: callbackUrl,
    darkMode: true,
    connectionPortalVersion: 'v4',
  });

  if (!('redirectURI' in data) || !data.redirectURI) {
    throw new Error('SnapTrade did not return a Connection Portal URL.');
  }

  return data.redirectURI;
}

function toConnectionStatus(
  account: SnaptradeAccount,
  authorization: SnaptradeAuthorization | undefined,
) {
  if (
    authorization?.disabled ||
    account.status === 'closed' ||
    account.status === 'archived'
  ) {
    return 'disconnected' as const;
  }

  return 'active' as const;
}

function lastSyncedAt(account: SnaptradeAccount): Date {
  const value = account.sync_status?.holdings?.last_successful_sync;
  if (!value) return new Date();

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date() : date;
}

/**
 * Reads SnapTrade's current account and connection state and persists each
 * brokerage account in broker_connections.
 */
export async function syncSnaptradeAccounts(userId: string): Promise<number> {
  const storedUser = await findSnaptradeUser(userId);
  if (!storedUser) {
    throw new Error('No SnapTrade user is registered for this account.');
  }

  const credentials = {
    userId: storedUser.userId,
    userSecret: storedUser.userSecret,
  };
  const client = getSnaptradeClient();
  const [{ data: authorizations }, { data: accounts }] = await Promise.all([
    client.connections.listBrokerageAuthorizations(credentials),
    client.accountInformation.listUserAccounts(credentials),
  ]);
  const authorizationsById = new Map(
    (authorizations as SnaptradeAuthorization[])
      .filter((authorization) => authorization.id)
      .map((authorization) => [authorization.id!, authorization]),
  );
  const database = requireDatabase();

  for (const account of accounts as SnaptradeAccount[]) {
    const authorization = authorizationsById.get(
      account.brokerage_authorization,
    );
    const brokerName =
      account.institution_name || authorization?.brokerage?.name;
    if (!brokerName) continue;

    await database
      .insert(brokerConnections)
      .values({
        userId,
        provider: 'snaptrade',
        externalAccountId: account.id,
        brokerName,
        status: toConnectionStatus(account, authorization),
        lastSyncedAt: lastSyncedAt(account),
      })
      .onConflictDoUpdate({
        target: [
          brokerConnections.userId,
          brokerConnections.provider,
          brokerConnections.externalAccountId,
        ],
        set: {
          brokerName,
          status: toConnectionStatus(account, authorization),
          lastSyncedAt: lastSyncedAt(account),
        },
      });
  }

  return accounts.length;
}

/**
 * Normalizes SnapTrade activities into standard BuiltTrade records.
 * Uses a FIFO matching queue per security/ticker symbol to resolve buys and sells
 * into closed trades, leaving unmatched legs as open trades.
 */
export function matchActivitiesToTrades(activities: any[]): BuiltTrade[] {
  // 1. Filter to buys/sells and normalize fields
  const validActs = activities
    .filter((act) => {
      const type = act.type?.toUpperCase();
      const hasSymbol = act.option_symbol?.ticker || act.symbol?.symbol || act.symbol?.raw_symbol;
      return (type === 'BUY' || type === 'SELL') && act.trade_date && hasSymbol;
    })
    .map((act) => {
      const type = act.type.toUpperCase() as 'BUY' | 'SELL';
      const instrument = (act.option_symbol?.ticker || act.symbol?.symbol || act.symbol?.raw_symbol || '').trim();
      
      let assetClass: 'equity' | 'crypto' | 'futures' | 'forex' | 'option' = 'equity';
      if (act.option_symbol) {
        assetClass = 'option';
      } else if (act.symbol?.type?.code === 'crypto') {
        assetClass = 'crypto';
      } else if (act.symbol?.type?.code === 'futures') {
        assetClass = 'futures';
      } else if (act.symbol?.type?.code === 'forex' || act.symbol?.type?.code === 'fx') {
        assetClass = 'forex';
      }

      const units = Number(act.units ?? 0);
      const price = Number(act.price ?? 0);
      const rawAmount = act.amount != null ? Number(act.amount) : null;
      const multiplier = act.option_symbol ? 100 : 1;
      const estAmount = units * price * multiplier;
      // Buy is cash outflow (negative), Sell is cash inflow (positive)
      const amount = rawAmount !== null ? rawAmount : (type === 'BUY' ? -estAmount : estAmount);

      return {
        id: act.id,
        type,
        instrument,
        assetClass,
        units,
        price,
        amount,
        tradeDate: act.trade_date as string,
      };
    });

  // Sort chronologically (oldest first)
  validActs.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

  // Group by instrument
  const groups: Record<string, typeof validActs> = {};
  for (const act of validActs) {
    if (!groups[act.instrument]) {
      groups[act.instrument] = [];
    }
    groups[act.instrument].push(act);
  }

  const builtTrades: BuiltTrade[] = [];

  // FIFO matching per instrument
  for (const instrument in groups) {
    const acts = groups[instrument];
    const assetClass = acts[0].assetClass;

    const longQueue: typeof validActs = [];
    const shortQueue: typeof validActs = [];

    for (const act of acts) {
      let unitsLeft = act.units;

      if (act.type === 'BUY') {
        // Match against shortQueue (covering short positions)
        while (unitsLeft > 0.000001 && shortQueue.length > 0) {
          const firstShort = shortQueue[0];
          const matchedUnits = Math.min(unitsLeft, firstShort.units);

          const entryVal = (firstShort.amount / firstShort.units) * matchedUnits;
          const exitVal = (act.amount / act.units) * matchedUnits;
          const pnl = entryVal + exitVal;

          builtTrades.push({
            instrument,
            assetClass,
            direction: 'short',
            status: 'closed',
            entryPrice: firstShort.price,
            exitPrice: act.price,
            size: matchedUnits,
            stopPrice: null,
            targetPrice: null,
            entryTime: firstShort.tradeDate,
            exitTime: act.tradeDate,
            pnl,
          });

          unitsLeft -= matchedUnits;
          firstShort.units -= matchedUnits;
          firstShort.amount -= entryVal;

          if (firstShort.units <= 0.000001) {
            shortQueue.shift();
          }
        }

        // If there's still units left, we add to longQueue
        if (unitsLeft > 0.000001) {
          longQueue.push({
            ...act,
            units: unitsLeft,
          });
        }
      } else {
        // type === 'SELL'
        // Match against longQueue (closing long positions)
        while (unitsLeft > 0.000001 && longQueue.length > 0) {
          const firstLong = longQueue[0];
          const matchedUnits = Math.min(unitsLeft, firstLong.units);

          const entryVal = (firstLong.amount / firstLong.units) * matchedUnits;
          const exitVal = (act.amount / act.units) * matchedUnits;
          const pnl = entryVal + exitVal;

          builtTrades.push({
            instrument,
            assetClass,
            direction: 'long',
            status: 'closed',
            entryPrice: firstLong.price,
            exitPrice: act.price,
            size: matchedUnits,
            stopPrice: null,
            targetPrice: null,
            entryTime: firstLong.tradeDate,
            exitTime: act.tradeDate,
            pnl,
          });

          unitsLeft -= matchedUnits;
          firstLong.units -= matchedUnits;
          firstLong.amount -= entryVal;

          if (firstLong.units <= 0.000001) {
            longQueue.shift();
          }
        }

        // If there's still units left, we add to shortQueue
        if (unitsLeft > 0.000001) {
          shortQueue.push({
            ...act,
            units: unitsLeft,
          });
        }
      }
    }

    // Leftover open long positions
    for (const leftLong of longQueue) {
      if (leftLong.units > 0.000001) {
        builtTrades.push({
          instrument,
          assetClass,
          direction: 'long',
          status: 'open',
          entryPrice: leftLong.price,
          exitPrice: null,
          size: leftLong.units,
          stopPrice: null,
          targetPrice: null,
          entryTime: leftLong.tradeDate,
          exitTime: null,
          pnl: null,
        });
      }
    }

    // Leftover open short positions
    for (const leftShort of shortQueue) {
      if (leftShort.units > 0.000001) {
        builtTrades.push({
          instrument,
          assetClass,
          direction: 'short',
          status: 'open',
          entryPrice: leftShort.price,
          exitPrice: null,
          size: leftShort.units,
          stopPrice: null,
          targetPrice: null,
          entryTime: leftShort.tradeDate,
          exitTime: null,
          pnl: null,
        });
      }
    }
  }

  return builtTrades;
}

/**
 * Synchronizes historical activities/trades for all active SnapTrade broker connections of a user.
 * Pulls activities, normalizes them, filters duplicates, and inserts the new ones.
 * If targetAccountId is provided, only syncs that specific connection.
 */
export async function syncBrokerTrades(
  userId: string,
  targetAccountId?: string,
): Promise<{ syncedAccountsCount: number; insertedCount: number; duplicatesCount: number }> {
  const database = requireDatabase();
  const storedUser = await findSnaptradeUser(userId);
  if (!storedUser) {
    throw new Error('No SnapTrade user is registered for this account.');
  }

  const credentials = {
    userId: storedUser.userId,
    userSecret: storedUser.userSecret,
  };

  // Find all active SnapTrade connections for the user
  const allConnections = await database
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.userId, userId),
        eq(brokerConnections.provider, 'snaptrade'),
        eq(brokerConnections.status, 'active'),
      ),
    );

  const connections = targetAccountId
    ? allConnections.filter((c) => c.id === targetAccountId || c.externalAccountId === targetAccountId)
    : allConnections;

  if (connections.length === 0) {
    return { syncedAccountsCount: 0, insertedCount: 0, duplicatesCount: 0 };
  }

  const client = getSnaptradeClient();
  let totalInserted = 0;
  let totalDuplicates = 0;

  for (const conn of connections) {
    if (!conn.externalAccountId) continue;

    // Fetch activities with pagination (limit 1000)
    let offset = 0;
    const limit = 1000;
    const allActivities: any[] = [];

    while (true) {
      const response = await client.accountInformation.getAccountActivities({
        userId: credentials.userId,
        userSecret: credentials.userSecret,
        accountId: conn.externalAccountId,
        offset,
        limit,
      });

      const page = response.data;
      const data = (page as any)?.data ?? [];
      if (data.length === 0) break;
      allActivities.push(...data);
      if (data.length < limit) break;
      offset += limit;
    }

    if (allActivities.length === 0) continue;

    // Normalize activities into BuiltTrade shape
    const normalizedTrades = matchActivitiesToTrades(allActivities);

    // Fetch existing trades to deduplicate
    const existingRows = await database
      .select({
        instrument: trades.instrument,
        size: trades.size,
        entryTime: trades.entryTime,
      })
      .from(trades)
      .where(eq(trades.userId, userId));

    const existing: ExistingTrade[] = existingRows.map((r) => ({
      instrument: r.instrument,
      size: r.size ? Number(r.size) : null,
      entryTime: r.entryTime ? r.entryTime.toISOString() : null,
    }));

    // Deduplicate
    const { newTrades, duplicates } = dedupeTrades(normalizedTrades, existing);

    totalDuplicates += duplicates.length;

    if (newTrades.length > 0) {
      const rowsToInsert = newTrades.map((t) => {
        const rMult = computeRMultiple(t.entryPrice, t.stopPrice, t.exitPrice, t.direction);
        return {
          userId,
          instrument: t.instrument,
          assetClass: t.assetClass,
          direction: t.direction,
          status: t.status,
          source: 'snaptrade' as const,
          entryPrice: t.entryPrice ? String(t.entryPrice) : null,
          exitPrice: t.exitPrice ? String(t.exitPrice) : null,
          size: t.size ? String(t.size) : null,
          stopPrice: t.stopPrice ? String(t.stopPrice) : null,
          targetPrice: t.targetPrice ? String(t.targetPrice) : null,
          entryTime: t.entryTime ? new Date(t.entryTime) : null,
          exitTime: t.exitTime ? new Date(t.exitTime) : null,
          pnl: t.pnl ? String(t.pnl) : null,
          rMultiple: rMult ? String(rMult) : null,
          brokerConnectionId: conn.id,
        };
      });

      await database.insert(trades).values(rowsToInsert);
      totalInserted += rowsToInsert.length;
    }

    // Update connection lastSyncedAt
    await database
      .update(brokerConnections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(brokerConnections.id, conn.id));
  }

  return {
    syncedAccountsCount: connections.length,
    insertedCount: totalInserted,
    duplicatesCount: totalDuplicates,
  };
}

/**
 * Verifies the signature of an incoming SnapTrade webhook request.
 * The signature is an HMAC-SHA256 hash of the raw request body,
 * using the SNAPTRADE_CONSUMER_KEY as the secret.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!consumerKey || !signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', consumerKey);
  hmac.update(rawBody);
  const computedSignature = hmac.digest('base64');

  return computedSignature === signatureHeader;
}

/**
 * Background worker function that finds all active SnapTrade broker connections
 * in the system and runs a trades sync for each of them.
 */
export async function syncAllActiveBrokerTrades(): Promise<{
  processedConnectionsCount: number;
  totalInsertedCount: number;
  totalDuplicatesCount: number;
}> {
  const database = requireDatabase();

  const activeConnections = await database
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.provider, 'snaptrade'),
        eq(brokerConnections.status, 'active'),
      ),
    );

  let processedCount = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;

  for (const conn of activeConnections) {
    try {
      const result = await syncBrokerTrades(conn.userId, conn.id);
      totalInserted += result.insertedCount;
      totalDuplicates += result.duplicatesCount;
      processedCount++;
    } catch (error) {
      console.error(`Failed to background sync broker connection ${conn.id} for user ${conn.userId}:`, error);
      // Mark connection status as error if it fails (e.g. auth expired)
      await database
        .update(brokerConnections)
        .set({ status: 'error' })
        .where(eq(brokerConnections.id, conn.id));
    }
  }

  return {
    processedConnectionsCount: processedCount,
    totalInsertedCount: totalInserted,
    totalDuplicatesCount: totalDuplicates,
  };
}
