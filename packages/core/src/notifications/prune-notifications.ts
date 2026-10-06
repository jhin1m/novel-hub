import type { Db } from '@novel-hub/db';
import { sql } from 'drizzle-orm';

/** Rows deleted per statement, so a large backlog never holds one long lock. */
export const PRUNE_BATCH_SIZE = 5_000;

/**
 * Deletes notifications older than `olderThanDays`, read or not, a batch at a time until none is
 * left. Returns how many were deleted.
 */
export async function pruneNotifications(
  db: Db,
  olderThanDays = 90,
  batchSize = PRUNE_BATCH_SIZE,
): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await db.execute(sql`
      delete from notifications
      where id in (
        select id from notifications
        where created_at < now() - ${olderThanDays} * interval '1 day'
        limit ${batchSize}
      )
    `);
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < batchSize) return total;
  }
}
