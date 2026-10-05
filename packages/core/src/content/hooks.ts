import { CONTENT_JOBS, type ContentJobName } from '@novel-hub/shared';
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
 * A purge that gives up leaves hidden content on the CDN until `s-maxage` runs out, so it keeps
 * trying through a CDN outage of a few hours (10 s doubling: last attempt ≈ 2.8 h in).
 */
const PURGE_RETRY: ContentJob['opts'] = {
  attempts: 11,
  backoff: { type: 'exponential', delay: 10_000 },
};

/**
 * The jobs a change needs (CDN purge now; search sync and fingerprints join later). Pure, so the
 * mapping is unit tested without Redis. Every change touches cached public pages, so every change
 * purges; the job carries the change itself and resolves URLs from the current state.
 */
export function jobsForChange(change: ContentChange): ContentJob[] {
  const purge: ContentJob = { name: CONTENT_JOBS.purgeUrls, data: change, opts: PURGE_RETRY };
  switch (change.entity) {
    case 'story':
      return [purge];
    case 'chapter':
      return [purge];
    case 'user':
      return [purge];
    default: {
      const unhandled: never = change;
      throw new Error(`Unhandled content change ${JSON.stringify(unhandled)}`);
    }
  }
}
