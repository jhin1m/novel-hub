import { type Db, ratings, stories } from '@novel-hub/db';
import { and, eq, inArray } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { CurrentUser } from '../users/current-user';

/** The reader's ratings of the story `publicId` (at most one), as a condition on `ratings`. */
function ownRatingWhere(db: Db, actor: CurrentUser, publicId: string) {
  return and(
    eq(ratings.userId, actor.id),
    inArray(
      ratings.storyId,
      db.select({ id: stories.id }).from(stories).where(eq(stories.publicId, publicId)),
    ),
  );
}

/**
 * The reader deletes their own rating of a story (the row goes; rating again starts afresh). Works
 * whatever state the story is in now. A rating a moderator hid cannot be deleted (`RATING_HIDDEN`),
 * so deleting and rating again never brings a hidden review back. No rating is `NOT_FOUND`.
 */
export async function deleteRating(
  db: Db,
  actor: CurrentUser,
  publicId: string,
): Promise<Result<void, 'NOT_FOUND' | 'RATING_HIDDEN'>> {
  const deleted = await db
    .delete(ratings)
    .where(and(ownRatingWhere(db, actor, publicId), eq(ratings.status, 'visible')))
    .returning({ id: ratings.id });
  if (deleted.length > 0) return ok(undefined);
  const [row] = await db
    .select({ status: ratings.status })
    .from(ratings)
    .where(ownRatingWhere(db, actor, publicId));
  return err(row ? 'RATING_HIDDEN' : 'NOT_FOUND');
}
