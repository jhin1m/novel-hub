import type { ContentJobName } from '@novel-hub/shared';
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
}

/**
 * The jobs a change needs (CDN purge, search sync, fingerprint...). Pure, so the mapping is unit
 * tested without Redis. No content job exists yet, so every change maps to nothing.
 */
export function jobsForChange(change: ContentChange): ContentJob[] {
  switch (change.entity) {
    case 'story':
      return [];
    case 'chapter':
      return [];
    case 'user':
      return [];
    default: {
      const unhandled: never = change;
      throw new Error(`Unhandled content change ${JSON.stringify(unhandled)}`);
    }
  }
}
