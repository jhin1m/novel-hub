import { type Db, comments, stories, users } from '@novel-hub/db';
import { type SQL, and, eq, isNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import { type CommentViewer, visibleCommentWhere } from './comment-dto';
import { matureCommentAccess } from './mature-comment-access';
import { threadScopeWhere } from './paragraph-scope';
import { type CommentThreadsPage, loadThreadsPage } from './thread-page';

export type ChapterCommentsPage = CommentThreadsPage;

/**
 * Visible top-level comments of a chapter in the list's scope (one paragraph, or the chapter's
 * own: see `threadScopeWhere`), the writer joined as `users`.
 */
function threadWhere(chapterId: string, paragraphId: string | undefined): SQL {
  return and(
    eq(comments.chapterId, chapterId),
    isNull(comments.parentId),
    visibleCommentWhere(users),
    threadScopeWhere(chapterId, paragraphId),
  ) as SQL;
}

async function storyAuthorId(db: Db, storyId: string): Promise<string> {
  const [row] = await db
    .select({ authorId: stories.authorId })
    .from(stories)
    .where(eq(stories.id, storyId));
  if (!row) throw new Error('story of a readable chapter missing');
  return row.authorId;
}

/**
 * One page of the comments under a readable chapter: threads newest first (keyset on
 * `(created_at, id)`), each with its reply count and oldest replies. With `paragraphId`, the
 * threads about that paragraph; without, the chapter's own (see `threadScopeWhere`), the threads
 * its author pinned coming first and apart. Comments of banned accounts and hidden or deleted ones
 * are left out. A chapter nobody may read is `NOT_FOUND`; one of an 18+ story the viewer has not
 * turned 18+ on for is `MATURE_CONTENT_DISABLED`.
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
): Promise<Result<ChapterCommentsPage, 'NOT_FOUND' | 'MATURE_CONTENT_DISABLED'>> {
  const ref = await findReadableChapterRef(db, query.publicId, query.number);
  if (!ref) return err('NOT_FOUND');
  if (!(await matureCommentAccess(db, viewer?.id ?? null, ref.isMature, ref.authorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  // Pins are for the chapter's own list; a paragraph's threads are never pinned.
  const pins =
    query.paragraphId === undefined
      ? { storyAuthorId: await storyAuthorId(db, ref.storyId) }
      : null;
  return ok(
    await loadThreadsPage(db, viewer, {
      threadWhere: threadWhere(ref.chapterId, query.paragraphId),
      cursor: query.cursor,
      pins,
      // In the chapter's list, a paragraph id means the paragraph was edited out of the text.
      orphaned: (row) => query.paragraphId === undefined && row.paragraphId !== null,
    }),
  );
}
