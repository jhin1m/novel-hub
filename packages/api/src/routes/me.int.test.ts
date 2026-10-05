import type { CurrentUser } from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { testClient } from 'hono/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function insertUser(preferences: Record<string, unknown>): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username: 'lam_phong',
      displayName: 'Lâm Phong',
      email: 'lp@example.com',
      preferences,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl,
    role: row.role,
    status: row.status,
  };
}

function appAs(user: CurrentUser | null) {
  return createApp(
    makeTestApiDeps({
      db,
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
    }),
  );
}

describe('GET /api/v1/me', () => {
  it('signed in → 200 with preferences, no id or email', async () => {
    const user = await insertUser({ showMature: true });
    const res = await testClient(appAs(user)).api.v1.me.$get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      user: {
        username: 'lam_phong',
        displayName: 'Lâm Phong',
        avatarUrl: null,
        role: 'reader',
        status: 'active',
        emailVerified: false,
        preferences: { showMature: true },
      },
    });
    expect(text).not.toContain(user.id);
    expect(text).not.toContain(user.email);
  });

  it('preferences default when none are stored', async () => {
    const user = await insertUser({});
    const res = await testClient(appAs(user)).api.v1.me.$get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.preferences).toEqual({ showMature: false });
  });

  it('guest → 401', async () => {
    const res = await testClient(appAs(null)).api.v1.me.$get();
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/me/preferences', () => {
  const reader = {
    theme: 'sepia',
    font: 'inter',
    fontSize: 24,
    lineHeight: 2,
    paragraphSpacing: 1.5,
    width: 'wide',
    align: 'justify',
    updatedAt: 1_700_000_000_000,
  } as const;

  it('guest → 401', async () => {
    const res = await testClient(appAs(null)).api.v1.me.preferences.$patch({
      json: { reader },
    });
    expect(res.status).toBe(401);
  });

  it('turning 18+ on without confirming the age → 400 ADULT_CONFIRMATION_REQUIRED', async () => {
    const user = await insertUser({});
    const res = await testClient(appAs(user)).api.v1.me.preferences.$patch({
      json: { showMature: true },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'ADULT_CONFIRMATION_REQUIRED' } });
  });

  it('unknown fields or invalid settings → 400 VALIDATION_ERROR', async () => {
    const user = await insertUser({});
    const client = testClient(appAs(user));
    for (const json of [{ role: 'admin' }, { reader: { ...reader, fontSize: 40 } }]) {
      const res = await client.api.v1.me.preferences.$patch({ json });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('saves and returns the merged preferences, uncached; GET /me sees them', async () => {
    const user = await insertUser({ showMature: true });
    const client = testClient(appAs(user));
    const res = await client.api.v1.me.preferences.$patch({ json: { reader } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ preferences: { showMature: true, reader } });

    const me = await client.api.v1.me.$get();
    expect(me.status).toBe(200);
    if (me.status !== 200) return;
    expect((await me.json()).user.preferences).toEqual({ showMature: true, reader });
  });
});
