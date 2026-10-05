// `pnpm cdn:purge -- --story <publicId>`: purges a story page and every chapter ever published,
// right now and without the queue. For when an automatic purge was missed (or after a restore).
import { parseArgs } from 'node:util';
import { cdnConfigFromEnv, createCdnPurger, storyUrlsByPublicId } from '@novel-hub/core';
import { createDb, describeDbError } from '@novel-hub/db';
import {
  appEnvSchema,
  cdnEnvSchema,
  dbEnvSchema,
  loadOptionalEnv,
  loadServerEnv,
} from '@novel-hub/shared/env';

function fail(message: string): never {
  console.error(`[cdn:purge] ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  // pnpm forwards the `--` separator; drop it.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { story: { type: 'string' } },
});
if (!values.story) fail('usage: pnpm cdn:purge -- --story <publicId>');

try {
  const env = loadServerEnv(appEnvSchema.extend(dbEnvSchema.shape));
  const cdn = cdnConfigFromEnv(loadOptionalEnv(cdnEnvSchema, process.env, 'cdn'));
  if (!cdn) fail('CF_ZONE_ID and CF_API_TOKEN must be set');
  const { db, pool } = createDb(env.DATABASE_URL, { max: 1 });
  try {
    const urls = await storyUrlsByPublicId(db, values.story, env.APP_URL);
    if (!urls) fail(`no story with public id "${values.story}"`);
    await createCdnPurger(cdn).purge(urls);
    console.log(`[cdn:purge] purged ${urls.length} URLs`);
  } finally {
    await pool.end();
  }
} catch (err) {
  fail(`failed: ${describeDbError(err)}`);
}
