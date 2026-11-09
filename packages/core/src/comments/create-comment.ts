import { type Db, chapterContents, comments, users } from '@novel-hub/db';
import type { CommentCreateInput } from '@novel-hub/shared';
import { type SQL, and, arrayContains, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import type { CurrentUser } from '../users/current-user';
import { type CommentDto, visibleCommentWhere } from './comment-dto';
import { type CommentScope, commentScopeWhere } from './comment-target';
import { matureCommentAccess } from './mature-comment-access';

export type CreateCommentError =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'USER_MUTED'
  | 'FORBIDDEN'
  | 'COMMENT_PARAGRAPH_INVALID'
  | 'MATURE_CONTENT_DISABLED';

/** A shown comment of `scope`, with the thread it belongs to (itself when top-level). */
async function shownComment(db: Db, scope: SQL, id: string) {
  const [row] = await db
    .select({ id: comments.id, parentId: comments.parentId, paragraphId: comments.paragraphId })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.id, id), scope, visibleCommentWhere(users)));
  return row ?? null;
}

/**
 * The thread a reply goes into, with the paragraph it is about. Threads are two levels: replying to
 * a reply attaches to its top-level comment. `null` when the comment or its thread is not shown
 * in this scope (the chapter, or the story's discussion), so a reply never joins another one's.
 */
export async function threadOf(db: Db, scope: CommentScope, parentId: string) {
  const where = commentScopeWhere(scope);
  const parent = await shownComment(db, where, parentId);
  if (!parent || parent.parentId === null) return parent;
  return shownComment(db, where, parent.parentId);
}

/** What a writer gets back for the comment they just posted. */
export function newCommentDto(
  actor: CurrentUser,
  row: { id: string; createdAt: Date },
  body: string,
): CommentDto {
  return {
    id: row.id,
    body,
    createdAt: row.createdAt.toISOString(),
    author: { username: actor.username, displayName: actor.displayName },
    isOwn: true,
    pinnedAt: null,
    editedAt: null,
  };
}

/** Whether `pid` is a paragraph (or heading) of the chapter's published text. */
async function isPublishedParagraph(db: Db, chapterId: string, pid: string): Promise<boolean> {
  const [row] = await db
    .select({ chapterId: chapterContents.chapterId })
    .from(chapterContents)
    .where(
      and(
        eq(chapterContents.chapterId, chapterId),
        arrayContains(chapterContents.paragraphIds, [pid]),
      ),
    );
  return row !== undefined;
}

/**
 * Posts a comment, or a reply when `parentId` is set, under a readable chapter. The text is already
 * normalised by `commentCreateSchema`. Under an 18+ story only for an account that turned 18+ on
 * (checked after the account may post and the chapter is readable). A top-level comment may be
 * about a paragraph of the published text (`paragraphId`); a reply is about its thread's, whatever
 * the client sent. Not wrapped in a transaction: a thread hidden in between only takes the new reply out with it.
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
  if (!(await matureCommentAccess(db, actor.id, ref.isMature, ref.authorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  let parentId: string | null = null;
  let paragraphId: string | null = null;
  if (input.parentId) {
    const thread = await threadOf(db, { chapterId: ref.chapterId }, input.parentId);
    if (!thread) return err('INVALID_STATE');
    parentId = thread.id;
    paragraphId = thread.paragraphId;
  } else if (input.paragraphId) {
    if (!(await isPublishedParagraph(db, ref.chapterId, input.paragraphId))) {
      return err('COMMENT_PARAGRAPH_INVALID');
    }
    paragraphId = input.paragraphId;
  }
  const [row] = await db
    .insert(comments)
    .values({
      chapterId: ref.chapterId,
      storyId: ref.storyId,
      userId: actor.id,
      parentId,
      paragraphId,
      body: input.body,
    })
    .returning({ id: comments.id, createdAt: comments.createdAt });
  if (!row) throw new Error('comment insert returned nothing');
  return ok(newCommentDto(actor, row, input.body));
}
