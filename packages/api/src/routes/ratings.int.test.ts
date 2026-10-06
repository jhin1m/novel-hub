import {
  type CurrentUser,
  type RateLimiter,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { ratings, reports, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
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

/** Creates the next chapter of `publicId` and publishes it unless `draft`; returns its number. */
async function addChapter(author: CurrentUser, publicId: string, draft = false): Promise<number> {
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
  if (!draft) {
    const done = await publishChapter(db, author, publicId, created.value.number, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!done.ok) throw new Error(done.error);
  }
  return created.value.number;
}

async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Đánh Giá',
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

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

interface RatingsBody {
  summary: { count: number; average: number | null; distribution: Record<string, number> } | null;
  reviews: { id: string; score: number; review: string; isOwn: boolean }[];
  nextCursor: string | null;
}

describe('/api/v1/ratings', () => {
  it('rates, edits, lists for guests and deletes a rating', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');

    const created = await appAs(reader).request(
      '/api/v1/ratings',
      send('PUT', { publicId, score: 4, review: '  Truyện hay  ' }),
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      rating: { score: 4, review: 'Truyện hay', status: 'visible' },
    });
    const edited = await appAs(reader).request(
      '/api/v1/ratings',
      send('PUT', { publicId, score: 5, review: 'Rất hay' }),
    );
    expect(edited.status).toBe(200);

    const listed = await appAs(null).request(`/api/v1/ratings?story=${publicId}`);
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toContain('no-store');
    const body = (await listed.json()) as RatingsBody;
    expect(body.summary).toMatchObject({ count: 1, average: 5 });
    expect(body.reviews).toMatchObject([{ score: 5, review: 'Rất hay', isOwn: false }]);
    const own = (await (
      await appAs(reader).request(`/api/v1/ratings?story=${publicId}`)
    ).json()) as RatingsBody;
    expect(own.reviews[0]?.isOwn).toBe(true);

    const mine = await appAs(reader).request(`/api/v1/ratings/mine?story=${publicId}`);
    expect(await mine.json()).toMatchObject({ rating: { score: 5, status: 'visible' } });
    expect((await appAs(null).request(`/api/v1/ratings/mine?story=${publicId}`)).status).toBe(401);

    expect(
      (await appAs(reader).request(`/api/v1/ratings?story=${publicId}`, send('DELETE'))).status,
    ).toBe(204);
    expect(
      (await appAs(reader).request(`/api/v1/ratings?story=${publicId}`, send('DELETE'))).status,
    ).toBe(404);
    const after = await appAs(reader).request(`/api/v1/ratings/mine?story=${publicId}`);
    expect(await after.json()).toEqual({ rating: null });
  });

  it('refuses guests, unverified and muted accounts, the author and bad input', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const input = { publicId, score: 4 };

    expect((await appAs(null).request('/api/v1/ratings', send('PUT', input))).status).toBe(401);
    const unverified = await appAs(await makeUser('chua_xac_thuc', 'reader', false)).request(
      '/api/v1/ratings',
      send('PUT', input),
    );
    expect(unverified.status).toBe(403);
    expect(await errorCode(unverified)).toBe('EMAIL_NOT_VERIFIED');
    const muted = await makeUser('bi_cam');
    const mutedRes = await appAs({ ...muted, status: 'muted' }).request(
      '/api/v1/ratings',
      send('PUT', input),
    );
    expect(mutedRes.status).toBe(403);
    expect(await errorCode(mutedRes)).toBe('USER_MUTED');
    const own = await appAs(author).request('/api/v1/ratings', send('PUT', input));
    expect(own.status).toBe(403);
    expect(await errorCode(own)).toBe('FORBIDDEN');

    const reader = await makeUser('doc_gia');
    for (const bad of [
      { publicId, score: 6 },
      { publicId, score: 2.5 },
    ]) {
      expect((await appAs(reader).request('/api/v1/ratings', send('PUT', bad))).status).toBe(400);
    }
    expect((await appAs(null).request('/api/v1/ratings?story=short')).status).toBe(400);
  });

  it('answers 404 for a story without a published chapter', async () => {
    const author = await makeUser('tac_gia', 'author');
    const story = await createStory(db, author, {
      title: 'Nháp',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    if (!story.ok) throw new Error(story.error);
    const { publicId } = story.value;
    await addChapter(author, publicId, true);
    const reader = await makeUser('doc_gia');
    const res = await appAs(reader).request('/api/v1/ratings', send('PUT', { publicId, score: 4 }));
    expect(res.status).toBe(404);
    expect((await appAs(null).request(`/api/v1/ratings?story=${publicId}`)).status).toBe(404);
  });

  it('rate limits rating per user and IP', async () => {
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
    const reader = await makeUser('doc_gia');
    const res = await appAs(reader, limiter).request(
      '/api/v1/ratings',
      send('PUT', { publicId, score: 4 }),
    );
    expect(res.status).toBe(429);
    expect(check).toHaveBeenCalledWith('rate', expect.objectContaining({ ip: '203.0.113.9' }));
  });

  it('hides a reported review from the queue and keeps it hidden (409 on edit and delete)', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const writer = await makeUser('nguoi_viet');
    const mod = await makeUser('kiem_duyet', 'mod');
    await appAs(writer).request(
      '/api/v1/ratings',
      send('PUT', { publicId, score: 1, review: 'Quảng cáo' }),
    );
    const listed = (await (
      await appAs(reader).request(`/api/v1/ratings?story=${publicId}`)
    ).json()) as RatingsBody;
    const ratingId = listed.reviews[0]?.id ?? '';

    const reported = await appAs(reader).request(
      '/api/v1/reports',
      send('POST', { target: { type: 'rating', ratingId }, reason: 'spam' }),
    );
    expect(reported.status).toBe(201);
    const queue = await appAs(mod).request('/api/v1/moderation/reports?status=open');
    const { items } = (await queue.json()) as {
      items: { reportId: string; target: { type: string; rating: { excerpt: string } } }[];
    };
    expect(items[0]?.target).toMatchObject({ type: 'rating', rating: { excerpt: 'Quảng cáo' } });

    const acted = await appAs(mod).request(
      '/api/v1/moderation/actions',
      send('POST', { action: 'hide_rating', ratingId, reportId: items[0]?.reportId }),
    );
    expect(acted.status).toBe(200);
    const [report] = await db.select().from(reports);
    expect(report?.status).toBe('resolved');
    const [row] = await db.select().from(ratings).where(eq(ratings.id, ratingId));
    expect(row?.status).toBe('hidden_by_mod');
    const after = (await (
      await appAs(null).request(`/api/v1/ratings?story=${publicId}`)
    ).json()) as RatingsBody;
    expect(after).toMatchObject({ summary: { count: 0 }, reviews: [] });

    const edit = await appAs(writer).request(
      '/api/v1/ratings',
      send('PUT', { publicId, score: 5, review: 'Mới' }),
    );
    expect(edit.status).toBe(409);
    expect(await errorCode(edit)).toBe('RATING_HIDDEN');
    const del = await appAs(writer).request(`/api/v1/ratings?story=${publicId}`, send('DELETE'));
    expect(del.status).toBe(409);
    expect(await errorCode(del)).toBe('RATING_HIDDEN');
  });
});
