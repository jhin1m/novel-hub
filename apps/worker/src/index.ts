import {
  cdnConfigFromEnv,
  createCdnPurger,
  createContentQueue,
  createMailer,
  createProducerConnection,
  createSearchCtx,
  createWorkerConnection,
  logRedisErrors,
  mailerConfigFromEnv,
} from '@novel-hub/core';
import { createDb } from '@novel-hub/db';
import {
  assertMeiliMasterKeyStrength,
  cdnEnvSchema,
  loadOptionalEnv,
  loadServerEnv,
  meiliWorkerEnvSchema,
} from '@novel-hub/shared/env';
import { createContentWorker } from './content-worker';
import { workerEnvSchema } from './env';
import { createMailWorker } from './mail-worker';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  registerMaintenanceSchedulers,
} from './maintenance-worker';
import {
  type SearchWriter,
  applySearchSettingsAtBoot,
  createSearchWriter,
} from './processors/search-sync';
import {
  createPublishingQueue,
  createPublishingWorker,
  registerPublishingSchedulers,
} from './publishing-worker';
import { registerShutdown } from './shutdown';

/** Thời gian chờ job đang chạy xong khi tắt (ms). */
const SHUTDOWN_TIMEOUT_MS = 30_000;
/** Wait before trying again to register the periodic jobs after a Redis error (ms). */
const SCHEDULER_RETRY_MS = 30_000;

/**
 * Registers a queue's periodic jobs without holding up the boot; Redis being briefly unavailable
 * only delays the first run, it never leaves the worker without one.
 */
function registerSchedulersInBackground(label: string, register: () => Promise<void>): void {
  register().catch((err: unknown) => {
    console.error(
      `[worker] could not register ${label} schedulers, retrying:`,
      err instanceof Error ? err.message : err,
    );
    setTimeout(() => registerSchedulersInBackground(label, register), SCHEDULER_RETRY_MS).unref();
  });
}

/** Writer for the search indexes, or `null` when `MEILI_*` is missing outside production. */
function searchWriterFromEnv(prefix: string): SearchWriter | null {
  const meili = loadOptionalEnv(meiliWorkerEnvSchema, process.env, 'meili');
  if (!meili) return null;
  assertMeiliMasterKeyStrength(meili, process.env.NODE_ENV);
  return createSearchWriter(
    createSearchCtx({ url: meili.MEILI_URL, apiKey: meili.MEILI_MASTER_KEY, prefix }),
  );
}

function main(): void {
  // Env sai (gồm production thiếu SMTP) hoặc mailer không tạo được thì không khởi động.
  const env = loadServerEnv(workerEnvSchema);
  const mailer = createMailer(mailerConfigFromEnv(env));
  // Production without `CF_*` refuses to start (cached pages would never be purged); dev purges
  // nothing. `loadServerEnv` has loaded `.env` into `process.env` by now.
  const cdn = createCdnPurger(cdnConfigFromEnv(loadOptionalEnv(cdnEnvSchema, process.env, 'cdn')));
  // Same rule for search: production requires the master key, dev without it skips search jobs.
  const search = searchWriterFromEnv(env.QUEUE_PREFIX);
  // Small pool: one sweep and one drain at a time, plus a few content jobs and one maintenance job.
  const { db, pool } = createDb(env.DATABASE_URL, { max: 5 });
  const connection = createWorkerConnection(env.REDIS_URL);
  // Queues use a connection without an offline queue: a refused `addBulk` leaves outbox events
  // pending for the next drain instead of piling up in memory.
  const producer = createProducerConnection(env.REDIS_URL);
  const contentQueue = createContentQueue(producer, env.QUEUE_PREFIX);
  const publishingQueue = createPublishingQueue(producer, env.QUEUE_PREFIX);
  const maintenanceQueue = createMaintenanceQueue(producer, env.QUEUE_PREFIX);
  const statsRedis = createWorkerConnection(env.REDIS_URL);
  logRedisErrors(statsRedis, '[redis:stats]');

  const publishingWorker = createPublishingWorker(connection, env.QUEUE_PREFIX, {
    db,
    contentQueue,
    statsRedis,
    queuePrefix: env.QUEUE_PREFIX,
  });
  const contentWorker = createContentWorker(connection, env.QUEUE_PREFIX, {
    db,
    cdn,
    appUrl: env.APP_URL,
    search,
  });
  const mailWorker = createMailWorker(connection, env.QUEUE_PREFIX, { mailer });
  const maintenanceWorker = createMaintenanceWorker(connection, env.QUEUE_PREFIX, {
    db,
    statsRedis,
    queuePrefix: env.QUEUE_PREFIX,
  });
  registerSchedulersInBackground('publishing', () => registerPublishingSchedulers(publishingQueue));
  registerSchedulersInBackground('maintenance', () =>
    registerMaintenanceSchedulers(maintenanceQueue),
  );
  // In the background: a slow or down Meilisearch never holds up the other jobs.
  void applySearchSettingsAtBoot(search);

  // Workers first (running jobs finish and may still use the queues and the pool), then the rest.
  registerShutdown(
    [
      () => publishingWorker.close(),
      () => contentWorker.close(),
      () => mailWorker.close(),
      () => maintenanceWorker.close(),
      () => contentQueue.close(),
      () => publishingQueue.close(),
      () => maintenanceQueue.close(),
      () => pool.end(),
      () => Promise.resolve(producer.disconnect()),
      () => Promise.resolve(statsRedis.disconnect()),
      () => Promise.resolve(connection.disconnect()),
    ],
    {
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
      exit: (code) => process.exit(code),
    },
  );

  process.on('unhandledRejection', (reason) => {
    console.error(
      '[worker] unhandledRejection:',
      reason instanceof Error ? reason.message : reason,
    );
  });
}

try {
  main();
} catch (err) {
  console.error('[worker] không khởi động được:', err instanceof Error ? err.message : err);
  process.exit(1);
}
