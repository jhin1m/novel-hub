import { type Db, readingProgress, stories } from '@novel-hub/db';
import { HISTORY_PAGE_SIZE } from '@novel-hub/shared';
import { type SQL, and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCardsWith,
  toStoryCard,
} from '../catalog/story-card';
import { resumeChapter, resumeScrollPct, savedChapter } from './continue';

/** One story in the reading history: where the reader is in it. */
export interface HistoryItemDto {
  story: StoryCardDto;
  chapterNumber: number;
  chapterTitle: string | null;
  scrollPct: number;
  updatedAt: string;
}

export interface HistoryPage {
  items: HistoryItemDto[];
  /** Pass back to get the next page; `null` on the last one. */
  nextCursor: string | null;
}

/** `updated_at` in microseconds since the epoch, exact, as text (bigint does not fit a JS number). */
const updatedAtMicros = sql<string>`(extract(epoch from ${readingProgress.updatedAt}) * 1000000)::bigint::text`;

/** `(updated_at, public_id)` strictly after `cursor` in "most recent first" order. */
function afterCursor(cursor: string): SQL {
  const [micros, publicId] = cursor.split('_');
  return sql`(${readingProgress.updatedAt}, ${stories.publicId}) < (timestamptz 'epoch' + ${micros}::bigint * interval '1 microsecond', ${publicId})`;
}

/**
 * Stories `userId` has read, most recently read first, each with the chapter "continue reading"
 * would open. Keyset pages over `(updated_at, public_id)`. Stories that are no longer public are
 * left out but their rows kept, so they come back if the story does. 18+ stories are listed: the
 * list is the reader's own, and opening one still goes through the 18+ screen.
 */
export async function listHistory(
  db: Db,
  userId: string,
  cursor?: string,
  limit = HISTORY_PAGE_SIZE,
): Promise<HistoryPage> {
  const resume = resumeChapter(db);
  const rows = await selectStoryCardsWith(db, {
    savedChapterId: readingProgress.chapterId,
    scrollPct: readingProgress.scrollPct,
    updatedAt: readingProgress.updatedAt,
    updatedAtMicros,
    resumeId: resume.id,
    resumeNumber: resume.number,
    resumeTitle: resume.title,
  })
    .innerJoin(
      readingProgress,
      and(eq(readingProgress.storyId, stories.id), eq(readingProgress.userId, userId)),
    )
    .innerJoin(savedChapter, eq(savedChapter.id, readingProgress.chapterId))
    .innerJoinLateral(resume, sql`true`)
    .where(and(publicStoryWhere({ includeMature: true }), cursor ? afterCursor(cursor) : undefined))
    .orderBy(desc(readingProgress.updatedAt), desc(stories.publicId))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      story: toStoryCard(row),
      chapterNumber: row.resumeNumber,
      chapterTitle: row.resumeTitle,
      scrollPct: resumeScrollPct(row.savedChapterId, row.resumeId, row.scrollPct),
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: rows.length > limit && last ? `${last.updatedAtMicros}_${last.publicId}` : null,
  };
}

/** Forgets where `userId` is in the story `publicId`. Nothing to remove is not an error. */
export async function removeFromHistory(db: Db, userId: string, publicId: string): Promise<void> {
  await db
    .delete(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        inArray(
          readingProgress.storyId,
          db.select({ id: stories.id }).from(stories).where(eq(stories.publicId, publicId)),
        ),
      ),
    );
}
