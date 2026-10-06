import { awardMilestoneBadges } from '@novel-hub/core';
import { createTestDb } from '@novel-hub/db/testing';

/** Awards the milestone badges the way the worker's `award-badges` job does (e2e runs no worker). */
export async function awardBadges(): Promise<void> {
  const { db, pool } = createTestDb();
  try {
    await awardMilestoneBadges(db);
  } finally {
    await pool.end();
  }
}
