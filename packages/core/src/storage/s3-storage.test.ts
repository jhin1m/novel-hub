import { describe, expect, it } from 'vitest';
import { type S3Config, createS3Storage } from './s3-storage';

const config: S3Config = {
  endpoint: 'https://s3.example.com/',
  bucket: 'novel-hub-dev',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-value',
  region: 'us-east-1',
  publicUrl: 'https://cdn.example.com/novel-hub-dev/',
  forcePathStyle: true,
};

function recorder(status = 200) {
  const requests: Request[] = [];
  const fetchImpl: typeof fetch = (input) => {
    if (!(input instanceof Request)) throw new Error('expected a signed Request');
    requests.push(input);
    return Promise.resolve(new Response('<Error>secret detail</Error>', { status }));
  };
  return { requests, fetchImpl };
}

describe('createS3Storage', () => {
  it('PUTs a signed request to the path-style URL with content headers', async () => {
    const { requests, fetchImpl } = recorder();
    const storage = createS3Storage(config, fetchImpl);
    await storage.put('covers/abc/hash-600.webp', new Uint8Array([1, 2, 3]), {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const [req] = requests;
    if (!req) throw new Error('no request sent');
    expect(req.method).toBe('PUT');
    expect(req.url).toBe('https://s3.example.com/novel-hub-dev/covers/abc/hash-600.webp');
    expect(req.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(req.headers.get('content-type')).toBe('image/webp');
    expect(req.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await req.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('uses a virtual-host URL when path style is off', async () => {
    const { requests, fetchImpl } = recorder();
    await createS3Storage({ ...config, forcePathStyle: false }, fetchImpl).delete('a/b.webp');
    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.url).toBe('https://novel-hub-dev.s3.example.com/a/b.webp');
  });

  it('throws with the status only when S3 rejects the upload', async () => {
    const { fetchImpl } = recorder(403);
    const storage = createS3Storage(config, fetchImpl);
    const error = await storage
      .put('k', new Uint8Array(), { contentType: 'image/webp', cacheControl: 'x' })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('S3 PUT failed with status 403');
  });

  it('treats a missing object as deleted', async () => {
    const { fetchImpl } = recorder(404);
    await expect(createS3Storage(config, fetchImpl).delete('gone')).resolves.toBeUndefined();
  });

  it('builds public URLs from S3_PUBLIC_URL', () => {
    expect(createS3Storage(config).publicUrl('covers/x-600.webp')).toBe(
      'https://cdn.example.com/novel-hub-dev/covers/x-600.webp',
    );
  });
});
