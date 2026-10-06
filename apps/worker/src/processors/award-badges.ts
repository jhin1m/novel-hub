import { type Db, awardMilestoneBadges, ensureBadgeCatalog } from '@novel-hub/core';

export interface AwardBadgesDeps {
  db: Db;
}

/** Awards the author milestone badges reached since the last run. */
export async function processAwardBadges(deps: AwardBadgesDeps): Promise<void> {
  const awarded = await awardMilestoneBadges(deps.db);
  if (awarded > 0) console.info(`[badges] awarded ${awarded} badges`);
}

/**
 * Upserts the badge catalog at boot, in the background like the search settings: the award job
 * upserts it again before every run, so a failure here only logs.
 */
export async function ensureBadgeCatalogAtBoot(db: Db): Promise<void> {
  try {
    await ensureBadgeCatalog(db);
  } catch (err) {
    console.error(
      '[badges] could not upsert the catalog:',
      err instanceof Error ? err.message : err,
    );
  }
}
