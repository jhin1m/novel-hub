import { logRedisErrors } from '@novel-hub/core';
import { QUEUES } from '@novel-hub/shared';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { type JobDeps, routeJob } from './router';

/**
 * Worker cho queue `mail`, kèm log sự kiện. Log job lỗi chỉ ghi id, tên, số lần thử và
 * message; không ghi payload (URL có token).
 */
export function createMailWorker(connection: Redis, prefix: string, deps: JobDeps): Worker {
  const worker = new Worker(QUEUES.mail, (job) => routeJob(job, deps), { connection, prefix });
  logRedisErrors(connection, '[worker]', worker);
  worker.on('ready', () => {
    console.info(`[worker] ready, đang xử lý queue "${QUEUES.mail}"`);
  });
  worker.on('failed', (job, err) => {
    console.error(
      `[worker] job ${job?.id ?? '?'} (${job?.name ?? '?'}) lỗi lần ${job?.attemptsMade ?? '?'}:`,
      err.message,
    );
  });
  return worker;
}
