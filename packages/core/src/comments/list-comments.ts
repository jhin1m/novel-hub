import { type Db, comments, users } from '@novel-hub/db';
import { COMMENTS_PAGE_SIZE, COMMENT_REPLY_PREVIEW } from '@novel-hub/shared';
import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type Result, err, ok } from '../lib/result';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import {
  type CommentRow,
  type CommentThreadDto,
  type CommentViewer,
  commentColumns,
  toCommentDto,
  visibleCommentWhere,
} from './comment-dto';
import {
  commentCreatedAtMicros,
  commentKeysetWhere,
  decodeCommentCursor,
  encodeCommentCursor,
} from './comment-cursor';
import { threadScopeWhere } from './paragraph-scope';

export interface ChapterCommentsPage {
  /**
   * Every comment shown under the chapter: visible threads and their visible replies. Only on the
   * first page (`null` after), so paging does not recount the whole chapter each time.
   */
  total: number | null;
  items: CommentThreadDto[];
  nextCursor: string | null;
}

/**
 * Visible top-level comments of a chapter in the list's scope (one paragraph, or the chapter's
 * own: see `threadScopeWhere`), the writer joined as `users`.
 */
function threadWhere(chapterId: string, paragraphId: string | undefined) {
  return and(
    eq(comments.chapterId, chapterId),
    isNull(comments.parentId),
    visibleCommentWhere(users),
    threadScopeWhere(chapterId, paragraphId),
  );
}

/**
 * Comments shown in a list (`threadWhere`). A reply counts only while its thread is shown: hiding
 * or deleting a top-level comment takes its whole thread out.
 */
async function countShown(
  db: Db,
  chapterId: string,
  paragraphId: string | undefined,
): Promise<number> {
  const reply = alias(comments, 'reply');
  const replyAuthor = alias(users, 'reply_author');
  const [threads, replies] = await Promise.all([
    db
      .select({ n: count() })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(threadWhere(chapterId, paragraphId)),
    db
      .select({ n: count() })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .innerJoin(reply, eq(reply.parentId, comments.id))
      .innerJoin(replyAuthor, eq(replyAuthor.id, reply.userId))
      .where(and(threadWhere(chapterId, paragraphId), visibleCommentWhere(replyAuthor, reply))),
  ]);
  return (threads[0]?.n ?? 0) + (replies[0]?.n ?? 0);
}

/** The oldest visible replies of each thread, with each thread's visible reply count. */
async function previewReplies(db: Db, threadIds: string[]) {
  if (threadIds.length === 0) return [];
  const ranked = db
    .select({
      ...commentColumns(users),
      micros: commentCreatedAtMicros.as('micros'),
      parentId: comments.parentId,
      rank: sql<number>`(row_number() over (partition by ${comments.parentId} order by ${comments.createdAt}, ${comments.id}))::int`.as(
        'rank',
      ),
      replyCount: sql<number>`(count(*) over (partition by ${comments.parentId}))::int`.as(
        'reply_count',
      ),
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(inArray(comments.parentId, threadIds), visibleCommentWhere(users)))
    .as('ranked');
  return db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, COMMENT_REPLY_PREVIEW))
    .orderBy(asc(ranked.parentId), asc(ranked.rank));
}

/**
 * One page of the comments under a readable chapter: threads newest first (keyset on
 * `(created_at, id)`), each with its reply count and oldest replies. With `paragraphId`, the
 * threads about that paragraph; without, the chapter's own (see `threadScopeWhere`). Comments of
 * banned accounts and hidden or deleted ones are left out. A chapter nobody may read is
 * `NOT_FOUND`.
 */
export async function listChapterComments(
  db: Db,
  viewer: CommentViewer,
  query: {
    publicId: string;
    number: number;
    paragraphId?: string | undefined;
    cursor?: string | undefined;
  },
): Promise<Result<ChapterCommentsPage, 'NOT_FOUND'>> {
  const ref = await findReadableChapterRef(db, query.publicId, query.number);
  if (!ref) return err('NOT_FOUND');
  const cursor = query.cursor ? decodeCommentCursor(query.cursor) : null;

  const [total, rows] = await Promise.all([
    cursor ? null : countShown(db, ref.chapterId, query.paragraphId),
    db
      .select({ ...commentColumns(users), paragraphId: comments.paragraphId })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(
        and(
          threadWhere(ref.chapterId, query.paragraphId),
          cursor ? commentKeysetWhere(cursor, 'before') : undefined,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(COMMENTS_PAGE_SIZE + 1),
  ]);
  const page: (CommentRow & { paragraphId: string | null })[] = rows.slice(0, COMMENTS_PAGE_SIZE);
  const replies = await previewReplies(
    db,
    page.map((row) => row.id),
  );

  const items = page.map((row): CommentThreadDto => {
    const own = replies.filter((reply) => reply.parentId === row.id);
    const replyCount = own[0]?.replyCount ?? 0;
    const last = own.at(-1);
    return {
      ...toCommentDto(row, viewer),
      // In the chapter's list, a paragraph id means the paragraph was edited out of the text.
      orphanedParagraph: query.paragraphId === undefined && row.paragraphId !== null,
      replyCount,
      replies: own.map((reply) => toCommentDto(reply, viewer)),
      moreRepliesCursor:
        last && replyCount > own.length ? encodeCommentCursor(last.micros, last.id) : null,
    };
  });
  const last = page.at(-1);
  return ok({
    total,
    items,
    nextCursor:
      rows.length > COMMENTS_PAGE_SIZE && last ? encodeCommentCursor(last.micros, last.id) : null,
  });
}
