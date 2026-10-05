import { createSearchCtx, ensureSearchSettings, syncStoryAndAuthor } from '@novel-hub/core';
import { createTestDb } from '@novel-hub/db/testing';
import { loadServerEnv, meiliWorkerEnvSchema } from '@novel-hub/shared/env';

/** Same prefix as the web server under test (`QUEUE_PREFIX` in `playwright.config.ts`). */
export const E2E_QUEUE_PREFIX = 'e2e';

/**
 * Indexes stories for search the way the worker's `search-sync` job does (e2e runs no worker),
 * from their current rows in the test database.
 */
export async function syncSearch(publicIds: readonly string[]): Promise<void> {
  const meili = loadServerEnv(meiliWorkerEnvSchema);
  const ctx = createSearchCtx({
    url: meili.MEILI_URL,
    apiKey: meili.MEILI_MASTER_KEY,
    prefix: E2E_QUEUE_PREFIX,
  });
  await ensureSearchSettings(ctx);
  const { db, pool } = createTestDb();
  try {
    for (const publicId of publicIds) {
      const { rows } = await pool.query<{ id: string }>(
        'select id from stories where public_id = $1',
        [publicId],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error(`story ${publicId} missing`);
      await syncStoryAndAuthor(db, ctx, id);
    }
  } finally {
    await pool.end();
  }
}
