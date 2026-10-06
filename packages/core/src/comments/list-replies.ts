import { type Db, chapters, comments, stories, users } from '@novel-hub/db';
import { COMMENTS_PAGE_SIZE } from '@novel-hub/shared';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { canReadChapter } from '../access/can-read-chapter';
import { type Result, err, ok } from '../lib/result';
import {
  type CommentDto,
  type CommentViewer,
  commentColumns,
  toCommentDto,
  visibleCommentWhere,
} from './comment-dto';
import { commentKeysetWhere, decodeCommentCursor, encodeCommentCursor } from './comment-cursor';

export interface CommentRepliesPage {
  items: CommentDto[];
  nextCursor: string | null;
}

/**
 * Whether `commentId` is a thread anyone may see: a top-level comment, visible, its writer not
 * banned, under a chapter `canReadChapter` allows. The id alone must never open a hidden thread.
 */
async function isShownThread(db: Db, commentId: string): Promise<boolean> {
  const threadAuthor = alias(users, 'thread_author');
  const [row] = await db
    .select({
      parentId: comments.parentId,
      status: comments.status,
      threadAuthorStatus: threadAuthor.status,
      chapterStatus: chapters.status,
      deletedAt: chapters.deletedAt,
      visibility: stories.visibility,
      authorStatus: users.status,
    })
    .from(comments)
    .innerJoin(threadAuthor, eq(threadAuthor.id, comments.userId))
    .innerJoin(chapters, eq(chapters.id, comments.chapterId))
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(eq(comments.id, commentId));
  if (!row || row.parentId !== null || row.status !== 'visible') return false;
  if (row.threadAuthorStatus === 'banned') return false;
  return canReadChapter(null, {
    status: row.chapterStatus,
    deletedAt: row.deletedAt,
    story: { visibility: row.visibility, authorStatus: row.authorStatus },
  }).readable;
}

/** Visible replies of a shown thread, oldest first, a page at a time after `cursor`. */
export async function listCommentReplies(
  db: Db,
  viewer: CommentViewer,
  query: { commentId: string; cursor?: string | undefined },
): Promise<Result<CommentRepliesPage, 'NOT_FOUND'>> {
  if (!(await isShownThread(db, query.commentId))) return err('NOT_FOUND');
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
