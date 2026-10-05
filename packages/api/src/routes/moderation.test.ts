import type { CurrentUser, RateLimiter } from '@novel-hub/core';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const user = (role: CurrentUser['role']): CurrentUser => ({
  id: '01920000-0000-7000-8000-000000000009',
  username: role,
  displayName: 'U',
  email: `${role}@example.com`,
  emailVerified: false,
  avatarUrl: null,
  role,
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

function appAs(current: CurrentUser | null, rateLimit: RateLimiter | null = null) {
  return createApp(
    makeTestApiDeps({
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user: current, setCookies: [] }),
      },
      rateLimit,
      clientIp: () => '203.0.113.9',
    }),
  );
}

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
});

const MODERATION_ROUTES: [string, string, unknown?][] = [
  ['GET', '/api/v1/moderation/reports'],
  ['POST', '/api/v1/moderation/actions', { action: 'ban_user', username: 'author' }],
];

describe('/api/v1/moderation (no database)', () => {
  it('guests get 401, readers and authors 403, never cached', async () => {
    for (const [method, path, body] of MODERATION_ROUTES) {
      const guest = await appAs(null).request(path, send(method, body));
      expect(guest.status, `${method} ${path}`).toBe(401);
      expect(guest.headers.get('cache-control')).toBe('no-store');
      for (const role of ['reader', 'author'] as const) {
        const res = await appAs(user(role)).request(path, send(method, body));
        expect(res.status, `${role} ${method} ${path}`).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
      }
    }
  });

  it('rejects malformed actions with 400 before touching the database', async () => {
    for (const body of [
      {},
      { action: 'delete_everything' },
      { action: 'hide_chapter', storyPublicId: 'k7m2xq9p' },
      { action: 'ban_user', username: 'Not Valid' },
    ]) {
      const res = await appAs(user('mod')).request(
        '/api/v1/moderation/actions',
        send('POST', body),
      );
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });
});

describe('POST /api/v1/reports (no database)', () => {
  const body = { target: { type: 'story', storyPublicId: 'k7m2xq9p' }, reason: 'spam' };

  it('requires signing in', async () => {
    const res = await appAs(null).request('/api/v1/reports', send('POST', body));
    expect(res.status).toBe(401);
  });

  it('is rate limited per user and IP, before validation', async () => {
    const limiter = {
      check: vi.fn<RateLimiter['check']>(() =>
        Promise.resolve({ allowed: false, retryAfterSec: 60 }),
      ),
      recordFailure: vi.fn<RateLimiter['recordFailure']>(() => Promise.resolve()),
      clearFailures: vi.fn<RateLimiter['clearFailures']>(() => Promise.resolve()),
    };
    const reader = user('reader');
    const res = await appAs(reader, limiter).request('/api/v1/reports', send('POST', {}));
    expect(res.status).toBe(429);
    expect(limiter.check).toHaveBeenCalledWith('report', {
      user: { id: reader.id, createdAt: reader.createdAt },
      ip: '203.0.113.9',
    });
  });

  it('rejects malformed reports with 400', async () => {
    for (const bad of [
      {},
      { ...body, reason: 'duplicate' },
      { ...body, target: { type: 'story', storyId: '01920000-0000-7000-8000-000000000001' } },
      { ...body, detail: 'x'.repeat(1_001) },
    ]) {
      const res = await appAs(user('reader')).request('/api/v1/reports', send('POST', bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
