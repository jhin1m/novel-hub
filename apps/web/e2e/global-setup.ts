import { createTestDb, runMigrations, testDatabaseUrl, truncateAll } from '@novel-hub/db/testing';

/** Migrate rồi xoá sạch DB test (chỉ chạy được trên DB tên `_test`). */
export default async function globalSetup(): Promise<void> {
  await runMigrations(testDatabaseUrl());
  const { db, pool } = createTestDb();
  try {
    await truncateAll(db);
  } finally {
    await pool.end();
  }
}
