import {
  CONTENT_JOBS,
  type ContentJobName,
  type FingerprintChapterPayload,
  type SearchSyncPayload,
} from '@novel-hub/shared';
import type { JobsOptions } from 'bullmq';
import { z } from 'zod';

/**
 * A change to publicly visible content, recorded in the outbox (`content_events`) inside the
 * transaction that made it. Ids only: consumers re-read the current state, never trust a payload.
 */
export type ContentChange =
  | {
      entity: 'story';
      action: 'published' | 'updated' | 'hidden' | 'restored';
      storyId: string;
      /** Slug before a rename, so the old URLs can be purged too. */
      previousSlug?: string;
      /** Canonical tag slugs before the tags changed, so the tag pages it left are purged too. */
      previousTagSlugs?: string[];
    }
  | {
      entity: 'chapter';
      action: 'published' | 'updated' | 'deleted' | 'hidden' | 'restored';
      storyId: string;
      chapterId: string;
      chapterNumber: number;
      contentHash?: string;
    }
  | { entity: 'user'; action: 'updated' | 'banned' | 'unbanned'; userId: string };

export const contentChangeSchema: z.ZodType<ContentChange> = z.discriminatedUnion('entity', [
  z.object({
    entity: z.literal('story'),
    action: z.enum(['published', 'updated', 'hidden', 'restored']),
    storyId: z.uuid(),
    previousSlug: z.string().min(1).optional(),
    previousTagSlugs: z.array(z.string().min(1)).max(50).optional(),
  }),
  z.object({
    entity: z.literal('chapter'),
    action: z.enum(['published', 'updated', 'deleted', 'hidden', 'restored']),
    storyId: z.uuid(),
    chapterId: z.uuid(),
    chapterNumber: z.number().int().positive(),
    contentHash: z.string().min(1).optional(),
  }),
  z.object({
    entity: z.literal('user'),
    action: z.enum(['updated', 'banned', 'unbanned']),
    userId: z.uuid(),
  }),
]);

/**
 * A job for the `content` queue. Deliberately no `jobId`: the outbox delivers at least once, and a
 * fixed id would silently swallow a legitimate later job for the same entity.
 */
export interface ContentJob {
  name: ContentJobName;
  data: unknown;
  /** Retry overrides on top of the queue defaults; never a `jobId`. */
  opts?: Pick<JobsOptions, 'attempts' | 'backoff'>;
}

/**
 * A purge or search sync that gives up leaves hidden content on the CDN (until `s-maxage` runs out)
 * or in search (until a reindex), so both keep trying through an outage of a few hours (10 s
 * doubling: last attempt ≈ 2.8 h in).
 */
const OUTAGE_RETRY: ContentJob['opts'] = {
  attempts: 11,
  backoff: { type: 'exponential', delay: 10_000 },
};

const searchSync = (data: SearchSyncPayload): ContentJob => ({
  name: CONTENT_JOBS.searchSync,
  data,
  opts: OUTAGE_RETRY,
});

/**
 * The jobs a change needs (CDN purge, search sync, duplicate check). Pure, so the mapping is unit
 * tested without Redis. Every change touches cached public pages, so every change purges; the job
 * carries the change itself and resolves URLs from the current state. Every change also resyncs
 * search: a chapter moves its story's counters, a user change their name or ban. Chapter content
 * that went public (first publish or republish) is fingerprinted; a missed run is caught by the
 * hourly backfill, so the default retries are enough.
 */
export function jobsForChange(change: ContentChange): ContentJob[] {
  const purge: ContentJob = { name: CONTENT_JOBS.purgeUrls, data: change, opts: OUTAGE_RETRY };
  switch (change.entity) {
    case 'story':
      return [purge, searchSync({ kind: 'story', storyId: change.storyId })];
    case 'chapter': {
      const jobs = [purge, searchSync({ kind: 'story', storyId: change.storyId })];
      if (change.action === 'published' || change.action === 'updated') {
        const data: FingerprintChapterPayload = { chapterId: change.chapterId };
        jobs.push({ name: CONTENT_JOBS.fingerprintChapter, data });
      }
      return jobs;
    }
    case 'user':
      return [purge, searchSync({ kind: 'user', userId: change.userId })];
    default: {
      const unhandled: never = change;
      throw new Error(`Unhandled content change ${JSON.stringify(unhandled)}`);
    }
  }
}
