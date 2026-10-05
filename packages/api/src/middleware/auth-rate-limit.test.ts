import type { RateLimitDecision, RateLimiter } from '@novel-hub/core';
import { CLIENT_IP_HEADER } from '@novel-hub/shared';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

interface Seen {
  ipHeader: string | null;
  body: string;
}

function setup({
  decision = { allowed: true, retryAfterSec: 0 },
  status = 200,
  ip = '203.0.113.9',
}: { decision?: RateLimitDecision; status?: number; ip?: string | null } = {}) {
  const limiter = {
    check: vi.fn<RateLimiter['check']>(() => Promise.resolve(decision)),
    recordFailure: vi.fn<RateLimiter['recordFailure']>(() => Promise.resolve()),
    clearFailures: vi.fn<RateLimiter['clearFailures']>(() => Promise.resolve()),
  };
  const seen: Seen[] = [];
  const app = createApp(
    makeTestApiDeps({
      auth: {
        handler: async (request) => {
          seen.push({
            ipHeader: request.headers.get(CLIENT_IP_HEADER),
            body: await request.text(),
          });
          return new Response('{}', { status });
        },
        lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
      },
      rateLimit: limiter,
      clientIp: () => ip,
    }),
  );
  return { app, limiter, seen };
}

function post(
  app: ReturnType<typeof setup>['app'],
  path: string,
  body: string,
  type = 'application/json',
  headers: Record<string, string> = {},
) {
  return app.request(`${TEST_APP_URL}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': type, origin: TEST_APP_URL, ...headers },
    body,
  });
}

const signInBody = JSON.stringify({ email: 'reader@example.com', password: 'x' });

describe('authRateLimit', () => {
  it('checks a limited path with the IP and email, and the handler still gets the body', async () => {
    const { app, limiter, seen } = setup();
    expect((await post(app, '/sign-in/email', signInBody)).status).toBe(200);
    expect(limiter.check).toHaveBeenCalledWith('signIn', {
      ip: '203.0.113.9',
      email: 'reader@example.com',
    });
    expect(seen[0]?.body).toBe(signInBody);
  });

  it('reads the email from a urlencoded sign-in too', async () => {
    const { app, limiter } = setup();
    await post(
      app,
      '/sign-in/email',
      'email=form%40example.com&password=x',
      'application/x-www-form-urlencoded',
    );
    expect(limiter.check).toHaveBeenCalledWith(
      'signIn',
      expect.objectContaining({ email: 'form@example.com' }),
    );
  });

  it('keys on the email Better Auth acts on, not a decoy in the same body', async () => {
    const repeated = setup();
    await post(
      repeated.app,
      '/sign-in/email',
      'email=decoy%40example.com&email=victim%40example.com&password=x',
      'application/x-www-form-urlencoded',
    );
    expect(repeated.limiter.check).toHaveBeenCalledWith(
      'signIn',
      expect.objectContaining({ email: 'victim@example.com' }),
    );

    // JSON wins over a urlencoded token smuggled into a content-type parameter, as in better-call.
    const smuggled = setup();
    await post(
      smuggled.app,
      '/request-password-reset',
      JSON.stringify({ email: 'victim@example.com', z: '&email=decoy@example.com' }),
      'application/json; x=application/x-www-form-urlencoded',
    );
    expect(smuggled.limiter.check).toHaveBeenCalledWith(
      'forgotPassword',
      expect.objectContaining({ email: 'victim@example.com' }),
    );
  });

  it('a trailing slash does not skip the check', async () => {
    const { app, limiter } = setup();
    await post(app, '/sign-in/email/', signInBody);
    expect(limiter.check).toHaveBeenCalledWith('signIn', expect.anything());
  });

  it('over the limit → 429 in Better Auth shape with Retry-After; the handler never runs', async () => {
    const { app, seen } = setup({ decision: { allowed: false, retryAfterSec: 600 } });
    const res = await post(app, '/request-password-reset', JSON.stringify({ email: 'a@b.c' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('600');
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED', retryAfterSec: 600 });
    expect(seen).toHaveLength(0);
  });

  it('counts a 401 sign-in as a failure of that email, and nothing else', async () => {
    const failed = setup({ status: 401 });
    await post(failed.app, '/sign-in/email', signInBody);
    expect(failed.limiter.recordFailure).toHaveBeenCalledWith('signIn', 'reader@example.com');

    const ok = setup({ status: 200 });
    await post(ok.app, '/sign-in/email', signInBody);
    const otherPath = setup({ status: 401 });
    await post(otherPath.app, '/sign-up/email', signInBody);
    expect(ok.limiter.recordFailure).not.toHaveBeenCalled();
    expect(otherPath.limiter.recordFailure).not.toHaveBeenCalled();
  });

  it('a body that is not JSON only gets the IP limits and reaches the handler untouched', async () => {
    const { app, limiter, seen } = setup();
    await post(app, '/sign-up/email', 'not json', 'text/plain');
    expect(limiter.check).toHaveBeenCalledWith('signUp', { ip: '203.0.113.9', email: undefined });
    expect(seen[0]?.body).toBe('not json');
  });

  it('a body over 16 KB on a limited path → 413, so padding cannot skip the email limits', async () => {
    const { app, limiter, seen } = setup();
    const padded = JSON.stringify({ email: 'reader@example.com', pad: 'x'.repeat(17 * 1024) });
    expect((await post(app, '/sign-in/email', padded)).status).toBe(413);
    expect(limiter.check).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it('paths and methods outside the list are not checked but still get the IP header', async () => {
    const { app, limiter, seen } = setup();
    await post(app, '/sign-out', '{}');
    await app.request(`${TEST_APP_URL}/api/auth/get-session`);
    expect(limiter.check).not.toHaveBeenCalled();
    expect(seen.map((s) => s.ipHeader)).toEqual(['203.0.113.9', '203.0.113.9']);
  });

  it('replaces a client-sent IP header, and drops it when the address is unknown', async () => {
    const spoof = { [CLIENT_IP_HEADER]: '198.51.100.1' };
    const known = setup();
    await post(known.app, '/sign-out', '{}', 'application/json', spoof);
    expect(known.seen[0]?.ipHeader).toBe('203.0.113.9');

    const unknown = setup({ ip: null });
    await post(unknown.app, '/sign-out', '{}', 'application/json', spoof);
    expect(unknown.seen[0]?.ipHeader).toBeNull();
  });
});
