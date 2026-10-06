import { type Tx, ratings, users } from '@novel-hub/db';
import { eq, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * Hides a visible rating (`visible → hidden_by_mod`: its score leaves the summary, its review the
 * list) or restores a hidden one, with the rating row locked. The rules for users apply to what
 * they wrote: nobody moderates their own rating, and a moderator leaves those of moderators and
 * admins to an admin. While hidden, its writer can neither edit nor delete it. Ratings are never in
 * cached HTML, so nothing is purged.
 */
export async function setRatingHidden(
  tx: Tx,
  actor: CurrentUser,
  ratingId: string,
  hide: boolean,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [rating] = await tx
    .select({
      id: ratings.id,
      status: ratings.status,
      authorId: ratings.userId,
      authorRole: users.role,
    })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.id, ratingId))
    .for('update', { of: ratings });
  if (!rating) return err('NOT_FOUND');
  if (!canModerateUser(actor, { id: rating.authorId, role: rating.authorRole })) {
    return err('FORBIDDEN');
  }
  if (rating.status !== (hide ? 'visible' : 'hidden_by_mod')) return err('INVALID_STATE');

  // `updated_at` stays: it orders the review list and marks a review its writer edited, and a
  // moderator's action is neither.
  await tx
    .update(ratings)
    .set({ status: hide ? 'hidden_by_mod' : 'visible', updatedAt: sql`${ratings.updatedAt}` })
    .where(eq(ratings.id, rating.id));
  const target: ModerationTarget = { type: 'rating', id: rating.id };
  await logModerationAction(tx, actor, target, hide ? 'hide_rating' : 'restore_rating', note);
  return ok(target);
}
