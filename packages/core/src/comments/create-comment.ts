import { type Db, comments, users } from '@novel-hub/db';
import type { CommentCreateInput } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import type { CurrentUser } from '../users/current-user';
import { type CommentDto, visibleCommentWhere } from './comment-dto';

export type CreateCommentError = 'NOT_FOUND' | 'INVALID_STATE' | 'USER_MUTED' | 'FORBIDDEN';

/** A shown comment of the chapter, with the thread it belongs to (itself when top-level). */
async function shownComment(db: Db, chapterId: string, id: string) {
  const [row] = await db
    .select({ id: comments.id, parentId: comments.parentId })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.id, id), eq(comments.chapterId, chapterId), visibleCommentWhere(users)));
  return row ?? null;
}

/**
 * The thread a reply goes into. Threads are two levels: replying to a reply attaches to its
 * top-level comment. `null` when the comment or its thread is not shown under this chapter.
 */
async function threadOf(db: Db, chapterId: string, parentId: string): Promise<string | null> {
  const parent = await shownComment(db, chapterId, parentId);
  if (!parent) return null;
  if (parent.parentId === null) return parent.id;
  const thread = await shownComment(db, chapterId, parent.parentId);
  return thread?.id ?? null;
}

/**
 * Posts a comment, or a reply when `parentId` is set, under a readable chapter. The text is already
 * normalised by `commentCreateSchema`. Not wrapped in a transaction: a thread hidden in between
 * only takes the new reply out with it.
 */
export async function createComment(
  db: Db,
  actor: CurrentUser,
  input: CommentCreateInput,
): Promise<Result<CommentDto, CreateCommentError>> {
  if (!canPostCommunityContent(actor)) {
    // An unverified email is refused by the route already; this is the second layer.
    return err(actor.status === 'muted' ? 'USER_MUTED' : 'FORBIDDEN');
  }
  const ref = await findReadableChapterRef(db, input.publicId, input.chapterNumber);
  if (!ref) return err('NOT_FOUND');
  let parentId: string | null = null;
  if (input.parentId) {
    parentId = await threadOf(db, ref.chapterId, input.parentId);
    if (!parentId) return err('INVALID_STATE');
  }
  const [row] = await db
    .insert(comments)
    .values({
      chapterId: ref.chapterId,
      storyId: ref.storyId,
      userId: actor.id,
      parentId,
      body: input.body,
    })
    .returning({ id: comments.id, createdAt: comments.createdAt });
  if (!row) throw new Error('comment insert returned nothing');
  return ok({
    id: row.id,
    body: input.body,
    createdAt: row.createdAt.toISOString(),
    author: { username: actor.username, displayName: actor.displayName },
    isOwn: true,
  });
}
