// CLI seed cho máy dev: `pnpm db:seed [--reset]`. Tạo account mật khẩu (provider
// `credential`) cho mọi user mẫu, mật khẩu lấy từ `SEED_USER_PASSWORD`.
import { createDb } from '@novel-hub/db';
import {
  assertSeedAllowed,
  describeDbError,
  seedDatabase,
  truncatePublicTables,
} from '@novel-hub/db/seed';
import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';

const seedEnvSchema = dbEnvSchema.extend({ SEED_USER_PASSWORD: z.string().min(8) });
const reset = process.argv.includes('--reset');

try {
  const { DATABASE_URL, SEED_USER_PASSWORD } = loadServerEnv(seedEnvSchema);
  // `loadServerEnv` đã nạp `.env` vào process.env nên NODE_ENV đọc được ở đây.
  assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: DATABASE_URL });

  const { db, pool } = createDb(DATABASE_URL, { max: 1 });
  try {
    if (reset) {
      await truncatePublicTables(db);
      console.log('[seed] đã xoá dữ liệu cũ (--reset)');
    }
    const summary = await seedDatabase(db, { hashPassword, password: SEED_USER_PASSWORD });
    console.log('[seed] xong:', summary);
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error('[seed] lỗi:', describeDbError(err));
  process.exitCode = 1;
}
