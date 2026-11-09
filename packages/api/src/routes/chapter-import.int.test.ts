import { type CurrentUser, type RateLimiter, createStory } from '@novel-hub/core';
import { chapters, users } from '@novel-hub/db';
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

const DAY = 86_400_000;

async function makeAuthor(username: string, ageDays = 8): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified: true,
      createdAt: new Date(Date.now() - ageDays * DAY),
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Nhập Chương',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  return story.value.publicId;
}

/** A limiter that lets everything through and records which actions were checked. */
function recordingLimiter(allowed = true) {
  const check = vi.fn<RateLimiter['check']>(() =>
    Promise.resolve({ allowed, retryAfterSec: allowed ? 0 : 60 }),
  );
  const limiter: RateLimiter = {
    check,
    recordFailure: () => Promise.resolve(),
    clearFailures: () => Promise.resolve(),
  };
  return { check, limiter };
}

function appAs(user: CurrentUser, rateLimit: RateLimiter | null = null) {
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
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const path = (publicId: string) => `/api/v1/stories/${publicId}/chapters/import`;

const words = (count: number, seed: string) =>
  Array.from({ length: count }, (_, i) => `${seed}${i}`).join(' ');

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('chapter import route', () => {
  it('imports drafts and answers with the numbers given', async () => {
    const author = await makeAuthor('tac_gia');
    const publicId = await makeStory(author);
    const res = await appAs(author).request(
      path(publicId),
      post({ mode: 'draft', chapters: [{ title: 'Một', text: 'Nội dung' }, { text: 'Hai' }] }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 2, firstNumber: 1, lastNumber: 2, published: 0 });
  });

  it('rejects more than 100 chapters and an oversized body before core runs', async () => {
    const author = await makeAuthor('tac_gia');
    const publicId = await makeStory(author);
    const app = appAs(author);
    const many = Array.from({ length: 101 }, () => ({ text: 'x' }));
    const tooMany = await app.request(path(publicId), post({ mode: 'draft', chapters: many }));
    expect(tooMany.status).toBe(400);

    const big = await app.request(
      path(publicId),
      post({ mode: 'draft', chapters: [{ text: 'a'.repeat(4 * 1024 * 1024 + 1) }] }),
    );
    expect(big.status).toBe(413);
    expect(await db.$count(chapters)).toBe(0);
  });

  it('answers ACCOUNT_TOO_NEW for an account under 7 days', async () => {
    const author = await makeAuthor('tac_gia', 3);
    const publicId = await makeStory(author);
    const res = await appAs(author).request(
      path(publicId),
      post({ mode: 'draft', chapters: [{ text: 'Một' }] }),
    );
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('ACCOUNT_TOO_NEW');
  });

  it('is rate limited as one import', async () => {
    const author = await makeAuthor('tac_gia');
    const publicId = await makeStory(author);
    const { check, limiter } = recordingLimiter(false);
    const res = await appAs(author, limiter).request(
      path(publicId),
      post({ mode: 'draft', chapters: [{ text: 'Một' }] }),
    );
    expect(res.status).toBe(429);
    expect(check).toHaveBeenCalledWith(
      'importChapters',
      expect.objectContaining({ ip: '203.0.113.9' }),
    );
  });

  it('publishes 30 chapters on one import budget, not the per-chapter ones', async () => {
    const author = await makeAuthor('tac_gia');
    const publicId = await makeStory(author);
    const { check, limiter } = recordingLimiter();
    const body = {
      mode: 'publish',
      chapters: Array.from({ length: 30 }, (_, i) => ({
        title: `Chương ${i + 1}`,
        text: words(310, `c${i}w`),
      })),
    };
    const res = await appAs(author, limiter).request(path(publicId), post(body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      created: 30,
      firstNumber: 1,
      lastNumber: 30,
      published: 30,
    });
    expect(check.mock.calls.map(([action]) => action)).toEqual(['importChapters']);
  }, 30_000);

  it('answers CHAPTER_IMPORT_INVALID when a chapter to publish is too short', async () => {
    const author = await makeAuthor('tac_gia');
    const publicId = await makeStory(author);
    const res = await appAs(author).request(
      path(publicId),
      post({ mode: 'publish', chapters: [{ text: words(100, 'w') }] }),
    );
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('CHAPTER_IMPORT_INVALID');
  });
});
