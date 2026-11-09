import { type Db, comments, users } from '@novel-hub/db';
import { COMMENTS_PAGE_SIZE, COMMENT_PIN_MAX, COMMENT_REPLY_PREVIEW } from '@novel-hub/shared';
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { canPinComment } from '../policies/comment';
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

/** One page of a list of threads: a chapter's, a paragraph's, or the story discussion's. */
export interface CommentThreadsPage {
  /**
   * Every comment shown in the list (pinned threads included): visible threads and their visible
   * replies. Only on the first page (`null` after), so paging does not recount the list each time.
   */
  total: number | null;
  /** Pinned threads, oldest pin first; only on the first page (empty after) and never repeated in `items`. */
  pinned: CommentThreadDto[];
  /** The other threads, newest first. */
  items: CommentThreadDto[];
  nextCursor: string | null;
  /** The viewer may pin and unpin threads of this list (the story's active author). */
  viewerCanPin: boolean;
}

/**
 * Comments shown in a list (`threadWhere`). A reply counts only while its thread is shown: hiding
 * or deleting a top-level comment takes its whole thread out.
 */
async function countShown(db: Db, threadWhere: SQL): Promise<number> {
  const reply = alias(comments, 'reply');
  const replyAuthor = alias(users, 'reply_author');
  const [threads, replies] = await Promise.all([
    db
      .select({ n: count() })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(threadWhere),
    db
      .select({ n: count() })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .innerJoin(reply, eq(reply.parentId, comments.id))
      .innerJoin(replyAuthor, eq(replyAuthor.id, reply.userId))
      .where(and(threadWhere, visibleCommentWhere(replyAuthor, reply))),
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

type ThreadRow = CommentRow & { paragraphId: string | null };

/**
 * Loads a page of threads. `threadWhere` picks the shown top-level comments of the list, the
 * writer joined as `users`. With `pins` (lists where the story's author may pin), the first page
 * also carries the pinned threads and every page leaves them out, so the keyset never sees them.
 * `orphaned` tells whether a thread about a paragraph is listed because the paragraph is gone.
 */
export async function loadThreadsPage(
  db: Db,
  viewer: CommentViewer,
  opts: {
    threadWhere: SQL;
    cursor: string | undefined;
    pins: { storyAuthorId: string } | null;
    orphaned: (row: { paragraphId: string | null }) => boolean;
  },
): Promise<CommentThreadsPage> {
  const cursor = opts.cursor ? decodeCommentCursor(opts.cursor) : null;
  const columns = { ...commentColumns(users), paragraphId: comments.paragraphId };
  const [total, pinnedRows, rows] = await Promise.all([
    cursor ? null : countShown(db, opts.threadWhere),
    cursor || !opts.pins
      ? []
      : db
          .select(columns)
          .from(comments)
          .innerJoin(users, eq(users.id, comments.userId))
          .where(and(opts.threadWhere, isNotNull(comments.pinnedAt)))
          .orderBy(asc(comments.pinnedAt), asc(comments.id))
          .limit(COMMENT_PIN_MAX),
    db
      .select(columns)
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(
        and(
          opts.threadWhere,
          opts.pins ? isNull(comments.pinnedAt) : undefined,
          cursor ? commentKeysetWhere(cursor, 'before') : undefined,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(COMMENTS_PAGE_SIZE + 1),
  ]);
  const page: ThreadRow[] = rows.slice(0, COMMENTS_PAGE_SIZE);
  const replies = await previewReplies(
    db,
    [...pinnedRows, ...page].map((row) => row.id),
  );

  const toThread = (row: ThreadRow): CommentThreadDto => {
    const own = replies.filter((reply) => reply.parentId === row.id);
    const replyCount = own[0]?.replyCount ?? 0;
    const last = own.at(-1);
    return {
      ...toCommentDto(row, viewer),
      orphanedParagraph: opts.orphaned(row),
      replyCount,
      replies: own.map((reply) => toCommentDto(reply, viewer)),
      moreRepliesCursor:
        last && replyCount > own.length ? encodeCommentCursor(last.micros, last.id) : null,
    };
  };
  const last = page.at(-1);
  return {
    total,
    pinned: pinnedRows.map(toThread),
    items: page.map(toThread),
    nextCursor:
      rows.length > COMMENTS_PAGE_SIZE && last ? encodeCommentCursor(last.micros, last.id) : null,
    viewerCanPin:
      opts.pins !== null &&
      viewer !== null &&
      canPinComment(viewer, { authorId: opts.pins.storyAuthorId }),
  };
}
