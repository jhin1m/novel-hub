import {
  type CurrentUser,
  type RateLimiter,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const DAY_MS = 86_400_000;

async function makeUser(
  username: string,
  { ageDays = 30, emailVerified = true }: { ageDays?: number; emailVerified?: boolean } = {},
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified,
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** A published story with one chapter; returns its public id. */
async function makeStory(author: CurrentUser, title: string): Promise<string> {
  const story = await createStory(db, author, {
    title,
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const { publicId } = story.value;
  const created = await createChapter(db, author, publicId);
  if (!created.ok) throw new Error(created.error);
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, author, publicId, created.value.number, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: created.value.draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  const done = await publishChapter(db, author, publicId, created.value.number, {
    baseUpdatedAt: saved.value.updatedAt,
  });
  if (!done.ok) throw new Error(done.error);
  return publicId;
}

function appAs(user: CurrentUser | null, rateLimit: RateLimiter | null = null) {
  return createApp(
    makeTestApiDeps({
      db,
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
      rateLimit,
      clientIp: () => '203.0.113.9',
    }),
  );
}

const post = (body: unknown) => ({
  method: 'POST',
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('/api/v1/nominations', () => {
  it('nominates a story and reports the status of the signed-in reader', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author, 'Truyện Đề Cử');
    const reader = await makeUser('doc_gia');

    const guest = await appAs(null).request(`/api/v1/nominations/status?story=${publicId}`);
    expect(guest.status).toBe(401);

    const before = await appAs(reader).request(`/api/v1/nominations/status?story=${publicId}`);
    expect(before.status).toBe(200);
    expect(before.headers.get('cache-control')).toContain('no-store');
    expect(await before.json()).toEqual({ remaining: 3, nominated: false, eligibility: 'ok' });

    const created = await appAs(reader).request('/api/v1/nominations', post({ publicId }));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ remaining: 2 });

    const again = await appAs(reader).request('/api/v1/nominations', post({ publicId }));
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe('ALREADY_NOMINATED');

    const after = await appAs(reader).request(`/api/v1/nominations/status?story=${publicId}`);
    expect(await after.json()).toEqual({ remaining: 2, nominated: true, eligibility: 'ok' });

    const own = await appAs(author).request('/api/v1/nominations', post({ publicId }));
    expect(own.status).toBe(403);
    expect(await errorCode(own)).toBe('FORBIDDEN');
  });

  it('refuses unverified and new accounts, unknown stories and bad input', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author, 'Truyện Đề Cử');

    const unverified = await makeUser('chua_xac_thuc', { emailVerified: false });
    const res1 = await appAs(unverified).request('/api/v1/nominations', post({ publicId }));
    expect(res1.status).toBe(403);
    expect(await errorCode(res1)).toBe('EMAIL_NOT_VERIFIED');

    const young = await makeUser('moi_tao', { ageDays: 6 });
    const res2 = await appAs(young).request('/api/v1/nominations', post({ publicId }));
    expect(res2.status).toBe(403);
    expect(await errorCode(res2)).toBe('ACCOUNT_TOO_NEW');
    const status = await appAs(young).request(`/api/v1/nominations/status?story=${publicId}`);
    expect(await status.json()).toMatchObject({ eligibility: 'too_new' });

    const reader = await makeUser('doc_gia');
    const missing = await appAs(reader).request(
      '/api/v1/nominations',
      post({ publicId: 'zzzzzzzz' }),
    );
    expect(missing.status).toBe(404);
    const invalid = await appAs(reader).request('/api/v1/nominations', post({ publicId: 'x' }));
    expect(invalid.status).toBe(400);
    const extra = await appAs(reader).request(
      '/api/v1/nominations',
      post({ publicId, story: publicId }),
    );
    expect(extra.status).toBe(400);
  });

  it('answers 409 NOMINATION_WEEKLY_LIMIT after three nominations', async () => {
    const author = await makeUser('tac_gia');
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await makeStory(author, `Truyện Số ${i}`));
    const reader = await makeUser('doc_gia');
    for (const publicId of ids.slice(0, 3)) {
      const res = await appAs(reader).request('/api/v1/nominations', post({ publicId }));
      expect(res.status).toBe(201);
    }
    const fourth = await appAs(reader).request('/api/v1/nominations', post({ publicId: ids[3] }));
    expect(fourth.status).toBe(409);
    expect(await errorCode(fourth)).toBe('NOMINATION_WEEKLY_LIMIT');
  });

  it('rate limits nominating per user and IP', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author, 'Truyện Đề Cử');
    const check = vi.fn<RateLimiter['check']>(() =>
      Promise.resolve({ allowed: false, retryAfterSec: 60 }),
    );
    const limiter: RateLimiter = {
      check,
      recordFailure: () => Promise.resolve(),
      clearFailures: () => Promise.resolve(),
    };
    const reader = await makeUser('doc_gia');
    const res = await appAs(reader, limiter).request('/api/v1/nominations', post({ publicId }));
    expect(res.status).toBe(429);
    expect(check).toHaveBeenCalledWith('nominate', expect.objectContaining({ ip: '203.0.113.9' }));
  });
});
