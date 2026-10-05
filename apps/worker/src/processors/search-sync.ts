import {
  type Db,
  type SearchCtx,
  ensureSearchSettings,
  syncStoryAndAuthor,
  syncUserContent,
} from '@novel-hub/core';
import { searchSyncPayload } from '@novel-hub/shared';
import { UnrecoverableError } from 'bullmq';

/** Writes to the search indexes with the master key; settings are applied before the first write. */
export interface SearchWriter {
  ctx: SearchCtx;
  ensureReady: () => Promise<void>;
}

/**
 * Applies the index settings lazily, once, so a Meilisearch that is down at boot never stops the
 * worker: a failed attempt is forgotten and the next job tries again.
 */
export function createSearchWriter(ctx: SearchCtx): SearchWriter {
  let ready: Promise<void> | undefined;
  return {
    ctx,
    ensureReady: () => {
      ready ??= ensureSearchSettings(ctx).catch((error: unknown) => {
        ready = undefined;
        throw error;
      });
      return ready;
    },
  };
}

export interface SearchSyncDeps {
  db: Db;
  /** `null` when `MEILI_*` is not configured (dev only): jobs are skipped, `pnpm search:reindex` catches up. */
  search: SearchWriter | null;
}

let warnedDisabled = false;

/**
 * Resyncs the search docs of a story (and its author) or of a user, from the current database
 * state, so a repeated or late run is harmless. Meilisearch errors and timeouts throw, and BullMQ
 * retries; a malformed payload is never retried.
 */
export async function processSearchSync(data: unknown, deps: SearchSyncDeps): Promise<void> {
  const parsed = searchSyncPayload.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('malformed search-sync payload');
  if (!deps.search) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        '[search-sync] search is not configured; skipping (run `pnpm search:reindex` later)',
      );
    }
    return;
  }
  await deps.search.ensureReady();
  const payload = parsed.data;
  if (payload.kind === 'story') {
    await syncStoryAndAuthor(deps.db, deps.search.ctx, payload.storyId);
  } else {
    await syncUserContent(deps.db, deps.search.ctx, payload.userId);
  }
}
