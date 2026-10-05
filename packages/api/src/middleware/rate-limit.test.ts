import type { CurrentUser, RateLimitDecision, RateLimiter } from '@novel-hub/core';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const author: CurrentUser = {
  id: '01920000-0000-7000-8000-000000000001',
  username: 'author',
  displayName: 'A',
  email: 'a@example.com',
  emailVerified: true,
  avatarUrl: null,
  role: 'author',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function fakeLimiter(decision: RateLimitDecision) {
  return {
    check: vi.fn<RateLimiter['check']>(() => Promise.resolve(decision)),
    recordFailure: vi.fn<RateLimiter['recordFailure']>(() => Promise.resolve()),
    clearFailures: vi.fn<RateLimiter['clearFailures']>(() => Promise.resolve()),
  };
}

function appWith(user: CurrentUser | null, rateLimit: RateLimiter | null) {
  return createApp(
    makeTestApiDeps({
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
      rateLimit,
      clientIp: () => '203.0.113.9',
    }),
  );
}

const createStory = (app: ReturnType<typeof appWith>) =>
  app.request(`${TEST_APP_URL}/api/v1/stories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: TEST_APP_URL },
    body: JSON.stringify({}),
  });

describe('rateLimit middleware on /api/v1', () => {
  it('over the limit → 429 RATE_LIMITED with Retry-After, before the handler runs', async () => {
    const limiter = fakeLimiter({ allowed: false, retryAfterSec: 120 });
    const res = await createStory(appWith(author, limiter));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
    expect(await res.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' },
    });
    expect(limiter.check).toHaveBeenCalledWith('createStory', {
      user: { id: author.id, createdAt: author.createdAt },
      ip: '203.0.113.9',
    });
  });

  it('signed out → 401 without counting', async () => {
    const limiter = fakeLimiter({ allowed: false, retryAfterSec: 1 });
    const res = await createStory(appWith(null, limiter));
    expect(res.status).toBe(401);
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it('allowed → the request reaches validation', async () => {
    const res = await createStory(
      appWith(author, fakeLimiter({ allowed: true, retryAfterSec: 0 })),
    );
    expect(res.status).toBe(400);
  });

  it('no limiter → every request passes', async () => {
    expect((await createStory(appWith(author, null))).status).toBe(400);
  });
});
