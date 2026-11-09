import { type CurrentUser, createStory } from '@novel-hub/core';
import { stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function makeUser(username: string): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified: true,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/**
 * A story of `author` that looks published with chapters (past the home listing threshold),
 * updated `hoursAgo` hours ago, unless `values` says otherwise. Returns its public id.
 */
async function makeStory(
  author: CurrentUser,
  title: string,
  hoursAgo: number,
  values: Partial<typeof stories.$inferInsert> = {},
): Promise<string> {
  const created = await createStory(db, author, {
    title,
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!created.ok) throw new Error(created.error);
  const { publicId } = created.value;
  await db
    .update(stories)
    .set({
      visibility: 'published',
      chapterCount: 3,
      wordCount: 5_000,
      lastChapterAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      ...values,
    })
    .where(eq(stories.publicId, publicId));
  return publicId;
}

/** The app, with a session lookup that would renew the cookie if it ran. */
function makeApp() {
  const lookupSession = vi.fn(() =>
    Promise.resolve({ user: null, setCookies: ['session=renewed; Path=/; HttpOnly'] }),
  );
  const app = createApp(
    makeTestApiDeps({
      db,
      auth: { handler: () => Promise.resolve(new Response(null, { status: 404 })), lookupSession },
    }),
  );
  return { app, lookupSession };
}

interface RelatedBody {
  sameAuthor: { title: string; isMature: boolean }[];
  sameMainTag: { title: string; isMature: boolean }[];
}

const path = (publicId: string) => `/api/v1/stories/${publicId}/related`;

describe('GET /stories/:publicId/related', () => {
  it('lists suggestions for everyone, uncached, without the session or 18+ stories', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('tac_gia_khac');
    const origin = await makeStory(author, 'Gốc', 0);
    await makeStory(author, 'Cùng Tác Giả', 1);
    await makeStory(author, 'Mười Tám', 1, { isMature: true });
    await makeStory(other, 'Cùng Tag', 2);
    await makeStory(other, 'Bị Ẩn', 2, { visibility: 'hidden_by_mod' });
    await makeStory(other, 'Mười Tám Khác', 2, { isMature: true });
    const { app, lookupSession } = makeApp();

    const res = await app.request(path(origin), { headers: { cookie: 'session=old' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(lookupSession).not.toHaveBeenCalled();
    const body = (await res.json()) as RelatedBody;
    expect(body.sameAuthor.map((s) => s.title)).toEqual(['Cùng Tác Giả']);
    expect(body.sameMainTag.map((s) => s.title)).toEqual(['Cùng Tag']);
    expect([...body.sameAuthor, ...body.sameMainTag].some((s) => s.isMature)).toBe(false);
  });

  it('is 404 for a story that cannot be seen', async () => {
    const author = await makeUser('tac_gia');
    const hidden = await makeStory(author, 'Bị Ẩn', 0, { visibility: 'hidden_by_mod' });
    const { app } = makeApp();

    for (const publicId of [hidden, 'zzzzzzzz']) {
      const res = await app.request(path(publicId));
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects a malformed public id', async () => {
    const { app } = makeApp();
    const res = await app.request(path('NOT-AN-ID'));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
