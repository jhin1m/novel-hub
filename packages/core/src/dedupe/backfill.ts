import { type Db, chapterContents, chapterFingerprints, chapters } from '@novel-hub/db';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';

/**
 * Ids of published, live chapters whose fingerprint is missing or was computed from older content,
 * in id order after `afterId` (keyset paging). Catches chapters published before the duplicate
 * check existed, jobs that ran out of attempts and jobs lost with Redis.
 */
export async function listChaptersNeedingFingerprint(
  db: Db,
  limit: number,
  afterId?: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(chapterContents, eq(chapterContents.chapterId, chapters.id))
    .leftJoin(chapterFingerprints, eq(chapterFingerprints.chapterId, chapters.id))
    .where(
      and(
        eq(chapters.status, 'published'),
        isNull(chapters.deletedAt),
        or(
          isNull(chapterFingerprints.chapterId),
          sql`${chapterFingerprints.contentHash} IS DISTINCT FROM ${chapterContents.contentHash}`,
        ),
        afterId === undefined ? undefined : gt(chapters.id, afterId),
      ),
    )
    .orderBy(asc(chapters.id))
    .limit(limit);
  return rows.map((row) => row.id);
}
