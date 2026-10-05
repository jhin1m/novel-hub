import type { CurrentUser } from '@novel-hub/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const reader: CurrentUser = {
  id: '01920000-0000-7000-8000-000000000009',
  username: 'reader',
  displayName: 'R',
  email: 'r@example.com',
  emailVerified: false,
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

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
});

/** Every personal route of the library and the reading history. */
const PERSONAL_ROUTES: [string, string, unknown?][] = [
  ['GET', '/api/v1/library?shelf=reading'],
  ['GET', '/api/v1/library/k7m2xq9p'],
  ['PUT', '/api/v1/library/k7m2xq9p', { shelf: 'plan' }],
  ['DELETE', '/api/v1/library/k7m2xq9p'],
  ['GET', '/api/v1/reading/progress/k7m2xq9p'],
  ['GET', '/api/v1/reading/history'],
  ['DELETE', '/api/v1/reading/history/k7m2xq9p'],
];

describe('/api/v1/library and reading history (no database)', () => {
  it('guests get 401 on every route, never cached', async () => {
    for (const [method, path, body] of PERSONAL_ROUTES) {
      const res = await appAs(null).request(path, send(method, body));
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    }
  });

  it('malformed input → 400 before touching the database', async () => {
    for (const [method, path, body] of [
      ['GET', '/api/v1/library'],
      ['GET', '/api/v1/library?shelf=history'],
      ['GET', '/api/v1/library/not-an-id'],
      ['PUT', '/api/v1/library/k7m2xq9p', { shelf: 'history' }],
      ['PUT', '/api/v1/library/k7m2xq9o', { shelf: 'plan' }],
      ['DELETE', '/api/v1/library/x'],
      ['GET', '/api/v1/reading/progress/x'],
      ['GET', '/api/v1/reading/history?cursor=abc'],
      ['DELETE', '/api/v1/reading/history/x'],
    ] as [string, string, unknown?][]) {
      const res = await appAs(reader).request(path, send(method, body));
      expect(res.status, `${method} ${path}`).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('a cross-site form-style write is blocked by the CSRF check', async () => {
    // JSON requests from another origin are stopped by the CORS preflight instead.
    const res = await appAs(reader).request('/api/v1/library/k7m2xq9p', {
      method: 'PUT',
      body: JSON.stringify({ shelf: 'plan' }),
      headers: { origin: 'https://evil.example', 'content-type': 'text/plain' },
    });
    expect(res.status).toBe(403);
  });
});
