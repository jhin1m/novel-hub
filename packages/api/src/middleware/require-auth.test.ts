import type { CurrentUser } from '@novel-hub/core';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requireAuth, requireRole, requireVerifiedEmail } from './require-auth';
import type { SessionEnv } from './session';

const reader: CurrentUser = {
  id: 'id',
  username: 'u',
  displayName: 'U',
  email: 'u@x.vn',
  emailVerified: false,
  avatarUrl: null,
  role: 'reader',
  status: 'active',
};

/** App thử: gán sẵn user rồi chạy middleware cần test. */
function appWith(user: CurrentUser | null, guard: typeof requireAuth) {
  return new Hono<SessionEnv>()
    .use(async (c, next) => {
      c.set('user', user);
      await next();
    })
    .get('/', guard, (c) => c.json({ username: c.var.authUser.username }));
}

async function statusAndCode(res: Response) {
  const body = (await res.json()) as { error?: { code: string } };
  return [res.status, body.error?.code];
}

describe('requireAuth', () => {
  it('khách → 401, có user → 200 và đọc được authUser', async () => {
    expect(await statusAndCode(await appWith(null, requireAuth).request('/'))).toEqual([
      401,
      'UNAUTHENTICATED',
    ]);
    const res = await appWith(reader, requireAuth).request('/');
    expect(await res.json()).toEqual({ username: 'u' });
  });
});

describe("requireRole('mod', 'admin')", () => {
  const guard = requireRole('mod', 'admin');

  it('reader → 403 FORBIDDEN', async () => {
    expect(await statusAndCode(await appWith(reader, guard).request('/'))).toEqual([
      403,
      'FORBIDDEN',
    ]);
  });

  it('mod và admin → 200', async () => {
    for (const role of ['mod', 'admin'] as const) {
      expect((await appWith({ ...reader, role }, guard).request('/')).status).toBe(200);
    }
  });

  it('khách → 401', async () => {
    expect((await appWith(null, guard).request('/')).status).toBe(401);
  });
});

describe('requireVerifiedEmail', () => {
  it('chưa xác thực → 403 EMAIL_NOT_VERIFIED; đã xác thực → 200', async () => {
    expect(await statusAndCode(await appWith(reader, requireVerifiedEmail).request('/'))).toEqual([
      403,
      'EMAIL_NOT_VERIFIED',
    ]);
    const verified = { ...reader, emailVerified: true };
    expect((await appWith(verified, requireVerifiedEmail).request('/')).status).toBe(200);
  });
});
