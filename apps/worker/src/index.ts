import {
  cdnConfigFromEnv,
  createCdnPurger,
  createContentQueue,
  createMailer,
  createProducerConnection,
  createWorkerConnection,
  logRedisErrors,
  mailerConfigFromEnv,
} from '@novel-hub/core';
import { createDb } from '@novel-hub/db';
import { cdnEnvSchema, loadOptionalEnv, loadServerEnv } from '@novel-hub/shared/env';
import { createContentWorker } from './content-worker';
import { workerEnvSchema } from './env';
import { createMailWorker } from './mail-worker';
import {
  type PublishingQueue,
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
 * Registers the periodic jobs without holding up the boot; Redis being briefly unavailable only
 * delays the first sweep, it never leaves the worker without one.
 */
function registerSchedulersInBackground(queue: PublishingQueue): void {
  registerPublishingSchedulers(queue).catch((err: unknown) => {
    console.error(
      '[worker] could not register publishing schedulers, retrying:',
      err instanceof Error ? err.message : err,
    );
    setTimeout(() => registerSchedulersInBackground(queue), SCHEDULER_RETRY_MS).unref();
  });
}

function main(): void {
  // Env sai (gồm production thiếu SMTP) hoặc mailer không tạo được thì không khởi động.
  const env = loadServerEnv(workerEnvSchema);
  const mailer = createMailer(mailerConfigFromEnv(env));
  // Production without `CF_*` refuses to start (cached pages would never be purged); dev purges
  // nothing. `loadServerEnv` has loaded `.env` into `process.env` by now.
  const cdn = createCdnPurger(cdnConfigFromEnv(loadOptionalEnv(cdnEnvSchema, process.env, 'cdn')));
  // Small pool: one sweep and one drain at a time, plus a few content jobs.
  const { db, pool } = createDb(env.DATABASE_URL, { max: 5 });
  const connection = createWorkerConnection(env.REDIS_URL);
  // Queues use a connection without an offline queue: a refused `addBulk` leaves outbox events
  // pending for the next drain instead of piling up in memory.
  const producer = createProducerConnection(env.REDIS_URL);
  const contentQueue = createContentQueue(producer, env.QUEUE_PREFIX);
  const publishingQueue = createPublishingQueue(producer, env.QUEUE_PREFIX);
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
  });
  const mailWorker = createMailWorker(connection, env.QUEUE_PREFIX, { mailer });
  registerSchedulersInBackground(publishingQueue);

  // Workers first (running jobs finish and may still use the queues and the pool), then the rest.
  registerShutdown(
    [
      () => publishingWorker.close(),
      () => contentWorker.close(),
      () => mailWorker.close(),
      () => contentQueue.close(),
      () => publishingQueue.close(),
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
