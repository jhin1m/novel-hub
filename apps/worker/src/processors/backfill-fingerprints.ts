import {
  type ContentQueue,
  type Db,
  listChaptersNeedingFingerprint,
  withTimeout,
} from '@novel-hub/core';
import { CONTENT_JOBS, DEDUPE, type FingerprintChapterPayload } from '@novel-hub/shared';

const ADD_BULK_TIMEOUT_MS = 10_000;

export interface BackfillFingerprintsDeps {
  db: Db;
  contentQueue: Pick<ContentQueue, 'addBulk'>;
}

/**
 * Enqueues `fingerprint-chapter` for published chapters whose fingerprint is missing or stale, at
 * most `backfillMaxBatches` batches per run; the next run starts over from the first id. No
 * `jobId`: a chapter enqueued twice is only checked twice, which the job tolerates.
 */
export async function processBackfillFingerprints(deps: BackfillFingerprintsDeps): Promise<number> {
  let afterId: string | undefined;
  let enqueued = 0;
  for (let batch = 0; batch < DEDUPE.backfillMaxBatches; batch++) {
    const ids = await listChaptersNeedingFingerprint(deps.db, DEDUPE.backfillBatch, afterId);
    if (ids.length === 0) break;
    await withTimeout(
      deps.contentQueue.addBulk(
        ids.map((chapterId) => {
          const data: FingerprintChapterPayload = { chapterId };
          return { name: CONTENT_JOBS.fingerprintChapter, data };
        }),
      ),
      ADD_BULK_TIMEOUT_MS,
      'fingerprint backfill addBulk',
    );
    enqueued += ids.length;
    afterId = ids.at(-1);
    if (ids.length < DEDUPE.backfillBatch) break;
  }
  if (enqueued > 0) console.info(`[dedupe] backfill enqueued ${enqueued} chapters`);
  return enqueued;
}
