import type { HealthReport } from '@novel-hub/core';
import { testClient } from 'hono/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { ApiDeps } from './deps';
import { TEST_APP_URL, makeTestApiDeps } from './testing';

// `expect.any` returns `any`; assign through `unknown` to keep typed lint happy.
const anyString: unknown = expect.any(String);
const okReport: HealthReport = { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
const downReport: HealthReport = { status: 'unhealthy', checks: { postgres: 'up', redis: 'down' } };

const APP_URL = TEST_APP_URL;

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return makeTestApiDeps({
    checkHealth: () => Promise.resolve(okReport),
    auth: {
      handler: () => Promise.resolve(Response.json({ from: 'better-auth' })),
      lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
    },
    ...overrides,
  });
}

function appWith(report: HealthReport) {
  return createApp(deps({ checkHealth: () => Promise.resolve(report) }));
}

describe('GET /api/v1/health', () => {
  it('dependencies ok → 200 + no-store', async () => {
    const res = await testClient(appWith(okReport)).api.v1.health.$get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(okReport);
  });

  it('dependency down → 503 with error UNHEALTHY and checks', async () => {
    const res = await testClient(appWith(downReport)).api.v1.health.$get();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: { code: 'UNHEALTHY', message: anyString },
      checks: downReport.checks,
    });
  });

  it('HEAD is answered by Hono', async () => {
    const res = await appWith(okReport).request('/api/v1/health', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unknown route → 404 NOT_FOUND', async () => {
    const app = appWith(okReport);
    for (const path of ['/api/khong-ton-tai', '/api/v1/khong-ton-tai']) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: anyString },
      });
    }
    const res = await app.request('/api/khong-ton-tai');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('handler throws → 500 INTERNAL_ERROR, no stack or original message leaked', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(
      deps({ checkHealth: () => Promise.reject(new Error('mật-khẩu-db-bí-mật')) }),
    );
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: anyString },
    });
    expect(text).not.toContain('mật-khẩu-db-bí-mật');
    expect(text).not.toContain('at ');
    expect(log).toHaveBeenCalled();
  });
});

describe('/api/auth/*', () => {
  it('forwards the request unchanged to Better Auth', async () => {
    const seen: string[] = [];
    const app = createApp(
      deps({
        auth: {
          handler: (req) => {
            seen.push(`${req.method} ${new URL(req.url).pathname}`);
            return Promise.resolve(Response.json({ ok: true }));
          },
          lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
        },
      }),
    );
    expect((await app.request('/api/auth/get-session')).status).toBe(200);
    expect((await app.request('/api/auth/sign-in/email', { method: 'POST' })).status).toBe(200);
    expect(seen).toEqual(['GET /api/auth/get-session', 'POST /api/auth/sign-in/email']);
  });
});

describe('GET /api/v1/me', () => {
  it('guest → 401 UNAUTHENTICATED', async () => {
    const res = await testClient(createApp(deps())).api.v1.me.$get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: anyString } });
  });

  // The signed-in body needs the database: `routes/me.int.test.ts`.
  it('cookie header is passed to lookupSession; Set-Cookie is sent back', async () => {
    let cookie: string | null = null;
    const renewed = ['phien=moi; Path=/; HttpOnly', 'phien_data=; Max-Age=0'];
    const app = createApp(
      deps({
        auth: {
          ...deps().auth,
          lookupSession: (headers) => {
            cookie = headers.get('cookie');
            // An expired session: no user, and the cookies that clear it.
            return Promise.resolve({ user: null, setCookies: renewed });
          },
        },
      }),
    );
    const res = await app.request('/api/v1/me', { headers: { cookie: 'a=b' } });
    expect(res.status).toBe(401);
    expect(cookie).toBe('a=b');
    expect(res.headers.getSetCookie()).toEqual(renewed);
  });

  it('health does not look up the session: lookupSession failing (DB down) still returns health normally', async () => {
    const app = createApp(
      deps({
        auth: { ...deps().auth, lookupSession: () => Promise.reject(new Error('db down')) },
      }),
    );
    const res = await app.request('/api/v1/health', { headers: { cookie: 'a=b' } });
    expect(res.status).toBe(200);
  });
});

describe('CSRF /api/v1/*', () => {
  const form = (origin: string) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    body: 'a=1',
  });

  it('form POST from a foreign origin → 403', async () => {
    const res = await createApp(deps()).request('/api/v1/me', form('http://evil.example'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'FORBIDDEN', message: anyString } });
  });

  it('form POST from the same origin → passes through (route has no POST → 404)', async () => {
    const res = await createApp(deps()).request('/api/v1/me', form(APP_URL));
    expect(res.status).toBe(404);
  });
});

describe('makeTestApiDeps', () => {
  it('builds an app; a route that needs db fails with a clear message when db is not passed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createApp(makeTestApiDeps()).request('/api/v1/tags');
    expect(res.status).toBe(500);
    expect(String(log.mock.calls[0]?.[1])).toContain('db is not used in this test');
    log.mockRestore();
  });
});
