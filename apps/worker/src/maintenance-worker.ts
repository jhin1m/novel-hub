import { type Db, logRedisErrors } from '@novel-hub/core';
import {
  MAINTENANCE_JOBS,
  type MaintenanceJobName,
  QUEUES,
  RANKING_RULES,
} from '@novel-hub/shared';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { processPruneNotifications } from './processors/prune-notifications';
import { processRecomputeRankings } from './processors/recompute-rankings';

export interface MaintenanceJobDeps {
  db: Db;
  /** Connection the rankings are written on (the stats connection of the view counters). */
  statsRedis: Redis;
  /** Same prefix the web reads rankings and counts reads under (`QUEUE_PREFIX`). */
  queuePrefix: string;
}

export type MaintenanceQueue = Queue<unknown, void, MaintenanceJobName>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How often each periodic job runs (ms). */
export const MAINTENANCE_INTERVALS: Record<MaintenanceJobName, number> = {
  [MAINTENANCE_JOBS.pruneNotifications]: DAY_MS,
  [MAINTENANCE_JOBS.recomputeRankings]: RANKING_RULES.refreshMinutes * 60_000,
};

export function routeMaintenanceJob(
  job: Pick<Job, 'name'>,
  deps: MaintenanceJobDeps,
): Promise<void> {
  switch (job.name) {
    case MAINTENANCE_JOBS.pruneNotifications:
      return processPruneNotifications(deps);
    case MAINTENANCE_JOBS.recomputeRankings:
      return processRecomputeRankings(deps);
    default:
      return Promise.reject(new UnrecoverableError(`no processor for job "${job.name}"`));
  }
}

/**
 * Worker for heavy periodic housekeeping. Its own queue and a single slot, so a long run never
 * takes the `publishing` slots the sweeper and the outbox drain need, and never runs twice at once.
 */
export function createMaintenanceWorker(
  connection: Redis,
  prefix: string,
  deps: MaintenanceJobDeps,
): Worker {
  const worker = new Worker(QUEUES.maintenance, (job) => routeMaintenanceJob(job, deps), {
    connection,
    prefix,
    concurrency: 1,
  });
  logRedisErrors(connection, `[worker:${QUEUES.maintenance}]`, worker);
  worker.on('failed', (job, err) => {
    console.error(`[worker:${QUEUES.maintenance}] ${job?.name ?? '?'} failed:`, err.message);
  });
  return worker;
}

export function createMaintenanceQueue(connection: Redis, prefix: string): MaintenanceQueue {
  const queue: MaintenanceQueue = new Queue(QUEUES.maintenance, { connection, prefix });
  logRedisErrors(connection, `[queue:${QUEUES.maintenance}]`, queue);
  return queue;
}

/**
 * Creates (or updates) the repeatable jobs; idempotent, so every worker start calls it. A failed
 * run is not retried: the next one comes on schedule and picks up where it left off.
 */
export async function registerMaintenanceSchedulers(queue: MaintenanceQueue): Promise<void> {
  for (const name of Object.values(MAINTENANCE_JOBS)) {
    await queue.upsertJobScheduler(
      name,
      { every: MAINTENANCE_INTERVALS[name] },
      {
        name,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: { count: 100 } },
      },
    );
  }
}
