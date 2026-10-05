import { logRedisErrors } from '@novel-hub/core';
import { QUEUES } from '@novel-hub/shared';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { type ContentJobDeps, routeContentJob } from './content-router';

/** Content jobs are I/O bound (CDN, search), so a few run at once. */
const CONTENT_CONCURRENCY = 4;

/** Worker for the `content` queue. Failure logs carry ids and messages, never payloads. */
export function createContentWorker(
  connection: Redis,
  prefix: string,
  deps: ContentJobDeps,
): Worker {
  const worker = new Worker(QUEUES.content, (job) => routeContentJob(job, deps), {
    connection,
    prefix,
    concurrency: CONTENT_CONCURRENCY,
  });
  logRedisErrors(connection, `[worker:${QUEUES.content}]`, worker);
  worker.on('failed', (job, err) => {
    console.error(
      `[worker:${QUEUES.content}] job ${job?.id ?? '?'} (${job?.name ?? '?'}) failed, attempt ${job?.attemptsMade ?? '?'}:`,
      err.message,
    );
  });
  return worker;
}
