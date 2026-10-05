import { createSearchCtx, createWorkerConnection, resetRateLimits } from '@novel-hub/core';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, runMigrations, testDatabaseUrl, truncateAll } from '@novel-hub/db/testing';
import { loadServerEnv, meiliWorkerEnvSchema, testEnvSchema } from '@novel-hub/shared/env';
import { E2E_QUEUE_PREFIX } from './helpers/search';

/**
 * Migrates and wipes the test database (refuses anything not named `_test`), then loads tags.
 * Drops the e2e search indexes too, so no story from an earlier run shows up in results, and the
 * e2e rate limit counters, so an earlier run cannot throttle this one.
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

  const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
  const redis = createWorkerConnection(TEST_REDIS_URL);
  try {
    await resetRateLimits(redis, E2E_QUEUE_PREFIX);
  } finally {
    redis.disconnect();
  }
}
