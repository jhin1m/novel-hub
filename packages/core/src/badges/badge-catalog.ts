import { type Db, badges } from '@novel-hub/db';
import { BADGES } from '@novel-hub/shared';
import { sql } from 'drizzle-orm';

/**
 * Upserts the badge catalog (`BADGES`) into `badges` by code, so awarding can join on it. Idempotent;
 * the worker calls it at boot and before every award run (a wiped table refills itself). Rows of
 * codes no longer in the catalog are left alone: badges already awarded are never taken back.
 */
export async function ensureBadgeCatalog(db: Db): Promise<void> {
  await db
    .insert(badges)
    .values(BADGES.map((b) => ({ code: b.code, name: b.name, description: b.description })))
    .onConflictDoUpdate({
      target: badges.code,
      set: { name: sql`excluded.name`, description: sql`excluded.description` },
    });
}
