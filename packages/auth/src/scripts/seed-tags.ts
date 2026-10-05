// `pnpm db:seed-tags`: inserts the starting tag list. Idempotent and allowed in production (there
// is no tag editor yet), so it deliberately skips the localhost guard of `db:seed`.
import { createDb } from '@novel-hub/db';
import { describeDbError, seedTags } from '@novel-hub/db/seed';
import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';

try {
  const { DATABASE_URL } = loadServerEnv(dbEnvSchema);
  const { db, pool } = createDb(DATABASE_URL, { max: 1 });
  try {
    const tagIds = await seedTags(db);
    console.log(`[seed-tags] done: ${tagIds.size} tags present`);
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error('[seed-tags] failed:', describeDbError(err));
  process.exitCode = 1;
}
