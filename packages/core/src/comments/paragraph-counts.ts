import { type Db, comments, users } from '@novel-hub/db';
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type Result, err, ok } from '../lib/result';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import { visibleCommentWhere } from './comment-dto';
import { inPublishedText } from './paragraph-scope';

/**
 * Comments shown about each paragraph of a readable chapter, by `data-pid`: visible threads plus
 * their visible replies, writers not banned (the same rule as the chapter's total). Paragraphs no
 * longer in the text are left out (their threads list with the chapter's), as are those with none.
 */
export async function countParagraphComments(
  db: Db,
  query: { publicId: string; number: number },
): Promise<Result<Record<string, number>, 'NOT_FOUND'>> {
  const ref = await findReadableChapterRef(db, query.publicId, query.number);
  if (!ref) return err('NOT_FOUND');
  const reply = alias(comments, 'reply');
  const replyAuthor = alias(users, 'reply_author');
  // A thread without shown replies still joins one row, with the reply columns null.
  const rows = await db
    .select({
      pid: sql<string>`${comments.paragraphId}`,
      count: sql<number>`(count(distinct ${comments.id}) + count(${replyAuthor.id}))::int`,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .leftJoin(reply, and(eq(reply.parentId, comments.id), eq(reply.status, 'visible')))
    .leftJoin(replyAuthor, and(eq(replyAuthor.id, reply.userId), ne(replyAuthor.status, 'banned')))
    .where(
      and(
        eq(comments.chapterId, ref.chapterId),
        isNull(comments.parentId),
        isNotNull(comments.paragraphId),
        visibleCommentWhere(users),
        inPublishedText(comments.paragraphId, ref.chapterId),
      ),
    )
    .groupBy(comments.paragraphId);
  return ok(Object.fromEntries(rows.map((row) => [row.pid, row.count])));
}
