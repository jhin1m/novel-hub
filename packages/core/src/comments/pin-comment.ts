import { type Db, type Tx, comments, users } from '@novel-hub/db';
import { COMMENT_PIN_MAX } from '@novel-hub/shared';
import { and, count, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPinComment } from '../policies/comment';
import type { StoryActor } from '../policies/story';
import { type CommentScope, commentScopeWhere, findCommentTarget } from './comment-target';

export type PinCommentError = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'COMMENT_PIN_LIMIT';

function scopeLockKey(scope: CommentScope): string {
  return `comment-pin:${'chapterId' in scope ? scope.chapterId : scope.storyId}`;
}

/**
 * Pins taken in a scope. Hiding a comment, banning its writer and deleting it all drop the pin, so
 * only comments still pinned count; a restored comment comes back unpinned.
 */
async function pinsTaken(db: Db | Tx, scope: CommentScope): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(comments)
    .where(
      and(commentScopeWhere(scope), isNotNull(comments.pinnedAt), ne(comments.status, 'deleted')),
    );
  return row?.n ?? 0;
}

/**
 * The story's author pins (`pinned`) a top-level comment on top of a chapter's comments or of the
 * story's discussion, or unpins it. At most `COMMENT_PIN_MAX` per scope: the count and the update
 * run under a transaction-scoped advisory lock on the scope, so concurrent pins never pass it.
 * Replies and comments about a paragraph are `INVALID_STATE`. Pinning a pinned comment, or
 * unpinning one that is not, changes nothing. Moderators unpin from the moderation queue instead.
 */
export async function setCommentPinned(
  db: Db,
  actor: StoryActor,
  commentId: string,
  pinned: boolean,
): Promise<Result<{ pinnedAt: string | null }, PinCommentError>> {
  const target = await findCommentTarget(db, commentId);
  // A comment nobody may see (hidden, or under a chapter or story nobody may read) stays
  // unpinnable by the author, so it can free its place; nobody else learns it exists.
  const isAuthor = target !== null && actor.id === target.storyAuthorId;
  const visible = target !== null && target.shown && target.readable;
  if (!target || target.status === 'deleted' || (!visible && (pinned || !isAuthor))) {
    return err('NOT_FOUND');
  }
  if (!canPinComment(actor, { authorId: target.storyAuthorId })) return err('FORBIDDEN');
  if (target.parentId !== null || target.paragraphId !== null) return err('INVALID_STATE');

  if (!pinned) {
    await db.update(comments).set({ pinnedAt: null }).where(eq(comments.id, commentId));
    return ok({ pinnedAt: null });
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${scopeLockKey(target.scope)}, 0))`,
    );
    // Row lock: a moderator hiding the comment, or banning its writer, at the same moment waits
    // (both drop the pin), so the update below never pins it again after they did.
    const [current] = await tx
      .select({ pinnedAt: comments.pinnedAt, status: comments.status })
      .from(comments)
      .where(eq(comments.id, commentId))
      .for('update');
    if (!current || current.status !== 'visible') return err('NOT_FOUND');
    if (current.pinnedAt) return ok({ pinnedAt: current.pinnedAt.toISOString() });
    if ((await pinsTaken(tx, target.scope)) >= COMMENT_PIN_MAX) return err('COMMENT_PIN_LIMIT');
    const [row] = await tx
      .update(comments)
      .set({ pinnedAt: sql`now()` })
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.status, 'visible'),
          isNull(comments.pinnedAt),
          sql`not exists (select 1 from ${users} where ${users.id} = ${comments.userId} and ${users.status} = 'banned')`,
        ),
      )
      .returning({ pinnedAt: comments.pinnedAt });
    if (!row?.pinnedAt) return err('NOT_FOUND');
    return ok({ pinnedAt: row.pinnedAt.toISOString() });
  });
}
