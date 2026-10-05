import { type Db, chapterContents, chapters, stories, users } from '@novel-hub/db';
import { and, asc, eq, isNull, lte, ne } from 'drizzle-orm';
import { markChapterPublished } from './publish-chapter';

/**
 * Publishes scheduled chapters whose time has come. The database is the source of truth, so a
 * worker that was down simply catches up on its first run. Each chapter gets its own transaction:
 * story locked first, then the chapter with `SKIP LOCKED`, and the conditions checked again under
 * the locks, so concurrent sweeps (or an author acting at the same moment) publish it once.
 * Chapters of banned authors wait; they go out on the first sweep after an unban.
 */
export async function publishDueChapters(
  db: Db,
  opts: { now?: Date; limit?: number } = {},
): Promise<{ published: number }> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(chapters.status, 'scheduled'),
    lte(chapters.scheduledAt, now),
    isNull(chapters.deletedAt),
  );
  const candidates = await db
    .select({ chapterId: chapters.id, storyId: chapters.storyId })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(due, ne(users.status, 'banned')))
    .orderBy(asc(chapters.scheduledAt))
    .limit(opts.limit ?? 100);

  let published = 0;
  for (const candidate of candidates) {
    const done = await db.transaction(async (tx) => {
      const [story] = await tx
        .select()
        .from(stories)
        .where(eq(stories.id, candidate.storyId))
        .for('update');
      if (!story) return false;
      const [chapter] = await tx
        .select()
        .from(chapters)
        .where(and(eq(chapters.id, candidate.chapterId), due))
        .for('update', { skipLocked: true });
      if (!chapter) return false;
      const [author] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, story.authorId));
      if (!author || author.status === 'banned') return false;
      const [content] = await tx
        .select({ contentHash: chapterContents.contentHash })
        .from(chapterContents)
        .where(eq(chapterContents.chapterId, chapter.id));
      if (!content) {
        // Scheduling always stores content first; a row without it cannot be published safely.
        console.error(`[publishing] scheduled chapter ${chapter.id} has no content, skipped`);
        return false;
      }
      await markChapterPublished(tx, story, chapter, {
        now,
        contentHash: content.contentHash,
        wordCount: chapter.wordCount,
      });
      return true;
    });
    if (done) published += 1;
  }
  return { published };
}
