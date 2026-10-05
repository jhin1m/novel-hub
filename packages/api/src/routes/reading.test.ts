import type { CurrentUser } from '@novel-hub/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const reader: CurrentUser = {
  id: '01920000-0000-7000-8000-000000000009',
  username: 'reader',
  displayName: 'R',
  email: 'r@example.com',
  emailVerified: true,
  avatarUrl: null,
  role: 'reader',
  status: 'active',
};

function appAs(user: CurrentUser | null) {
  return createApp(
    makeTestApiDeps({
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
    }),
  );
}

const post = (body: string, headers: Record<string, string> = {}) => ({
  method: 'POST',
  body,
  headers: { origin: TEST_APP_URL, 'content-type': 'text/plain;charset=UTF-8', ...headers },
});

describe('/api/v1/reading (no database)', () => {
  it('progress needs a session, whatever the method', async () => {
    const body = JSON.stringify({ publicId: 'k7m2xq9p', number: 1, scrollPct: 10 });
    const put = await appAs(null).request('/api/v1/reading/progress', {
      method: 'PUT',
      body,
      headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
    });
    expect(put.status).toBe(401);
    expect(put.headers.get('cache-control')).toBe('no-store');
    expect((await appAs(null).request('/api/v1/reading/progress', post(body))).status).toBe(401);
  });

  it('a beacon body that is not valid progress → 400', async () => {
    for (const body of [
      'not json',
      '{}',
      JSON.stringify({ publicId: 'x', number: 1, scrollPct: 101 }),
    ]) {
      const res = await appAs(reader).request('/api/v1/reading/progress', post(body));
      expect(res.status, body).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('bodies over 4 KB are refused', async () => {
    const res = await appAs(reader).request('/api/v1/reading/progress', post('x'.repeat(5000)));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('a cross-site text/plain beacon is blocked by the CSRF check', async () => {
    const body = JSON.stringify({ publicId: 'k7m2xq9p', number: 1 });
    const res = await appAs(null).request(
      '/api/v1/reading/view',
      post(body, { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
  });
});
