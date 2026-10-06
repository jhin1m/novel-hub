import { type Db, ratings, users } from '@novel-hub/db';
import { REVIEWS_PAGE_SIZE } from '@novel-hub/shared';
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { decodeCommentCursor, encodeCommentCursor } from '../comments/comment-cursor';
import { type Result, err, ok } from '../lib/result';
import {
  type RatingSummaryDto,
  type RatingViewer,
  type RatingsPageDto,
  type ReviewDto,
  findRateableStory,
  ratingKeysetBefore,
  ratingUpdatedAtMicros,
  visibleRatingWhere,
} from './rating-dto';

/**
 * Count, average and per-score distribution of the shown ratings of a story, in one `GROUP BY` of
 * at most five rows: computed on read, never stored, so it always leaves out hidden ratings and
 * banned writers.
 */
async function summarize(db: Db, storyId: string): Promise<RatingSummaryDto> {
  const rows = await db
    .select({ score: ratings.score, n: count() })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(and(eq(ratings.storyId, storyId), visibleRatingWhere()))
    .groupBy(ratings.score);
  const distribution: RatingSummaryDto['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows) {
    const score = row.score as keyof typeof distribution;
    distribution[score] = row.n;
    total += row.n;
    sum += row.score * row.n;
  }
  return {
    count: total,
    average: total === 0 ? null : Math.round((sum / total) * 10) / 10,
    distribution,
  };
}

/**
 * The ratings of a story for its page: the summary (first page only) and the shown ratings that
 * have a review, most recently updated first, `REVIEWS_PAGE_SIZE` at a time. A story nobody can
 * rate (not public, no chapter yet) is `NOT_FOUND`.
 */
export async function listStoryRatings(
  db: Db,
  viewer: RatingViewer,
  q: { publicId: string; cursor?: string },
): Promise<Result<RatingsPageDto, 'NOT_FOUND'>> {
  const story = await findRateableStory(db, q.publicId);
  if (!story) return err('NOT_FOUND');
  const cursor = q.cursor ? decodeCommentCursor(q.cursor) : null;

  const [summary, rows] = await Promise.all([
    cursor ? null : summarize(db, story.id),
    db
      .select({
        id: ratings.id,
        score: ratings.score,
        review: ratings.review,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
        micros: ratingUpdatedAtMicros,
        userId: ratings.userId,
        username: users.username,
        displayName: users.displayName,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(
        and(
          eq(ratings.storyId, story.id),
          visibleRatingWhere(),
          isNotNull(ratings.review),
          cursor ? ratingKeysetBefore(cursor) : undefined,
        ),
      )
      .orderBy(desc(ratings.updatedAt), desc(ratings.id))
      .limit(REVIEWS_PAGE_SIZE + 1),
  ]);

  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  const last = page.at(-1);
  const reviews = page.map((row): ReviewDto => ({
    id: row.id,
    score: row.score,
    review: row.review ?? '',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: { username: row.username, displayName: row.displayName },
    isOwn: viewer?.id === row.userId,
  }));
  return ok({
    summary,
    reviews,
    nextCursor:
      rows.length > REVIEWS_PAGE_SIZE && last ? encodeCommentCursor(last.micros, last.id) : null,
  });
}
