import {
  type CurrentUser,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

/** A published story with one chapter; `isMature` set straight in the database. */
async function publishedStory(
  author: Awaited<ReturnType<typeof makeUser>>,
  title: string,
  isMature: boolean,
) {
  const actor = { id: author.id, role: author.role, status: author.status, emailVerified: true };
  const created = await createStory(db, actor, {
    title,
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature,
    isAiAssisted: false,
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
  return publicId;
}

const titles = async (res: Response) =>
  ((await res.json()) as { stories: { title: string }[] }).stories.map((s) => s.title).sort();

describe('GET /api/v1/stories', () => {
  beforeEach(async () => {
    const author = await makeUser('tac_gia');
    await publishedStory(author, 'Truyện Thường', false);
    await publishedStory(author, 'Truyện Mười Tám', true);
  });

  it('never lists 18+ stories for a guest, whatever the query says', async () => {
    const res = await app.request('/api/v1/stories?list=recent&includeMature=true');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await titles(res)).toEqual(['Truyện Thường']);
  });

  it('lists 18+ stories only for an account that turned them on', async () => {
    const off = await makeUser('ban_doc');
    const on = await makeUser('nguoi_lon', true);
    const as = (id: string) => ({ headers: { cookie: `session=${id}` } });
    expect(await titles(await app.request('/api/v1/stories?list=recent', as(off.id)))).toEqual([
      'Truyện Thường',
    ]);
    for (const query of [
      'list=recent',
      'list=notable',
      'list=tag&tag=tien-hiep',
      'list=author&author=tac_gia',
    ]) {
      const res = await app.request(`/api/v1/stories?${query}`, as(on.id));
      expect(res.status, query).toBe(200);
      expect(await titles(res), query).toEqual(['Truyện Mười Tám', 'Truyện Thường']);
    }
  });

  it('returns pages and no internal ids', async () => {
    const res = await app.request('/api/v1/stories?list=tag&tag=tien-hiep&page=1');
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ page: 1, totalPages: 1 });
    const [row] = await db
      .select({ id: stories.id })
      .from(stories)
      .where(eq(stories.title, 'Truyện Thường'));
    expect(text).not.toContain(row?.id ?? 'missing');
    expect(text).not.toMatch(UUID);
  });

  it('answers 404 for an unknown tag or author and 400 for a malformed query', async () => {
    expect((await app.request('/api/v1/stories?list=tag&tag=khong-co')).status).toBe(404);
    expect((await app.request('/api/v1/stories?list=author&author=nobody')).status).toBe(404);
    for (const query of ['', 'list=popular', 'list=recent&page=0', 'list=tag&tag=Tien']) {
      expect((await app.request(`/api/v1/stories?${query}`)).status, query).toBe(400);
    }
  });
});
