import { createSearchCtx } from '@novel-hub/core';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, runMigrations, testDatabaseUrl, truncateAll } from '@novel-hub/db/testing';
import { loadServerEnv, meiliWorkerEnvSchema } from '@novel-hub/shared/env';
import { E2E_QUEUE_PREFIX } from './helpers/search';

/**
 * Migrates and wipes the test database (refuses anything not named `_test`), then loads tags.
 * Drops the e2e search indexes too, so no story from an earlier run shows up in results.
 */
export default async function globalSetup(): Promise<void> {
  await runMigrations(testDatabaseUrl());
  const { db, pool } = createTestDb();
  try {
    await truncateAll(db);
    await seedTags(db);
  } finally {
    await pool.end();
  }
  const meili = loadServerEnv(meiliWorkerEnvSchema);
  const { client, names } = createSearchCtx({
    url: meili.MEILI_URL,
    apiKey: meili.MEILI_MASTER_KEY,
    prefix: E2E_QUEUE_PREFIX,
  });
  await client.deleteIndexIfExists(names.stories);
  await client.deleteIndexIfExists(names.authors);
}
