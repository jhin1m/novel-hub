import { chapterContents, comments } from '@novel-hub/db';
import { type AnyColumn, type SQL, and, eq, isNull, not, or, sql } from 'drizzle-orm';

/**
 * Whether `pid` is still a paragraph (or heading) of the chapter's published text. A later edit may
 * drop a paragraph; its comments then count as the chapter's own. One uncorrelated subquery, so
 * Postgres reads `paragraph_ids` once per statement.
 */
export function inPublishedText(pid: AnyColumn, chapterId: string): SQL {
  return sql`${pid} = any(coalesce((select ${chapterContents.paragraphIds} from ${chapterContents} where ${chapterContents.chapterId} = ${chapterId}), '{}'::text[]))`;
}

/**
 * Which threads a list shows. With a paragraph: the threads about it, while it is in the text.
 * Without: the threads about the chapter as a whole, and those whose paragraph is gone, so an edit
 * never makes a comment disappear.
 */
export function threadScopeWhere(chapterId: string, paragraphId: string | undefined): SQL {
  if (paragraphId !== undefined) {
    return and(
      eq(comments.paragraphId, paragraphId),
      inPublishedText(comments.paragraphId, chapterId),
    ) as SQL;
  }
  return or(
    isNull(comments.paragraphId),
    not(inPublishedText(comments.paragraphId, chapterId)),
  ) as SQL;
}
