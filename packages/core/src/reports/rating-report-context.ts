import { type Db, ratings, stories, users } from '@novel-hub/db';
import type { RatingStatus } from '@novel-hub/shared';
import { eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  COMMENT_EXCERPT_MAX,
  type StoryContext,
  type UserContext,
  storyColumns,
  toStoryContext,
} from './report-context';

/** A reported rating: its score, the start of its review, its state and its writer. */
export interface RatingContext {
  /** For the hide/restore actions: a rating has no public key. Never shown. */
  id: string;
  score: number;
  /** `null` when the rating has no review. */
  excerpt: string | null;
  /** The review is longer than the excerpt. */
  truncated: boolean;
  status: RatingStatus;
  writer: UserContext;
}

export interface RatingWithStory {
  story: StoryContext;
  rating: RatingContext;
}

/** Ratings by internal id with their story, whatever their state. */
export async function loadRatingContexts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, RatingWithStory>> {
  if (ids.length === 0) return new Map();
  const writer = alias(users, 'writer');
  const rows = await db
    .select({
      id: ratings.id,
      score: ratings.score,
      review: ratings.review,
      status: ratings.status,
      writerUsername: writer.username,
      writerDisplayName: writer.displayName,
      writerRole: writer.role,
      writerStatus: writer.status,
      ...storyColumns,
    })
    .from(ratings)
    .innerJoin(writer, eq(writer.id, ratings.userId))
    .innerJoin(stories, eq(stories.id, ratings.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(inArray(ratings.id, [...ids]));
  return new Map(
    rows.map((row) => {
      const chars = row.review === null ? null : [...row.review];
      return [
        row.id,
        {
          story: toStoryContext(row),
          rating: {
            id: row.id,
            score: row.score,
            excerpt: chars ? chars.slice(0, COMMENT_EXCERPT_MAX).join('') : null,
            truncated: !!chars && chars.length > COMMENT_EXCERPT_MAX,
            status: row.status as RatingStatus,
            writer: {
              username: row.writerUsername,
              displayName: row.writerDisplayName,
              role: row.writerRole,
              status: row.writerStatus,
            },
          },
        },
      ];
    }),
  );
}
