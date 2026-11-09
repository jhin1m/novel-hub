import { type Tx, comments, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * A moderator takes a pinned comment off the top of its chapter or discussion (`pinned_at = NULL`),
 * leaving the comment itself as it is, with its row locked. The rules for users apply to its
 * writer, as for hiding it. A comment that is not pinned is `INVALID_STATE`. Comments are never in
 * cached HTML, so nothing is purged.
 */
export async function unpinCommentAsMod(
  tx: Tx,
  actor: CurrentUser,
  commentId: string,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [comment] = await tx
    .select({
      id: comments.id,
      pinnedAt: comments.pinnedAt,
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
  if (comment.pinnedAt === null) return err('INVALID_STATE');

  await tx.update(comments).set({ pinnedAt: null }).where(eq(comments.id, comment.id));
  const target: ModerationTarget = { type: 'comment', id: comment.id };
  await logModerationAction(tx, actor, target, 'unpin_comment', note);
  return ok(target);
}
