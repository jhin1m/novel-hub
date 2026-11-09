import { LIMITS } from '@novel-hub/shared';
import { loadServerEnv, s3EnvSchema } from '@novel-hub/shared/env';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processCoverImage } from '../images/cover';
import { createS3Storage, s3ConfigFromEnv } from '../storage/s3-storage';

function loadS3Env() {
  try {
    return loadServerEnv(s3EnvSchema);
  } catch {
    return null;
  }
}

const env = loadS3Env();
// Written straight to stderr: vitest does not print console output from module scope.
if (!env) process.stderr.write('S3 cover int test SKIPPED: S3_* is not configured in .env\n');

const IMMUTABLE = 'public, max-age=31536000, immutable';

// Runs the real cover pipeline against the real bucket; keys live under `test/` and are deleted.
describe.skipIf(!env)('cover variants stored in the dev bucket', () => {
  it('uploads both WebP sizes, serves them publicly with immutable caching, then removes them', async () => {
    if (!env) return;
    const storage = createS3Storage(s3ConfigFromEnv(env));
    const source = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: '#888888' },
    })
      .jpeg()
      .toBuffer();

    const processed = await processCoverImage(source);
    if (!processed.ok) throw new Error(`cover processing failed: ${processed.error}`);

    const [large, small] = LIMITS.cover.variants;
    const base = `test/covers/${crypto.randomUUID()}`;
    const uploads = [
      { key: `${base}-600.webp`, body: processed.value.w600, size: large },
      { key: `${base}-300.webp`, body: processed.value.w300, size: small },
    ];

    try {
      await Promise.all(
        uploads.map((u) =>
          storage.put(u.key, u.body, { contentType: 'image/webp', cacheControl: IMMUTABLE }),
        ),
      );
      for (const u of uploads) {
        const res = await fetch(storage.publicUrl(u.key));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/webp');
        expect(res.headers.get('cache-control')).toBe(IMMUTABLE);
        const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([u.size.width, u.size.height]);
        expect(meta.exif).toBeUndefined();
      }
    } finally {
      await Promise.all(uploads.map((u) => storage.delete(u.key)));
    }

    for (const u of uploads) {
      // The public host sits behind a CDN that keeps immutable objects it already served, so a
      // unique query string is needed to reach the origin and see the deletion.
      const gone = await fetch(`${storage.publicUrl(u.key)}?origin-check=${crypto.randomUUID()}`);
      await gone.body?.cancel();
      expect(gone.status).toBe(404);
    }
  });
});
