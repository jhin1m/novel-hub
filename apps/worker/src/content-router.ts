import { CONTENT_JOBS } from '@novel-hub/shared';
import { type Job, UnrecoverableError } from 'bullmq';
import { type PurgeUrlsDeps, processPurgeUrls } from './processors/purge-urls';
import { type SearchSyncDeps, processSearchSync } from './processors/search-sync';

/** Dependencies of `content` jobs. */
export type ContentJobDeps = PurgeUrlsDeps & SearchSyncDeps;

export type ContentJobRouter = (
  job: Pick<Job, 'name' | 'data'>,
  deps: ContentJobDeps,
) => Promise<void>;

/**
 * Picks the processor for a `content` job. Every processor must be idempotent (the outbox delivers
 * at least once) and bound outgoing requests to 10 s. Unknown names are
 * never retried.
 */
export const routeContentJob: ContentJobRouter = (job, deps) => {
  switch (job.name) {
    case CONTENT_JOBS.purgeUrls:
      return processPurgeUrls(job.data, deps);
    case CONTENT_JOBS.searchSync:
      return processSearchSync(job.data, deps);
    default:
      return Promise.reject(new UnrecoverableError(`no processor for job "${job.name}"`));
  }
};
