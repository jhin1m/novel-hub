import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { type Db, createDb } from '../client';
import { truncatePublicTables } from '../truncate';

const TEST_DB_SUFFIX = '_test';

/** Đọc `TEST_DATABASE_URL`; throw nếu tên DB không kết thúc bằng `_test`. */
export function testDatabaseUrl(): string {
  const { TEST_DATABASE_URL } = loadServerEnv(testEnvSchema.pick({ TEST_DATABASE_URL: true }));
  const name = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.slice(1));
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`TEST_DATABASE_URL phải trỏ tới DB có tên kết thúc bằng ${TEST_DB_SUFFIX}`);
  }
  return TEST_DATABASE_URL;
}

/** Kết nối DB test cho integration test; nhớ `pool.end()` trong `afterAll`. */
export function createTestDb(): { db: Db; pool: pg.Pool } {
  return createDb(testDatabaseUrl(), { max: 5 });
}

/**
 * Xoá sạch dữ liệu mọi bảng. Hỏi lại tên DB thật từ server (không tin URL) và chỉ chạy
 * khi tên kết thúc bằng `_test`, nên gọi nhầm lên DB dev cũng không mất gì.
 */
export async function truncateAll(db: Pick<Db, 'execute'>): Promise<void> {
  const { rows } = await db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = rows[0]?.name ?? '';
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`Từ chối truncate: DB "${name}" không kết thúc bằng ${TEST_DB_SUFFIX}`);
  }
  await truncatePublicTables(db);
}

/** Chờ `query` thất bại và trả lỗi Postgres gốc (Drizzle bọc lỗi trong `cause`). */
export async function catchPgError(query: PromiseLike<unknown>): Promise<pg.DatabaseError> {
  try {
    await query;
  } catch (err) {
    const cause = err instanceof Error && err.cause !== undefined ? err.cause : err;
    if (cause instanceof Error && 'code' in cause) return cause as pg.DatabaseError;
    throw err;
  }
  throw new Error('Truy vấn không lỗi như mong đợi');
}
export { runMigrations } from '../migrate';
