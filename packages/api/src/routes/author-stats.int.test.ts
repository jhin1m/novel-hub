import {
  type CurrentUser,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { chapterDailyStats, chapters, follows, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { statsDate } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

/** A story with one published chapter; returns its public id and internal id. */
async function makeStory(author: CurrentUser): Promise<{ publicId: string; storyId: string }> {
  const story = await createStory(db, author, {
    title: 'Truyện Số Liệu',
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
  const [row] = await db.select().from(stories).where(eq(stories.publicId, publicId));
  if (!row) throw new Error('story missing');
  return { publicId, storyId: row.id };
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

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('/api/v1/author-stats', () => {
  it('gives the author the stats of their story, never cached', async () => {
    const author = await makeUser('tac_gia');
    const reader = await makeUser('doc_gia');
    const { publicId, storyId } = await makeStory(author);
    const [chapter] = await db.select().from(chapters).where(eq(chapters.storyId, storyId));
    if (!chapter) throw new Error('chapter missing');
    await db
      .insert(chapterDailyStats)
      .values({ chapterId: chapter.id, date: statsDate(new Date()), views: 12 });
    await db.insert(follows).values({ userId: reader.id, targetType: 'story', targetId: storyId });

    const res = await appAs(author).request(`/api/v1/author-stats/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toMatchObject({
      story: { publicId, title: 'Truyện Số Liệu' },
      totals: { views: 12, newStoryFollows: 1, storyFollowersTotal: 1 },
      chapters: [{ number: 1, views30d: 12, reached: 0, dropOffPct: null }],
    });
  });

  it('is 401 for guests and 404 for anyone but the author', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('nguoi_khac');
    const { publicId } = await makeStory(author);

    const guest = await appAs(null).request(`/api/v1/author-stats/${publicId}`);
    expect(guest.status).toBe(401);
    const notOwner = await appAs(other).request(`/api/v1/author-stats/${publicId}`);
    expect(notOwner.status).toBe(404);
    expect(await errorCode(notOwner)).toBe('NOT_FOUND');
    const unknown = await appAs(author).request('/api/v1/author-stats/zzzzzzzz');
    expect(unknown.status).toBe(404);
    const malformed = await appAs(author).request('/api/v1/author-stats/not-an-id');
    expect(malformed.status).toBe(400);
  });
});
