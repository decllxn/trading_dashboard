import { inngest } from './inngest.ts';
import { syncAllActiveBrokerTrades } from './snaptrade.ts';
import { cron } from 'inngest';

export const syncTradesCron = inngest.createFunction(
  {
    id: 'sync-all-active-broker-trades-cron',
    triggers: [cron('0 */6 * * *')], // Runs every 6 hours
  },
  async ({ step }) => {
    const result = await step.run('sync-trades', async () => {
      return await syncAllActiveBrokerTrades();
    });

    return result;
  }
);
