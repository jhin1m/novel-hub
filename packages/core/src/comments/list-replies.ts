import { type Db, comments, users } from '@novel-hub/db';
import { COMMENTS_PAGE_SIZE } from '@novel-hub/shared';
import { and, asc, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import {
  type CommentDto,
  type CommentViewer,
  commentColumns,
  toCommentDto,
  visibleCommentWhere,
} from './comment-dto';
import { commentKeysetWhere, decodeCommentCursor, encodeCommentCursor } from './comment-cursor';
import { findCommentTarget } from './comment-target';
import { matureCommentAccess } from './mature-comment-access';

export interface CommentRepliesPage {
  items: CommentDto[];
  nextCursor: string | null;
}

/**
 * The thread `commentId` names when anyone may see it (a top-level comment, shown, under a chapter
 * `canReadChapter` allows or in the discussion of a public story), with whether its story is 18+;
 * `null` for any other reason. The id alone must never open a hidden thread.
 */
async function isShownThread(
  db: Db,
  commentId: string,
): Promise<{ isMature: boolean; authorId: string } | null> {
  const thread = await findCommentTarget(db, commentId);
  if (!thread || thread.parentId !== null || !thread.shown || !thread.readable) return null;
  return { isMature: thread.isMature, authorId: thread.storyAuthorId };
}

/**
 * Visible replies of a shown thread, oldest first, a page at a time after `cursor`. A thread not
 * shown is `NOT_FOUND` before the 18+ check, so an 18+ story never tells hidden ids apart.
 */
export async function listCommentReplies(
  db: Db,
  viewer: CommentViewer,
  query: { commentId: string; cursor?: string | undefined },
): Promise<Result<CommentRepliesPage, 'NOT_FOUND' | 'MATURE_CONTENT_DISABLED'>> {
  const thread = await isShownThread(db, query.commentId);
  if (!thread) return err('NOT_FOUND');
  if (!(await matureCommentAccess(db, viewer?.id ?? null, thread.isMature, thread.authorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  const cursor = query.cursor ? decodeCommentCursor(query.cursor) : null;
  const rows = await db
    .select(commentColumns(users))
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.parentId, query.commentId),
        visibleCommentWhere(users),
        cursor ? commentKeysetWhere(cursor, 'after') : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(COMMENTS_PAGE_SIZE + 1);
  const page = rows.slice(0, COMMENTS_PAGE_SIZE);
  const last = page.at(-1);
  return ok({
    items: page.map((row) => toCommentDto(row, viewer)),
    nextCursor:
      rows.length > COMMENTS_PAGE_SIZE && last ? encodeCommentCursor(last.micros, last.id) : null,
  });
}
