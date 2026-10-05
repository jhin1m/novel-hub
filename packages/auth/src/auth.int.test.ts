import { createApp } from '@novel-hub/api';
import { makeTestApiDeps } from '@novel-hub/api/testing';
import type { AuthMailMessage, AuthMailPort } from '@novel-hub/core';
import { accounts, sessions, users } from '@novel-hub/db';
import { seedDatabase } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { usernameSchema } from '@novel-hub/shared';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from './auth';
import { lookupSession } from './current-user';
import { createUserCreateBefore } from './hooks';

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'mat-khau-123';
const { db, pool } = createTestDb();

const mails: AuthMailMessage[] = [];
let sendImpl: AuthMailPort = (msg) => {
  mails.push(msg);
  return Promise.resolve();
};

function buildApp(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string } = {}) {
  const auth = createAuth({
    db,
    env: { APP_URL, BETTER_AUTH_URL: APP_URL, BETTER_AUTH_SECRET: 's'.repeat(32), ...env },
    sendAuthEmail: (msg) => sendImpl(msg),
    mailTimeoutMs: 200,
  });
  return createApp(
    makeTestApiDeps({
      appUrl: APP_URL,
      db,
      auth: { handler: auth.handler, lookupSession: (headers) => lookupSession(auth, headers) },
    }),
  );
}

const app = buildApp();

interface CallOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

function call(path: string, { method = 'POST', body, cookie, headers }: CallOptions = {}) {
  return app.request(path.startsWith('http') ? path : `${APP_URL}/api${path}`, {
    method,
    headers: {
      origin: APP_URL,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookieOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function codeOf(res: Response): Promise<unknown> {
  const body = (await res.json()) as { code?: string };
  return body.code;
}

async function signUp(input: Record<string, unknown> = {}) {
  const res = await call('/auth/sign-up/email', {
    body: { name: 'Lâm Phong', email: 'lp@example.com', password: PASSWORD, ...input },
  });
  return { res, cookie: cookieOf(res) };
}

async function signIn(email: string, password = PASSWORD) {
  const res = await call('/auth/sign-in/email', { body: { email, password } });
  return { res, cookie: cookieOf(res) };
}

async function userByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  if (!row) throw new Error(`Không có user ${email}`);
  return row;
}

async function waitForMail(kind: AuthMailMessage['kind'], to: string): Promise<AuthMailMessage> {
  return vi.waitFor(() => {
    const mail = mails.find((m) => m.kind === kind && m.to === to);
    if (!mail) throw new Error('chưa có mail');
    return mail;
  });
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  mails.length = 0;
  sendImpl = (msg) => {
    mails.push(msg);
    return Promise.resolve();
  };
});

describe('sign-up', () => {
  it('creates a reader/active user, unverified, v7 id, sends verification mail', async () => {
    const { res, cookie } = await signUp({ username: 'lam_phong' });
    expect(res.status).toBe(200);
    expect(cookie).toContain('session_token');

    const user = await userByEmail('lp@example.com');
    expect(user).toMatchObject({
      username: 'lam_phong',
      displayName: 'Lâm Phong',
      role: 'reader',
      status: 'active',
      emailVerified: false,
      avatarUrl: null,
    });
    expect(user.id[14]).toBe('7');

    const mail = await waitForMail('verify', 'lp@example.com');
    expect(mail.displayName).toBe('Lâm Phong');
    expect(mail.url).toMatch(/^http:\/\/localhost:3000\/api\/auth\/verify-email\?token=/);
  });

  it('ignores role, status and image sent by the client', async () => {
    const { res } = await signUp({
      username: 'lam_phong',
      role: 'admin',
      status: 'banned',
      image: 'http://evil.example/a.png',
    });
    expect(res.status).toBe(200);
    expect(await userByEmail('lp@example.com')).toMatchObject({
      role: 'reader',
      status: 'active',
      avatarUrl: null,
    });
  });

  it('malformed username → 400 USERNAME_INVALID', async () => {
    for (const username of ['AB', 'có dấu', 'admin', '']) {
      const { res } = await signUp({ username });
      expect(res.status, username).toBe(400);
      expect(await codeOf(res)).toBe('USERNAME_INVALID');
    }
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('duplicate username → 400 USERNAME_TAKEN', async () => {
    await signUp({ username: 'lam_phong' });
    const { res } = await signUp({ username: 'lam_phong', email: 'khac@example.com' });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('USERNAME_TAKEN');
  });

  it('empty or too long display name → 400 DISPLAY_NAME_INVALID', async () => {
    for (const name of ['', '   ', 'a'.repeat(200)]) {
      const { res } = await signUp({ username: 'lam_phong', name });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('DISPLAY_NAME_INVALID');
    }
  });

  it('display name is trimmed', async () => {
    await signUp({ username: 'lam_phong', name: '  Lâm Phong  ' });
    expect((await userByEmail('lp@example.com')).displayName).toBe('Lâm Phong');
  });

  it('no username sent → generated from email, with suffix, matches schema', async () => {
    const { res } = await signUp({ email: 'duc.anh@example.com' });
    expect(res.status).toBe(200);
    const { username } = await userByEmail('duc.anh@example.com');
    expect(username).toMatch(/^duc_anh_[a-z0-9]{4}$/);
    expect(usernameSchema.safeParse(username).success).toBe(true);
  });

  it('existing email → 422', async () => {
    await signUp({ username: 'lam_phong' });
    const { res } = await signUp({ username: 'nguoi_khac' });
    expect(res.status).toBe(422);
  });

  it('hanging mail gateway → sign-up still returns within 1.5 seconds', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendImpl = () => new Promise(() => {});
    const started = Date.now();
    const { res } = await signUp({ username: 'lam_phong' });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1500);
    // Past `mailTimeoutMs` the error is logged.
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('mail gateway throws → sign-up still succeeds', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendImpl = () => Promise.reject(new Error('smtp down'));
    const { res } = await signUp({ username: 'lam_phong' });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('foreign Origin → 403', async () => {
    const res = await call('/auth/sign-up/email', {
      body: { name: 'X', username: 'xxx', email: 'x@example.com', password: PASSWORD },
      headers: { origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe('user update', () => {
  it('sending username or image → rejected, DB unchanged; valid name → updated', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });

    let res = await call('/auth/update-user', { body: { username: 'ten_moi' }, cookie });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('USERNAME_IMMUTABLE');

    res = await call('/auth/update-user', { body: { image: 'http://x/a.png' }, cookie });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('IMAGE_NOT_ALLOWED');

    res = await call('/auth/update-user', { body: { name: '' }, cookie });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('DISPLAY_NAME_INVALID');

    expect(await userByEmail('lp@example.com')).toMatchObject({
      username: 'lam_phong',
      avatarUrl: null,
      displayName: 'Lâm Phong',
    });

    res = await call('/auth/update-user', { body: { name: ' Phong Mới ' }, cookie });
    expect(res.status).toBe(200);
    expect((await userByEmail('lp@example.com')).displayName).toBe('Phong Mới');
  });

  it('role/status cannot be set by the user', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    for (const body of [{ role: 'admin' }, { status: 'active' }]) {
      const res = await call('/auth/update-user', { body, cookie });
      expect(res.status).toBe(400);
    }
    expect(await userByEmail('lp@example.com')).toMatchObject({ role: 'reader', status: 'active' });
  });

  it('image: null is also rejected (avatar changes only via the upload route)', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    const res = await call('/auth/update-user', { body: { image: null }, cookie });
    expect(res.status).toBe(400);
  });
});

describe('sign-in and /api/v1/me', () => {
  it('can sign in without verifying email', async () => {
    await signUp({ username: 'lam_phong' });
    const { res, cookie } = await signIn('lp@example.com');
    expect(res.status).toBe(200);
    expect(cookie).toContain('session_token');
  });

  it('wrong password → 401', async () => {
    await signUp({ username: 'lam_phong' });
    expect((await signIn('lp@example.com', 'sai-mat-khau')).res.status).toBe(401);
  });

  it('/api/v1/me: no cookie → 401; with cookie → 200, no id', async () => {
    expect((await call('/v1/me', { method: 'GET' })).status).toBe(401);

    const { cookie } = await signUp({ username: 'lam_phong' });
    const res = await call('/v1/me', { method: 'GET', cookie });
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
    expect(text).not.toContain((await userByEmail('lp@example.com')).id);
  });

  it('sign-out → old cookie is invalidated', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    expect((await call('/auth/sign-out', { body: {}, cookie })).status).toBe(200);
    expect((await call('/v1/me', { method: 'GET', cookie })).status).toBe(401);
  });

  it('seeded user can sign in with the seed password', async () => {
    await seedDatabase(db, { hashPassword, password: PASSWORD });
    const [seeded] = await db.select().from(users).where(eq(users.status, 'active')).limit(1);
    if (!seeded) throw new Error('seed không có user active');
    expect((await signIn(seeded.email)).res.status).toBe(200);
  });
});

describe('muted user', () => {
  it('can still sign in and use the session (mute only blocks comments, in Stage 2)', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    await db.update(users).set({ status: 'muted' }).where(eq(users.email, 'lp@example.com'));
    expect((await signIn('lp@example.com')).res.status).toBe(200);
    const res = await call('/v1/me', { method: 'GET', cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { status: string } }).user.status).toBe('muted');
  });
});

describe('banned user', () => {
  it('cannot sign in; old session is blocked at /api/auth/* and /api/v1/*', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    await db.update(users).set({ status: 'banned' }).where(eq(users.email, 'lp@example.com'));

    const signInRes = (await signIn('lp@example.com')).res;
    expect(signInRes.status).toBe(403);
    expect(await codeOf(signInRes)).toBe('ACCOUNT_BANNED');

    const update = await call('/auth/update-user', { body: { name: 'X' }, cookie });
    expect(update.status).toBe(403);
    expect(await codeOf(update)).toBe('ACCOUNT_BANNED');

    expect((await call('/v1/me', { method: 'GET', cookie })).status).toBe(401);
    // Sign-out is still allowed so the cookie can be cleared.
    expect((await call('/auth/sign-out', { body: {}, cookie })).status).toBe(200);
  });
});

describe('session renewal', () => {
  /** Push the session to an "older than updateAge" state so Better Auth renews it on next use. */
  async function ageSessions(email: string) {
    const user = await userByEmail(email);
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.userId, user.id));
    return user.id;
  }

  async function sessionExpiry(userId: string): Promise<number> {
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
    if (!row) throw new Error('không có session');
    return row.expiresAt.getTime();
  }

  for (const path of ['/v1/me', '/auth/get-session']) {
    it(`GET ${path} renews the session in the DB and sends a new cookie to the browser`, async () => {
      const { cookie } = await signUp({ username: 'lam_phong' });
      const userId = await ageSessions('lp@example.com');
      const before = await sessionExpiry(userId);

      const res = await call(path, { method: 'GET', cookie });
      expect(res.status).toBe(200);
      expect(await sessionExpiry(userId)).toBeGreaterThan(before);
      expect(res.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(true);
    });
  }
});

describe('email verification', () => {
  it('opening the mail link → emailVerified = true, redirects to callbackURL', async () => {
    await signUp({ username: 'lam_phong', callbackURL: '/' });
    const mail = await waitForMail('verify', 'lp@example.com');
    const res = await call(mail.url, { method: 'GET' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect((await userByEmail('lp@example.com')).emailVerified).toBe(true);
  });

  it('email registered first by someone else: owner clicks verification link → squatter loses session and password', async () => {
    const squatter = await signUp({ username: 'ke_chiem', email: 'victim@example.com' });
    const mail = await waitForMail('verify', 'victim@example.com');

    // The email owner clicks the link from another browser (without the squatter's cookie).
    const res = await call(mail.url, { method: 'GET' });
    expect(res.status).toBe(302);
    const ownerCookie = cookieOf(res);

    expect((await call('/v1/me', { method: 'GET', cookie: squatter.cookie })).status).toBe(401);
    expect((await signIn('victim@example.com')).res.status).toBe(401);
    const me = await call('/v1/me', { method: 'GET', cookie: ownerCookie });
    expect(me.status).toBe(200);
    expect((await userByEmail('victim@example.com')).emailVerified).toBe(true);
  });

  it('clicking the link a second time (already verified) → nothing more is deleted', async () => {
    await signUp({ username: 'lam_phong' });
    const mail = await waitForMail('verify', 'lp@example.com');
    const first = await call(mail.url, { method: 'GET' });
    const cookie = cookieOf(first);
    await call(mail.url, { method: 'GET' });
    expect((await call('/v1/me', { method: 'GET', cookie })).status).toBe(200);
  });

  it('resends the verification mail', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    await waitForMail('verify', 'lp@example.com');
    mails.length = 0;
    const res = await call('/auth/send-verification-email', {
      body: { email: 'lp@example.com', callbackURL: '/' },
      cookie,
    });
    expect(res.status).toBe(200);
    await waitForMail('verify', 'lp@example.com');
  });
});

describe('password reset', () => {
  async function requestReset(email: string): Promise<string> {
    const res = await call('/auth/request-password-reset', {
      body: { email, redirectTo: '/reset-password' },
    });
    expect(res.status).toBe(200);
    const mail = await waitForMail('reset', email);
    const token = new URL(mail.url).pathname.split('/').pop();
    if (!token) throw new Error('URL reset không có token');
    return token;
  }

  it('revokes old sessions, new password works, email becomes verified', async () => {
    const { cookie } = await signUp({ username: 'lam_phong' });
    const token = await requestReset('lp@example.com');

    const res = await call('/auth/reset-password', {
      body: { token, newPassword: 'mat-khau-moi-456' },
    });
    expect(res.status).toBe(200);

    const user = await userByEmail('lp@example.com');
    expect(user.emailVerified).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect((await call('/v1/me', { method: 'GET', cookie })).status).toBe(401);
    expect((await signIn('lp@example.com')).res.status).toBe(401);
    expect((await signIn('lp@example.com', 'mat-khau-moi-456')).res.status).toBe(200);
  });

  it('token used a second time → 400', async () => {
    await signUp({ username: 'lam_phong' });
    const token = await requestReset('lp@example.com');
    await call('/auth/reset-password', { body: { token, newPassword: 'mat-khau-moi-456' } });
    const again = await call('/auth/reset-password', { body: { token, newPassword: 'khac-789' } });
    expect(again.status).toBe(400);
  });

  it('email registered first by someone else: owner resets → squatter loses access', async () => {
    // The squatter signs up with the victim's email and cannot verify it.
    const squatter = await signUp({ username: 'ke_chiem', email: 'victim@example.com' });
    const token = await requestReset('victim@example.com');
    await call('/auth/reset-password', { body: { token, newPassword: 'cua-chu-that-1' } });

    expect((await call('/v1/me', { method: 'GET', cookie: squatter.cookie })).status).toBe(401);
    expect((await signIn('victim@example.com')).res.status).toBe(401);
    expect((await signIn('victim@example.com', 'cua-chu-that-1')).res.status).toBe(200);
  });

  it('unknown email → still 200, no mail sent', async () => {
    const res = await call('/auth/request-password-reset', {
      body: { email: 'khong-co@example.com', redirectTo: '/reset-password' },
    });
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(0);
  });
});

describe('Google OAuth (config)', () => {
  it('with GOOGLE_* pair → sign-in/social returns a Google URL', async () => {
    const googleApp = buildApp({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    const res = await googleApp.request(`${APP_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { origin: APP_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(`${APP_URL}/api/auth/callback/google`);
  });

  it('without GOOGLE_* → google provider does not exist', async () => {
    const res = await call('/auth/sign-in/social', { body: { provider: 'google' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('hook creating a user from an OAuth profile: drops image, normalizes name, generates username', async () => {
    const before = createUserCreateBefore(db);
    const now = new Date();
    const base = {
      id: '',
      email: 'g.user@gmail.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    };
    for (const [name, expected] of [
      ['  Google User  ', 'Google User'],
      ['x'.repeat(80), 'x'.repeat(50)],
    ] as const) {
      const result = await before({ ...base, name, image: 'https://lh3.google/a.png' }, null);
      if (!result || typeof result !== 'object') throw new Error('hook phải trả data');
      expect(result.data).toMatchObject({ name: expected, image: null });
      expect(String(result.data.username)).toMatch(/^g_user_[a-z0-9]{4}$/);
    }
    // Empty name → use the username as the display name.
    const empty = await before({ ...base, name: '', image: null }, null);
    if (!empty || typeof empty !== 'object') throw new Error('hook phải trả data');
    expect(empty.data.name).toBe(empty.data.username);
  });
});

describe('table data', () => {
  it('credential account is created on sign-up', async () => {
    await signUp({ username: 'lam_phong' });
    const user = await userByEmail('lp@example.com');
    const rows = await db.select().from(accounts).where(eq(accounts.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ providerId: 'credential', accountId: user.id });
  });
});
