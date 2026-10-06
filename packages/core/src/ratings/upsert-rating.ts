import { type Db, ratings } from '@novel-hub/db';
import type { RatingUpsertInput } from '@novel-hub/shared';
import { and, eq, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import type { CurrentUser } from '../users/current-user';
import { type MyRatingDto, findRateableStory, toMyRatingDto } from './rating-dto';

export type UpsertRatingError = 'NOT_FOUND' | 'FORBIDDEN' | 'USER_MUTED' | 'RATING_HIDDEN';

/**
 * Rates a story, or replaces the reader's earlier score and review (one rating per reader and
 * story). The review is already normalised by `ratingUpsertSchema`. Editing keeps `created_at` and
 * moves `updated_at`. An author does not rate their own story. A rating a moderator hid stays as it
 * is (`RATING_HIDDEN`): its row is locked first, and the update only applies to a visible one, so
 * neither an edit nor a race with the moderator brings it back.
 */
export async function upsertRating(
  db: Db,
  actor: CurrentUser,
  input: RatingUpsertInput,
): Promise<Result<MyRatingDto, UpsertRatingError>> {
  if (!canPostCommunityContent(actor)) {
    // An unverified email is refused by the route already; this is the second layer.
    return err(actor.status === 'muted' ? 'USER_MUTED' : 'FORBIDDEN');
  }
  const story = await findRateableStory(db, input.publicId);
  if (!story) return err('NOT_FOUND');
  if (story.authorId === actor.id) return err('FORBIDDEN');

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: ratings.status })
      .from(ratings)
      .where(and(eq(ratings.userId, actor.id), eq(ratings.storyId, story.id)))
      .for('update');
    if (existing && existing.status !== 'visible') return err('RATING_HIDDEN');
    const [row] = await tx
      .insert(ratings)
      .values({ userId: actor.id, storyId: story.id, score: input.score, review: input.review })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.storyId],
        set: { score: input.score, review: input.review, updatedAt: sql`now()` },
        setWhere: eq(ratings.status, 'visible'),
      })
      .returning({
        score: ratings.score,
        review: ratings.review,
        status: ratings.status,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
      });
    // No row back: it was inserted and hidden between the read and the write.
    if (!row) return err('RATING_HIDDEN');
    return ok(toMyRatingDto(row));
  });
}
