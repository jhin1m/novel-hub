import { type Db, ratings, stories, users } from '@novel-hub/db';
import type { RatingStatus } from '@novel-hub/shared';
import { type SQL, and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { publicStoryWhere } from '../catalog/story-card';
import type { CommentCursor } from '../comments/comment-cursor';

/** The reader's own rating of a story, hidden or not, so the form can say it is hidden. */
export interface MyRatingDto {
  score: number;
  review: string | null;
  status: RatingStatus;
  createdAt: string;
  updatedAt: string;
}

/** A rating with a review as readers get it: no user id; `isOwn` is decided on the server. */
export interface ReviewDto {
  /** Internal id, used by the report call; the UI never shows it. */
  id: string;
  score: number;
  review: string;
  createdAt: string;
  updatedAt: string;
  author: { username: string; displayName: string };
  isOwn: boolean;
}

/** Count of shown ratings per score, with their average rounded to one decimal. */
export interface RatingSummaryDto {
  count: number;
  /** `null` while nobody rated. */
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface RatingsPageDto {
  /** Only on the first page (`null` after), so paging does not regroup the story each time. */
  summary: RatingSummaryDto | null;
  reviews: ReviewDto[];
  nextCursor: string | null;
}

/** Who is reading: the session's user id, or `null` for a guest. */
export type RatingViewer = { id: string } | null;

/** `updated_at` in microseconds since the epoch, exact, as text (the review list's cursor). */
export const ratingUpdatedAtMicros = sql<string>`(extract(epoch from ${ratings.updatedAt}) * 1000000)::bigint::text`;

/** `(updated_at, id)` before the cursor, for the newest-first review list. */
export function ratingKeysetBefore(cursor: CommentCursor): SQL {
  const at = sql`timestamptz 'epoch' + ${cursor.micros}::bigint * interval '1 microsecond'`;
  return sql`(${ratings.updatedAt}, ${ratings.id}) < (${at}, ${cursor.id}::uuid)`;
}

/**
 * A rating anyone may see: not hidden by a moderator, and its writer (joined as `users`) not banned
 * (banning hides everything an account wrote without deleting it).
 */
export function visibleRatingWhere(): SQL {
  return and(eq(ratings.status, 'visible'), ne(users.status, 'banned')) as SQL;
}

/**
 * A story that can be rated, and whose ratings can be listed: public (18+ included: whoever rates it
 * has already opened its page), with at least one published chapter to have read.
 */
export async function findRateableStory(
  db: Db,
  publicId: string,
): Promise<{ id: string; authorId: string } | null> {
  const [story] = await db
    .select({ id: stories.id, authorId: stories.authorId })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(
      and(
        eq(stories.publicId, publicId),
        publicStoryWhere({ includeMature: true }),
        isNotNull(stories.lastChapterAt),
      ),
    )
    .limit(1);
  return story ?? null;
}

export function toMyRatingDto(row: {
  score: number;
  review: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): MyRatingDto {
  return {
    score: row.score,
    review: row.review,
    status: row.status as RatingStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
