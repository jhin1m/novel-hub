import { type Db, comments } from '@novel-hub/db';
import { and, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { CurrentUser } from '../users/current-user';

/**
 * The writer deletes their own visible comment (soft: `status = 'deleted'`, its thread goes with
 * it). Someone else's comment is `FORBIDDEN`: moderators hide comments through the moderation
 * actions instead. A comment already deleted or hidden is `NOT_FOUND`.
 */
export async function deleteComment(
  db: Db,
  actor: CurrentUser,
  commentId: string,
): Promise<Result<void, 'NOT_FOUND' | 'FORBIDDEN'>> {
  const deleted = await db
    .update(comments)
    .set({ status: 'deleted' })
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.userId, actor.id),
        eq(comments.status, 'visible'),
      ),
    )
    .returning({ id: comments.id });
  if (deleted.length > 0) return ok(undefined);
  const [row] = await db
    .select({ userId: comments.userId, status: comments.status })
    .from(comments)
    .where(eq(comments.id, commentId));
  if (!row || row.status !== 'visible') return err('NOT_FOUND');
  return err('FORBIDDEN');
}
