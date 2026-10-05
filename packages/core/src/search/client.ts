import { type EnqueuedTaskPromise, Meilisearch } from 'meilisearch';

/** Bound on every HTTP request to Meilisearch, so a hung instance never holds a request or a job. */
export const SEARCH_REQUEST_TIMEOUT_MS = 10_000;

/** How long a write waits for its task to finish (indexing is asynchronous on Meilisearch). */
const TASK_WAIT_MS = 30_000;

/** Characters Meilisearch accepts in an index uid. */
const INDEX_PREFIX = /^[a-zA-Z0-9_-]{1,32}$/;

export interface SearchIndexNames {
  stories: string;
  authors: string;
}

/** A Meilisearch client and the indexes it works on; one per key (search-only for the web). */
export interface SearchCtx {
  client: Meilisearch;
  names: SearchIndexNames;
}

/**
 * Index names under `prefix` (the queue prefix: `novelhub` in dev, `e2e`, a random one in tests),
 * so environments sharing one Meilisearch never mix. Throws at startup on a prefix that is not a
 * valid index uid.
 */
export function searchIndexNames(prefix: string): SearchIndexNames {
  if (!INDEX_PREFIX.test(prefix)) {
    throw new Error(
      'QUEUE_PREFIX is not usable as a Meilisearch index prefix ([a-zA-Z0-9_-]{1,32})',
    );
  }
  return { stories: `${prefix}_stories`, authors: `${prefix}_authors` };
}

export function createSearchCtx(cfg: { url: string; apiKey: string; prefix: string }): SearchCtx {
  return {
    client: new Meilisearch({
      host: cfg.url,
      apiKey: cfg.apiKey,
      timeout: SEARCH_REQUEST_TIMEOUT_MS,
      defaultWaitOptions: { timeout: TASK_WAIT_MS, interval: 100 },
    }),
    names: searchIndexNames(cfg.prefix),
  };
}

/**
 * Waits for a write task and fails unless it succeeded: a failed task does not reject the request
 * that enqueued it, so without this check a bad write would pass silently.
 */
export async function waitForTask(enqueued: EnqueuedTaskPromise, what: string): Promise<void> {
  const task = await enqueued.waitTask();
  if (task.status !== 'succeeded') {
    throw new Error(
      `Meilisearch task "${what}" ${task.status}: ${task.error?.code ?? 'no error code'}`,
    );
  }
}
