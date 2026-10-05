import { type Db, fingerprintChapter } from '@novel-hub/core';
import { fingerprintChapterPayload } from '@novel-hub/shared';
import { UnrecoverableError } from 'bullmq';

export interface FingerprintChapterDeps {
  db: Db;
}

/**
 * Runs the duplicate check of one chapter from the current database state (Postgres only, no
 * network), so a repeated or late run is harmless. A malformed payload is never retried.
 */
export async function processFingerprintChapter(
  data: unknown,
  deps: FingerprintChapterDeps,
): Promise<void> {
  const parsed = fingerprintChapterPayload.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('malformed fingerprint-chapter payload');
  const { chapterId } = parsed.data;
  const result = await fingerprintChapter(deps.db, chapterId);
  if (result.status === 'reported') {
    console.info(
      `[dedupe] chapter ${chapterId}: ${result.reportsFiled ?? 0} duplicate reports filed`,
    );
  }
}
