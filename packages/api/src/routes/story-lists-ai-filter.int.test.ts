import {
  type CurrentUser,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

/** Sessions are faked: the `session` cookie carries the user id. */
const sessions = new Map<string, CurrentUser>();

const app = createApp(
  makeTestApiDeps({
    db,
    auth: {
      handler: () => Promise.resolve(new Response(null, { status: 404 })),
      lookupSession: (headers) => {
        const id = /session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1];
        return Promise.resolve({ user: (id && sessions.get(id)) || null, setCookies: [] });
      },
    },
  }),
);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
  sessions.clear();
});

async function makeUser(username: string, showMature = false) {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      emailVerified: true,
      preferences: { showMature },
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  sessions.set(row.id, {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    emailVerified: true,
    avatarUrl: null,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  });
  return row;
}

/** A published `tien-hiep` story with one chapter. */
async function publishedStory(
  author: Awaited<ReturnType<typeof makeUser>>,
  title: string,
  flags: { isMature: boolean; isAiAssisted: boolean },
) {
  const actor = { id: author.id, role: author.role, status: author.status, emailVerified: true };
  const created = await createStory(db, actor, {
    title,
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    ...flags,
  });
  if (!created.ok) throw new Error(created.error);
  const { publicId } = created.value;
  const chapter = await createChapter(db, actor, publicId);
  if (!chapter.ok) throw new Error(chapter.error);
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, actor, publicId, 1, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: chapter.value.draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  const published = await publishChapter(db, actor, publicId, 1, {
    baseUpdatedAt: saved.value.updatedAt,
  });
  if (!published.ok) throw new Error(published.error);
}

const titles = async (res: Response) =>
  ((await res.json()) as { stories: { title: string }[] }).stories.map((s) => s.title).sort();

describe('GET /api/v1/stories?list=tag with noAi', () => {
  beforeEach(async () => {
    const author = await makeUser('tac_gia');
    await publishedStory(author, 'Truyện Thường', { isMature: false, isAiAssisted: false });
    await publishedStory(author, 'Truyện Mười Tám', { isMature: true, isAiAssisted: false });
    await publishedStory(author, 'Truyện Có AI', { isMature: false, isAiAssisted: true });
  });

  it('leaves out AI stories but keeps 18+ ones for an account that turned 18+ on', async () => {
    const on = await makeUser('nguoi_lon', true);
    const as = { headers: { cookie: `session=${on.id}` } };
    const res = await app.request('/api/v1/stories?list=tag&tag=tien-hiep&noAi=1', as);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await titles(res)).toEqual(['Truyện Mười Tám', 'Truyện Thường']);

    const unfiltered = await app.request('/api/v1/stories?list=tag&tag=tien-hiep', as);
    expect(await titles(unfiltered)).toEqual(['Truyện Có AI', 'Truyện Mười Tám', 'Truyện Thường']);
  });

  it('treats noAi=0 as the filter off', async () => {
    const res = await app.request('/api/v1/stories?list=tag&tag=tien-hiep&noAi=0');
    expect(res.status).toBe(200);
    expect(await titles(res)).toContain('Truyện Có AI');
  });

  it('answers 400 for any other spelling of the filter', async () => {
    for (const value of ['true', 'yes', '2']) {
      const res = await app.request(`/api/v1/stories?list=tag&tag=tien-hiep&noAi=${value}`);
      expect(res.status, value).toBe(400);
    }
  });
});
