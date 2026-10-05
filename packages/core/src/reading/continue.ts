import { type Db, chapters, readingProgress, stories, users } from '@novel-hub/db';
import { and, asc, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import { publicStoryWhere } from '../catalog/story-card';

/** Where "continue reading" takes a reader in a story. No internal ids. */
export interface ContinueDto {
  chapterNumber: number;
  chapterTitle: string | null;
  scrollPct: number;
  updatedAt: string;
}

/** The chapter a progress row points at, joined as `saved_chapter` (it may no longer be readable). */
export const savedChapter = alias(chapters, 'saved_chapter');

/**
 * Lateral subquery: the readable chapter a progress row resumes at. The saved chapter while it can
 * still be read, otherwise the closest readable one before it, otherwise the first readable one
 * after it. Two `LIMIT 1` lookups on the `(story_id, status, number)` index, so long stories cost
 * the same as short ones. Joined after `reading_progress` and `saved_chapter`, over a story the
 * outer query already restricts with `publicStoryWhere` (so only the chapter half of
 * `canReadChapter` is checked here).
 */
export function resumeChapter(db: Db) {
  const readable = and(
    eq(chapters.storyId, readingProgress.storyId),
    eq(chapters.status, 'published'),
    isNull(chapters.deletedAt),
  );
  const columns = { id: chapters.id, number: chapters.number, title: chapters.title };
  const atOrBefore = db
    .select({ ...columns, rank: sql<number>`0`.as('rank') })
    .from(chapters)
    .where(and(readable, lte(chapters.number, savedChapter.number)))
    .orderBy(desc(chapters.number))
    .limit(1);
  const after = db
    .select({ ...columns, rank: sql<number>`1`.as('rank') })
    .from(chapters)
    .where(and(readable, gt(chapters.number, savedChapter.number)))
    .orderBy(asc(chapters.number))
    .limit(1);
  return unionAll(atOrBefore, after)
    .orderBy(sql`rank`)
    .limit(1)
    .as('resume');
}

/**
 * The position to resume at, given the resumed chapter: the saved scroll position when it is the
 * saved chapter, otherwise the top of the chapter.
 */
export function resumeScrollPct(
  savedChapterId: string,
  resumeChapterId: string,
  scrollPct: number,
): number {
  return savedChapterId === resumeChapterId ? scrollPct : 0;
}

/**
 * "Continue reading" for `userId` in the story `publicId`: `null` when they never read it, when
 * the story is no longer public, or when none of its chapters can be read any more.
 */
export async function getContinueReading(
  db: Db,
  userId: string,
  publicId: string,
): Promise<ContinueDto | null> {
  const resume = resumeChapter(db);
  const [row] = await db
    .select({
      savedChapterId: readingProgress.chapterId,
      scrollPct: readingProgress.scrollPct,
      updatedAt: readingProgress.updatedAt,
      resumeId: resume.id,
      resumeNumber: resume.number,
      resumeTitle: resume.title,
    })
    .from(readingProgress)
    .innerJoin(stories, eq(stories.id, readingProgress.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(savedChapter, eq(savedChapter.id, readingProgress.chapterId))
    .innerJoinLateral(resume, sql`true`)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(stories.publicId, publicId),
        publicStoryWhere({ includeMature: true }),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    chapterNumber: row.resumeNumber,
    chapterTitle: row.resumeTitle,
    scrollPct: resumeScrollPct(row.savedChapterId, row.resumeId, row.scrollPct),
    updatedAt: row.updatedAt.toISOString(),
  };
}
