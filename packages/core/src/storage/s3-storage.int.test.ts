import { loadServerEnv, s3EnvSchema } from '@novel-hub/shared/env';
import { describe, expect, it } from 'vitest';
import { createS3Storage, s3ConfigFromEnv } from './s3-storage';

function loadS3Env() {
  try {
    return loadServerEnv(s3EnvSchema);
  } catch {
    return null;
  }
}

const env = loadS3Env();
// Written straight to stderr: vitest does not print console output from module scope.
if (!env) process.stderr.write('S3 int test SKIPPED: S3_* is not configured in .env\n');

// Runs against the real dev bucket; keys live under `test/` and are deleted afterwards.
describe.skipIf(!env)('createS3Storage against the dev bucket', () => {
  it('put → public GET 200 → delete → GET 404', async () => {
    if (!env) return;
    const storage = createS3Storage(s3ConfigFromEnv(env));
    const key = `test/${crypto.randomUUID()}.txt`;
    await storage.put(key, new TextEncoder().encode('novel-hub'), {
      contentType: 'text/plain',
      cacheControl: 'no-store',
    });
    try {
      const res = await fetch(storage.publicUrl(key));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('novel-hub');
    } finally {
      await storage.delete(key);
    }
    const gone = await fetch(storage.publicUrl(key));
    await gone.body?.cancel();
    expect(gone.status).toBe(404);
  });
});
