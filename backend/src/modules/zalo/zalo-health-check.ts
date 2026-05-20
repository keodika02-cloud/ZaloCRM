/**
 * zalo-health-check.ts — Cron-based health monitor for Zalo account connections.
 * Runs every 5 minutes to detect disconnected accounts and auto-reconnect them.
 * Also runs a daily session refresh at 04:00 UTC to keep cookies fresh.
 */
import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { zaloPool } from './zalo-pool.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

// zalo-health-check.ts improvements

export function startZaloHealthCheck(): void {
  // Every 2 minutes instead of 5 min
  cron.schedule('*/2 * * * *', async () => {
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: { sessionData: { not: Prisma.JsonNull } },
        select: { id: true, displayName: true, sessionData: true },
      });

      for (const acc of accounts) {
        const status = zaloPool.getStatus(acc.id);
        const instance = zaloPool.getInstance(acc.id);

        // Check 1: Completely disconnected
        if (status === 'disconnected') {
          logger.info(`[health-check] Reconnecting ${acc.displayName}...`);
          zaloPool.autoReconnect(acc.id).catch(err => {
            logger.warn(`[health-check] Reconnect failed:`, err);
          });
          continue;
        }

        // Check 2: Connected but idle >30 min (potential zombie)
        if (status === 'connected' && instance) {
          const idleMs = Date.now() - instance.lastActivity.getTime();
          if (idleMs > 30 * 60_000) {
            logger.warn(`[health-check] Account ${acc.id} idle ${Math.floor(idleMs / 1000)}s, pinging...`);
            try {
              // Ping to verify connection is alive
              await instance.api.getOwnId();
              instance.lastActivity = new Date();
            } catch (err) {
              logger.warn(`[health-check] Ping failed, reconnecting...`);
              zaloPool.autoReconnect(acc.id).catch(() => { });
            }
          }
        }
      }
    } catch (err) {
      logger.error('[health-check] Error:', err);
    }
  });

  // Twice daily refresh instead of once
  cron.schedule('0 4,16 * * *', async () => {
    logger.info('[health-check] Session refresh starting...');
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: { sessionData: { not: Prisma.JsonNull } },
        select: { id: true, sessionData: true },
      });

      for (const acc of accounts) {
        try {
          zaloPool.disconnect(acc.id);
          await new Promise(resolve => setTimeout(resolve, 5000));
          zaloPool.autoReconnect(acc.id);
          await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (err) {
          logger.error(`[health-check] Refresh failed for ${acc.id}:`, err);
        }
      }
    } catch (err) {
      logger.error('[health-check] Error during daily refresh:', err);
    }
  });
}