import {
  type CurrentUser,
  type RateLimiter,
  createChapter,
  createStory,
  notifyFollowersOfChapter,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { chapters, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { desc } from 'drizzle-orm';
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

async function makeUser(username: string, emailVerified = true): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** Publishes the next chapter of `publicId` and returns its internal id. */
async function addChapter(author: CurrentUser, publicId: string): Promise<string> {
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
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .orderBy(desc(chapters.createdAt))
    .limit(1);
  if (!row) throw new Error('chapter missing');
  return row.id;
}

async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Theo Dõi',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  await addChapter(author, story.value.publicId);
  return story.value.publicId;
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

const send = (method: string, body?: unknown) => ({
  method,
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('follow routes', () => {
  it('requires a session', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const app = appAs(null);
    expect((await app.request(`/api/v1/follows/stories/${publicId}`, send('PUT'))).status).toBe(
      401,
    );
    expect((await app.request('/api/v1/follows/authors/tac_gia', send('DELETE'))).status).toBe(401);
    expect((await app.request(`/api/v1/follows/status?story=${publicId}`)).status).toBe(401);
  });

  it('follows and unfollows a story and an author, reporting the status', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    // Following needs no verified email.
    const app = appAs(await makeUser('doc_gia', false));
    const status = async () =>
      (await app.request(`/api/v1/follows/status?story=${publicId}&author=tac_gia`)).json();

    expect(await status()).toEqual({ story: false, author: false });
    expect((await app.request(`/api/v1/follows/stories/${publicId}`, send('PUT'))).status).toBe(
      204,
    );
    expect((await app.request(`/api/v1/follows/stories/${publicId}`, send('PUT'))).status).toBe(
      204,
    );
    expect((await app.request('/api/v1/follows/authors/tac_gia', send('PUT'))).status).toBe(204);
    expect(await status()).toEqual({ story: true, author: true });

    expect((await app.request(`/api/v1/follows/stories/${publicId}`, send('DELETE'))).status).toBe(
      204,
    );
    expect((await app.request('/api/v1/follows/authors/tac_gia', send('DELETE'))).status).toBe(204);
    expect((await app.request('/api/v1/follows/authors/tac_gia', send('DELETE'))).status).toBe(204);
    expect(await status()).toEqual({ story: false, author: false });
  });

  it('refuses following oneself and answers 404 for missing targets', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const own = appAs(author);
    const ownStory = await own.request(`/api/v1/follows/stories/${publicId}`, send('PUT'));
    expect(ownStory.status).toBe(403);
    expect(await errorCode(ownStory)).toBe('FORBIDDEN');
    const self = await own.request('/api/v1/follows/authors/tac_gia', send('PUT'));
    expect(self.status).toBe(403);

    const reader = appAs(await makeUser('doc_gia'));
    const missing = await reader.request('/api/v1/follows/stories/zzzzzzzz', send('PUT'));
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('NOT_FOUND');
    expect((await reader.request('/api/v1/follows/authors/khong_co', send('PUT'))).status).toBe(
      404,
    );
    expect((await reader.request('/api/v1/follows/stories/not-an-id', send('PUT'))).status).toBe(
      400,
    );
  });

  it('rate limits following per user and IP', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const check = vi.fn<RateLimiter['check']>(() =>
      Promise.resolve({ allowed: false, retryAfterSec: 30 }),
    );
    const limiter: RateLimiter = {
      check,
      recordFailure: () => Promise.resolve(),
      clearFailures: () => Promise.resolve(),
    };
    const res = await appAs(await makeUser('doc_gia'), limiter).request(
      `/api/v1/follows/stories/${publicId}`,
      send('PUT'),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(check).toHaveBeenCalledWith('follow', expect.objectContaining({ ip: '203.0.113.9' }));
  });
});

describe('notification routes', () => {
  it('requires a session', async () => {
    const app = appAs(null);
    expect((await app.request('/api/v1/notifications')).status).toBe(401);
    expect((await app.request('/api/v1/notifications/unread-count')).status).toBe(401);
    expect(
      (await app.request('/api/v1/notifications/read', send('POST', { all: true }))).status,
    ).toBe(401);
  });

  it('lists, counts and marks read the reader’s notifications', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const app = appAs(reader);
    await app.request(`/api/v1/follows/stories/${publicId}`, send('PUT'));
    await notifyFollowersOfChapter(db, await addChapter(author, publicId));
    await notifyFollowersOfChapter(db, await addChapter(author, publicId));

    const count = await app.request('/api/v1/notifications/unread-count');
    expect(count.headers.get('cache-control')).toContain('no-store');
    expect(await count.json()).toEqual({ count: 1 });
    const list = (await (await app.request('/api/v1/notifications')).json()) as {
      items: {
        id: string;
        count: number;
        chapter: { number: number };
        story: { publicId: string };
      }[];
      nextCursor: string | null;
    };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ count: 2, chapter: { number: 3 }, story: { publicId } });
    expect(list.nextCursor).toBeNull();
    expect(JSON.stringify(list)).not.toContain(reader.id);

    // Another reader's request changes nothing of this reader's.
    const other = appAs(await makeUser('nguoi_khac'));
    const foreign = await other.request(
      '/api/v1/notifications/read',
      send('POST', { ids: [list.items[0]?.id] }),
    );
    expect(await foreign.json()).toEqual({ updated: 0 });

    const read = await app.request('/api/v1/notifications/read', send('POST', { all: true }));
    expect(await read.json()).toEqual({ updated: 1 });
    expect(await (await app.request('/api/v1/notifications/unread-count')).json()).toEqual({
      count: 0,
    });
  });

  it('validates the mark-read body and the cursor', async () => {
    const app = appAs(await makeUser('doc_gia'));
    for (const body of [{}, { all: false }, { ids: ['x'] }, { ids: [] }]) {
      expect((await app.request('/api/v1/notifications/read', send('POST', body))).status).toBe(
        400,
      );
    }
    expect((await app.request('/api/v1/notifications?cursor=bad')).status).toBe(400);
  });
});
