import type { CurrentUser, HealthReport } from '@novel-hub/core';
import { testClient } from 'hono/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { ApiDeps } from './deps';

// `expect.any` trả `any`; gán qua `unknown` để giữ lint có type.
const anyString: unknown = expect.any(String);
const okReport: HealthReport = { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
const downReport: HealthReport = { status: 'unhealthy', checks: { postgres: 'up', redis: 'down' } };

const APP_URL = 'http://localhost:3000';

const user: CurrentUser = {
  id: '01a107a5-0000-7000-8000-000000000000',
  username: 'lam_phong',
  displayName: 'Lâm Phong',
  email: 'lp@example.com',
  emailVerified: false,
  avatarUrl: null,
  role: 'reader',
  status: 'active',
};

function deps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    checkHealth: () => Promise.resolve(okReport),
    appUrl: APP_URL,
    auth: {
      handler: () => Promise.resolve(Response.json({ from: 'better-auth' })),
      lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
    },
    ...overrides,
  };
}

function appWith(report: HealthReport) {
  return createApp(deps({ checkHealth: () => Promise.resolve(report) }));
}

describe('GET /api/v1/health', () => {
  it('phụ thuộc ok → 200 + no-store', async () => {
    const res = await testClient(appWith(okReport)).api.v1.health.$get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(okReport);
  });

  it('phụ thuộc down → 503 với error UNHEALTHY và checks', async () => {
    const res = await testClient(appWith(downReport)).api.v1.health.$get();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: { code: 'UNHEALTHY', message: anyString },
      checks: downReport.checks,
    });
  });

  it('HEAD được Hono trả lời', async () => {
    const res = await appWith(okReport).request('/api/v1/health', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('lỗi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('route không tồn tại → 404 NOT_FOUND', async () => {
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

  it('handler throw → 500 INTERNAL_ERROR, không lộ stack hay message gốc', async () => {
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
  it('chuyển nguyên request cho Better Auth', async () => {
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
  it('khách → 401 UNAUTHENTICATED', async () => {
    const res = await testClient(createApp(deps())).api.v1.me.$get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: anyString } });
  });

  it('đã đăng nhập → 200, không có id hay email', async () => {
    const app = createApp(
      deps({
        auth: { ...deps().auth, lookupSession: () => Promise.resolve({ user, setCookies: [] }) },
      }),
    );
    const res = await testClient(app).api.v1.me.$get();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      user: {
        username: 'lam_phong',
        displayName: 'Lâm Phong',
        avatarUrl: null,
        role: 'reader',
        status: 'active',
        emailVerified: false,
      },
    });
    expect(text).not.toContain(user.id);
    expect(text).not.toContain(user.email);
  });

  it('header cookie được chuyển cho lookupSession; Set-Cookie gia hạn được gửi về', async () => {
    let cookie: string | null = null;
    const renewed = ['phien=moi; Path=/; HttpOnly', 'phien_data=; Max-Age=0'];
    const app = createApp(
      deps({
        auth: {
          ...deps().auth,
          lookupSession: (headers) => {
            cookie = headers.get('cookie');
            return Promise.resolve({ user, setCookies: renewed });
          },
        },
      }),
    );
    const res = await app.request('/api/v1/me', { headers: { cookie: 'a=b' } });
    expect(cookie).toBe('a=b');
    expect(res.headers.getSetCookie()).toEqual(renewed);
  });

  it('health không tra phiên: lookupSession lỗi (DB sập) vẫn trả health bình thường', async () => {
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

  it('POST form từ origin lạ → 403', async () => {
    const res = await createApp(deps()).request('/api/v1/me', form('http://evil.example'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'FORBIDDEN', message: anyString } });
  });

  it('POST form cùng origin → đi tiếp (route không có POST → 404)', async () => {
    const res = await createApp(deps()).request('/api/v1/me', form(APP_URL));
    expect(res.status).toBe(404);
  });
});
