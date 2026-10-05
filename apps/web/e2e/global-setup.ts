import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, runMigrations, testDatabaseUrl, truncateAll } from '@novel-hub/db/testing';

/** Migrates and wipes the test database (refuses anything not named `_test`), then loads tags. */
export default async function globalSetup(): Promise<void> {
  await runMigrations(testDatabaseUrl());
  const { db, pool } = createTestDb();
  try {
    await truncateAll(db);
    await seedTags(db);
  } finally {
    await pool.end();
  }
}
