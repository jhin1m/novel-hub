import { fileURLToPath } from 'node:url';
import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';
import { describeDbError } from './errors';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Áp các migration trong `packages/db/drizzle` chưa chạy lên DB `url`. */
export async function runMigrations(url: string): Promise<void> {
  // Tắt statement_timeout: tạo index trên bảng lớn có thể chạy lâu.
  const { db, pool } = createDb(url, { max: 1, statementTimeoutMs: 0 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  try {
    const { DATABASE_URL } = loadServerEnv(dbEnvSchema);
    await runMigrations(DATABASE_URL);
    console.log('[db] migrate xong');
  } catch (err) {
    console.error('[db] migrate lỗi:', describeDbError(err));
    process.exitCode = 1;
  }
}
