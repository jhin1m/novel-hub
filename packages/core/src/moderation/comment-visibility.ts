import { type Tx, comments, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * Hides a visible comment (`visible → hidden_by_mod`, its thread goes with it) or restores a hidden
 * one, with the comment row locked. The rules for users apply to what they wrote: nobody moderates
 * their own comments, and a moderator leaves those of moderators and admins to an admin. A comment
 * its writer deleted stays deleted. Comments are never in cached HTML, so nothing is purged.
 */
export async function setCommentHidden(
  tx: Tx,
  actor: CurrentUser,
  commentId: string,
  hide: boolean,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [comment] = await tx
    .select({
      id: comments.id,
      status: comments.status,
      authorId: comments.userId,
      authorRole: users.role,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.id, commentId))
    .for('update', { of: comments });
  if (!comment) return err('NOT_FOUND');
  if (!canModerateUser(actor, { id: comment.authorId, role: comment.authorRole })) {
    return err('FORBIDDEN');
  }
  if (comment.status !== (hide ? 'visible' : 'hidden_by_mod')) return err('INVALID_STATE');

  await tx
    .update(comments)
    .set({ status: hide ? 'hidden_by_mod' : 'visible' })
    .where(eq(comments.id, comment.id));
  const target: ModerationTarget = { type: 'comment', id: comment.id };
  await logModerationAction(tx, actor, target, hide ? 'hide_comment' : 'restore_comment', note);
  return ok(target);
}
