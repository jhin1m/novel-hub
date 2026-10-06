import { type ChapterViewInput, statsDate } from '@novel-hub/shared';
import type { Db } from '@novel-hub/db';
import { type Result, err, ok } from '../lib/result';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import type { ViewCounter } from './view-counter';

/** While Redis is down every read fails; one log line a minute is enough (ms). */
const ERROR_LOG_INTERVAL_MS = 60_000;
let lastErrorLogAt = 0;

export interface RecordChapterViewDeps {
  db: Db;
  /** `null` when Redis is not available to the caller; reads are then not counted. */
  viewCounter: ViewCounter | null;
}

/**
 * Counts one read of a readable chapter. Counting is best effort: a Redis failure is logged and
 * the read is dropped (a few lost reads are acceptable), it never fails the reading page.
 */
export async function recordChapterView(
  deps: RecordChapterViewDeps,
  input: ChapterViewInput & { viewer: string; ip: string | null; now: Date },
): Promise<Result<{ counted: boolean }, 'NOT_FOUND'>> {
  const ref = await findReadableChapterRef(deps.db, input.publicId, input.number);
  if (!ref) return err('NOT_FOUND');
  if (!deps.viewCounter) return ok({ counted: false });
  try {
    const counted = await deps.viewCounter.record({
      chapterId: ref.chapterId,
      storyId: ref.storyId,
      viewer: input.viewer,
      ip: input.ip,
      date: statsDate(input.now),
    });
    return ok({ counted });
  } catch (error) {
    if (input.now.getTime() - lastErrorLogAt >= ERROR_LOG_INTERVAL_MS) {
      lastErrorLogAt = input.now.getTime();
      console.error(
        '[views] could not count a read (logged once a minute):',
        error instanceof Error ? error.message : error,
      );
    }
    return ok({ counted: false });
  }
}
