// `pnpm search:reindex`: rebuilds the Meilisearch indexes from Postgres (Meilisearch is never
// backed up). Safe while the worker runs: every write reflects the current database state.
import { createSearchCtx, reindexAll } from '@novel-hub/core';
import { createDb, describeDbError } from '@novel-hub/db';
import {
  assertMeiliMasterKeyStrength,
  dbEnvSchema,
  loadServerEnv,
  meiliWorkerEnvSchema,
  queueEnvSchema,
} from '@novel-hub/shared/env';

function fail(message: string): never {
  console.error(`[search:reindex] ${message}`);
  process.exit(1);
}

try {
  const env = loadServerEnv(
    dbEnvSchema.extend(queueEnvSchema.shape).extend(meiliWorkerEnvSchema.shape),
  );
  assertMeiliMasterKeyStrength(env, process.env.NODE_ENV);
  const ctx = createSearchCtx({
    url: env.MEILI_URL,
    apiKey: env.MEILI_MASTER_KEY,
    prefix: env.QUEUE_PREFIX,
  });
  const { db, pool } = createDb(env.DATABASE_URL, { max: 2 });
  try {
    const result = await reindexAll(db, ctx, (message) =>
      console.log(`[search:reindex] ${message}`),
    );
    console.log(
      `[search:reindex] done: ${result.upserted} documents upserted, ${result.deleted} deleted`,
    );
  } finally {
    await pool.end();
  }
} catch (err) {
  fail(`failed: ${describeDbError(err)}`);
}
