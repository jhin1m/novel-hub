import { type ContentQueue, type Db, logRedisErrors } from '@novel-hub/core';
import { PUBLISHING_JOBS, type PublishingJobName, QUEUES } from '@novel-hub/shared';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { processBackfillFingerprints } from './processors/backfill-fingerprints';
import { processDrainContentEvents } from './processors/drain-content-events';
import { processFlushViewCounters } from './processors/flush-view-counters';
import { processSweepScheduledChapters } from './processors/sweep-scheduled-chapters';

export interface PublishingJobDeps {
  db: Db;
  contentQueue: Pick<ContentQueue, 'addBulk'>;
  /** Plain connection for the view counters (the BullMQ one is reserved for blocking commands). */
  statsRedis: Redis;
  queuePrefix: string;
}

export type PublishingQueue = Queue<unknown, void, PublishingJobName>;

/** How often each periodic job runs (ms). */
export const PUBLISHING_INTERVALS: Record<PublishingJobName, number> = {
  [PUBLISHING_JOBS.sweepScheduledChapters]: 60_000,
  [PUBLISHING_JOBS.drainContentEvents]: 5_000,
  // Up to 5 minutes of reads may be lost if Redis dies; accepted.
  [PUBLISHING_JOBS.flushViewCounters]: 300_000,
  // Catches fingerprints missed by the outbox path (failed jobs, lost Redis, older chapters).
  [PUBLISHING_JOBS.backfillFingerprints]: 3_600_000,
};

export function routePublishingJob(job: Pick<Job, 'name'>, deps: PublishingJobDeps): Promise<void> {
  switch (job.name) {
    case PUBLISHING_JOBS.sweepScheduledChapters:
      return processSweepScheduledChapters(deps);
    case PUBLISHING_JOBS.drainContentEvents:
      return processDrainContentEvents(deps);
    case PUBLISHING_JOBS.flushViewCounters:
      return processFlushViewCounters(deps);
    case PUBLISHING_JOBS.backfillFingerprints:
      return processBackfillFingerprints(deps).then(() => undefined);
    default:
      return Promise.reject(new UnrecoverableError(`no processor for job "${job.name}"`));
  }
}

/**
 * Worker for the internal periodic jobs. Its own queue keeps the sweeper and the outbox drain from
 * waiting behind slow content jobs. Two slots so a long sweep never delays the drain.
 */
export function createPublishingWorker(
  connection: Redis,
  prefix: string,
  deps: PublishingJobDeps,
): Worker {
  const worker = new Worker(QUEUES.publishing, (job) => routePublishingJob(job, deps), {
    connection,
    prefix,
    concurrency: 2,
  });
  logRedisErrors(connection, `[worker:${QUEUES.publishing}]`, worker);
  worker.on('failed', (job, err) => {
    console.error(`[worker:${QUEUES.publishing}] ${job?.name ?? '?'} failed:`, err.message);
  });
  return worker;
}

export function createPublishingQueue(connection: Redis, prefix: string): PublishingQueue {
  const queue: PublishingQueue = new Queue(QUEUES.publishing, { connection, prefix });
  logRedisErrors(connection, `[queue:${QUEUES.publishing}]`, queue);
  return queue;
}

/**
 * Creates (or updates) the repeatable jobs; idempotent, so every worker start calls it. Each run
 * is attempted once: the next run comes a few seconds later anyway.
 */
export async function registerPublishingSchedulers(queue: PublishingQueue): Promise<void> {
  for (const name of Object.values(PUBLISHING_JOBS)) {
    await queue.upsertJobScheduler(
      name,
      { every: PUBLISHING_INTERVALS[name] },
      {
        name,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { count: 100 } },
      },
    );
  }
}
