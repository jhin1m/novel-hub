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

async function makeUser(
  username: string,
  role: CurrentUser['role'] = 'reader',
  emailVerified = true,
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified,
      role,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** A public story of `author` with one published chapter; returns its public id. */
async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Thông Báo',
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

const send = (method: string, body?: unknown) => ({
  method,
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

interface AnnouncementBody {
  id: string;
  body: string;
  createdAt: string;
}

const path = (publicId: string) => `/api/v1/stories/${publicId}/announcements`;

describe('story announcement routes', () => {
  it('lets the author post, list and delete announcements', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const app = appAs(author);

    const posted = await app.request(path(publicId), send('POST', { body: '  Tạm nghỉ  ' }));
    expect(posted.status).toBe(201);
    const { announcement } = (await posted.json()) as { announcement: AnnouncementBody };
    expect(announcement.body).toBe('Tạm nghỉ');

    const listed = await app.request(path(publicId));
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { announcements: AnnouncementBody[] }).announcements).toEqual([
      announcement,
    ]);

    const deleted = await app.request(`${path(publicId)}/${announcement.id}`, send('DELETE'));
    expect(deleted.status).toBe(204);
    const again = await app.request(`${path(publicId)}/${announcement.id}`, send('DELETE'));
    expect(again.status).toBe(404);
  });

  it('refuses guests, unverified emails, other users and a fourth post the same day', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const unverified = await makeUser('chua_xac_thuc', 'author', false);

    expect((await appAs(null).request(path(publicId), send('POST', { body: 'x' }))).status).toBe(
      401,
    );
    expect((await appAs(null).request(path(publicId))).status).toBe(401);
    const notVerified = await appAs(unverified).request(
      path(publicId),
      send('POST', { body: 'x' }),
    );
    expect(notVerified.status).toBe(403);

    const other = await appAs(reader).request(path(publicId), send('POST', { body: 'x' }));
    expect(other.status).toBe(403);
    expect(await errorCode(other)).toBe('FORBIDDEN');
    expect((await appAs(reader).request(path(publicId))).status).toBe(403);

    for (const body of ['Một', 'Hai', 'Ba']) {
      expect((await appAs(author).request(path(publicId), send('POST', { body }))).status).toBe(
        201,
      );
    }
    const fourth = await appAs(author).request(path(publicId), send('POST', { body: 'Bốn' }));
    expect(fourth.status).toBe(429);
    expect(await errorCode(fourth)).toBe('ANNOUNCEMENT_DAILY_LIMIT');
  });

  it('validates the body and the ids', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const app = appAs(author);
    for (const body of [{ body: 'x'.repeat(1001) }, { body: '   ' }, {}, { body: 'x', extra: 1 }]) {
      const res = await app.request(path(publicId), send('POST', body));
      expect(res.status).toBe(400);
    }
    expect((await app.request(`${path(publicId)}/not-a-uuid`, send('DELETE'))).status).toBe(400);
    expect((await app.request(path('bad'), send('POST', { body: 'Hợp lệ' }))).status).toBe(400);
  });

  it('refuses a body over the size limit before reading it', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const res = await appAs(author).request(
      path(publicId),
      send('POST', { body: 'x'.repeat(9 * 1024) }),
    );
    expect(res.status).toBe(413);
  });

  it('rate limits posting per user and IP', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const check = vi.fn<RateLimiter['check']>(() =>
      Promise.resolve({ allowed: false, retryAfterSec: 60 }),
    );
    const limiter: RateLimiter = {
      check,
      recordFailure: () => Promise.resolve(),
      clearFailures: () => Promise.resolve(),
    };
    const res = await appAs(author, limiter).request(path(publicId), send('POST', { body: 'x' }));
    expect(res.status).toBe(429);
    expect(check).toHaveBeenCalledWith('announce', expect.objectContaining({ ip: '203.0.113.9' }));
  });
});
