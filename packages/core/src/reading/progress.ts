import { type Db, readingProgress } from '@novel-hub/db';
import type { ReadingProgressInput } from '@novel-hub/shared';
import { sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';

/**
 * Remembers where `userId` is in a story: one row per (user, story), moved to the chapter and
 * scroll position just reported. Chapters that cannot be read answer `NOT_FOUND`.
 */
export async function saveReadingProgress(
  db: Db,
  userId: string,
  input: ReadingProgressInput,
): Promise<Result<void, 'NOT_FOUND'>> {
  const ref = await findReadableChapterRef(db, input.publicId, input.number);
  if (!ref) return err('NOT_FOUND');
  await db
    .insert(readingProgress)
    .values({
      userId,
      storyId: ref.storyId,
      chapterId: ref.chapterId,
      scrollPct: input.scrollPct,
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.storyId],
      set: { chapterId: ref.chapterId, scrollPct: input.scrollPct, updatedAt: sql`now()` },
    });
  return ok(undefined);
}
