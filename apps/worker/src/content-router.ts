import type { Db } from '@novel-hub/core';
import { type Job, UnrecoverableError } from 'bullmq';

/** Dependencies of `content` jobs; CDN and search clients join as their jobs are added. */
export interface ContentJobDeps {
  db: Db;
}

export type ContentJobRouter = (
  job: Pick<Job, 'name' | 'data'>,
  deps: ContentJobDeps,
) => Promise<void>;

/**
 * Picks the processor for a `content` job. Every processor must be idempotent (the outbox delivers
 * at least once) and bound outgoing requests with `AbortSignal.timeout(10_000)`. No content job
 * exists yet, so every name is unknown and never retried.
 */
export const routeContentJob: ContentJobRouter = (job) =>
  Promise.reject(new UnrecoverableError(`no processor for job "${job.name}"`));
