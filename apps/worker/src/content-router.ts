import { CONTENT_JOBS } from '@novel-hub/shared';
import { type Job, UnrecoverableError } from 'bullmq';
import { type PurgeUrlsDeps, processPurgeUrls } from './processors/purge-urls';

/** Dependencies of `content` jobs; the search client joins with its job. */
export type ContentJobDeps = PurgeUrlsDeps;

export type ContentJobRouter = (
  job: Pick<Job, 'name' | 'data'>,
  deps: ContentJobDeps,
) => Promise<void>;

/**
 * Picks the processor for a `content` job. Every processor must be idempotent (the outbox delivers
 * at least once) and bound outgoing requests with `AbortSignal.timeout(10_000)`. Unknown names are
 * never retried.
 */
export const routeContentJob: ContentJobRouter = (job, deps) => {
  switch (job.name) {
    case CONTENT_JOBS.purgeUrls:
      return processPurgeUrls(job.data, deps);
    default:
      return Promise.reject(new UnrecoverableError(`no processor for job "${job.name}"`));
  }
};
