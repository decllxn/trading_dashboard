import { redirect } from 'next/navigation';
import { StartingBalanceForm } from './starting-balance-form';
import { BreakevenThresholdForm } from './breakeven-threshold-form';
import { createServerClient } from '@/lib/supabase';
import { resolveStartingBalance, resolveBreakevenThreshold } from '@/lib/stats';
import { ConnectBrokerModal } from '@/components/settings/connect-broker-modal';
import { PurgeDetailsButton } from '@/components/settings/purge-details-button';

interface SettingsPageProps {
  searchParams: { broker?: string };
}

interface BrokerConnectionRow {
  id: string;
  provider: 'snaptrade' | 'manual';
  external_account_id: string | null;
  broker_name: string;
  status: 'active' | 'error' | 'disconnected';
  last_synced_at: string | null;
}

const brokerMessages: Record<string, string> = {
  connected: 'Brokerage accounts were connected and recorded.',
  pending:
    'The connection completed. SnapTrade is still preparing its account data.',
  'sync-error':
    'The portal returned, but account details could not be synchronized.',
  unavailable:
    'Broker connections are unavailable. Check the server configuration.',
  signin: 'Sign in again to finish synchronizing the brokerage connection.',
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not yet synchronized';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function statusLabel(status: BrokerConnectionRow['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'disconnected') return 'Reconnect required';
  return 'Sync error';
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: connections } = await supabase
    .from('broker_connections')
    .select(
      'id, provider, external_account_id, broker_name, status, last_synced_at',
    )
    .order('created_at', { ascending: false });
  const { data: settingsRow } = supabase
    ? await supabase
        .from('user_settings')
        .select('starting_balance, breakeven_threshold')
        .maybeSingle()
    : { data: null };
  const startingBalanceValue = String(
    resolveStartingBalance(
      (settingsRow as { starting_balance: string | null } | null)?.starting_balance ?? null,
    ),
  );
  const breakevenThresholdValue = String(
    resolveBreakevenThreshold(
      (settingsRow as { breakeven_threshold: string | null } | null)?.breakeven_threshold ?? null,
    ),
  );
  const brokerMessage = searchParams.broker
    ? brokerMessages[searchParams.broker]
    : undefined;

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="border-b border-hairline pb-6">
        <p className="text-xs uppercase tracking-wide text-tertiary">
          System configuration
        </p>
        <h1 className="mt-2 font-display text-2xl text-primary">Settings</h1>
      </header>

      <section className="mt-6 rounded-card border border-hairline bg-surface">
        <div className="flex flex-col gap-4 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-primary">
              Broker connections
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              Connect a brokerage through SnapTrade to add its accounts to your
              workspace.
            </p>
          </div>
          <ConnectBrokerModal userId={user.id} />
        </div>

        {brokerMessage ? (
          <p
            className="border-b border-hairline px-5 py-3 text-sm text-secondary"
            role="status"
          >
            {brokerMessage}
          </p>
        ) : null}

        {(connections as BrokerConnectionRow[] | null)?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-hairline font-display text-xs uppercase tracking-wide text-tertiary">
                <tr>
                  <th className="px-5 py-3 font-medium">Broker</th>
                  <th className="px-5 py-3 text-right font-medium">
                    Account reference
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    Last synchronized
                  </th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(connections as BrokerConnectionRow[]).map((connection) => (
                  <tr
                    key={connection.id}
                    className="border-b border-hairline last:border-b-0"
                  >
                    <td className="px-5 py-4 text-primary">
                      {connection.broker_name}
                    </td>
                    <td className="num px-5 py-4 text-right text-secondary">
                      {connection.external_account_id ?? 'Manual'}
                    </td>
                    <td className="num px-5 py-4 text-right text-secondary">
                      {formatTimestamp(connection.last_synced_at)}
                    </td>
                    <td className="px-5 py-4 text-right text-secondary">
                      <span className="inline-flex items-center gap-2">
                        {connection.status === 'active' ? (
                          <span
                            className="h-1.5 w-1.5 bg-accent-signal"
                            aria-hidden="true"
                          />
                        ) : null}
                        {statusLabel(connection.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-secondary">
            No brokerage accounts connected.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-card border border-hairline bg-surface">
        <div className="border-b border-hairline p-5">
          <h2 className="font-display text-lg text-primary">
            Account
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Set the capital you started trading with. The dashboard equity curve
            plots this baseline plus your cumulative closed-trade P&amp;L.
          </p>
        </div>
        <div className="p-5">
          <StartingBalanceForm defaultValue={startingBalanceValue} />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-hairline bg-surface">
        <div className="border-b border-hairline p-5">
          <h2 className="font-display text-lg text-primary">
            Break Even Threshold
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Categorize small gains and losses within a small dollar range (e.g. ±$5.00) as Break Even trades so your win rate and loss rate reflect true trading edge rather than noise.
          </p>
        </div>
        <div className="p-5">
          <BreakevenThresholdForm defaultValue={breakevenThresholdValue} />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-hairline bg-surface">
        <div className="border-b border-hairline p-5">
          <h2 className="font-display text-lg text-primary">
            Database Maintenance
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Purge exact numeric details like entry, stop, and exit prices, sizes, and PnL values for all your trades, while keeping your charts, annotations, images, and daily journal entry notes intact.
          </p>
        </div>
        <div className="p-5">
          <PurgeDetailsButton />
        </div>
      </section>
    </main>
  );
}
