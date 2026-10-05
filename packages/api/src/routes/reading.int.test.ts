import type { CurrentUser, ViewCounter } from '@novel-hub/core';
import { createChapter, createStory, publishChapter, saveDraft } from '@novel-hub/core';
import { readingProgress, users } from '@novel-hub/db';
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

async function insertUser(username: string): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({ username, displayName: 'U', email: `${username}@example.com`, emailVerified: true })
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

/** A story with one published chapter; returns its public id. */
async function publishedStory(): Promise<string> {
  const author = await insertUser('author');
  const actor = { id: author.id, role: author.role, status: author.status, emailVerified: true };
  const story = await createStory(db, actor, {
    title: 'Truyện Đọc',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const { publicId } = story.value;
  const created = await createChapter(db, actor, publicId);
  if (!created.ok) throw new Error(created.error);
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, actor, publicId, 1, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: created.value.draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  const done = await publishChapter(db, actor, publicId, 1, {
    baseUpdatedAt: saved.value.updatedAt,
  });
  if (!done.ok) throw new Error(done.error);
  return publicId;
}

function appAs(user: CurrentUser | null, viewCounter: ViewCounter | null = null) {
  return createApp(
    makeTestApiDeps({
      db,
      viewCounter,
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
    }),
  );
}

const json = (method: string, body: unknown, contentType = 'application/json') => ({
  method,
  body: JSON.stringify(body),
  headers: { origin: TEST_APP_URL, 'content-type': contentType },
});

describe('progress', () => {
  it('PUT (hc) and POST (beacon, text/plain) both save; nothing is returned', async () => {
    const publicId = await publishedStory();
    const reader = await insertUser('reader');
    const app = appAs(reader);

    const put = await app.request(
      '/api/v1/reading/progress',
      json('PUT', { publicId, number: 1, scrollPct: 30 }),
    );
    expect(put.status).toBe(204);
    expect(put.headers.get('cache-control')).toBe('no-store');
    const beacon = await app.request(
      '/api/v1/reading/progress',
      json('POST', { publicId, number: 1, scrollPct: 87.5 }, 'text/plain;charset=UTF-8'),
    );
    expect(beacon.status).toBe(204);
    const rows = await db.select().from(readingProgress);
    expect(rows.map((r) => r.scrollPct)).toEqual([87.5]);
  });

  it('a chapter that cannot be read → 404', async () => {
    const publicId = await publishedStory();
    const reader = await insertUser('reader');
    const res = await appAs(reader).request(
      '/api/v1/reading/progress',
      json('PUT', { publicId, number: 2, scrollPct: 30 }),
    );
    expect(res.status).toBe(404);
  });
});

describe('view', () => {
  it('a guest gets an anonymous viewer cookie scoped to the reading API, once', async () => {
    const publicId = await publishedStory();
    const record = vi.fn<ViewCounter['record']>(() => Promise.resolve(true));
    const app = appAs(null, { record });

    const first = await app.request('/api/v1/reading/view', json('POST', { publicId, number: 1 }));
    expect(first.status).toBe(204);
    const cookie = first.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^nh_vid=[A-Za-z0-9_-]{22};/);
    expect(cookie).toContain('Path=/api/v1/reading');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    const id = /^nh_vid=([^;]+)/.exec(cookie)?.[1];
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ viewer: `a:${id}`, ip: null }));

    const again = await app.request('/api/v1/reading/view', {
      ...json('POST', { publicId, number: 1 }),
      headers: { origin: TEST_APP_URL, 'content-type': 'application/json', cookie: `nh_vid=${id}` },
    });
    expect(again.status).toBe(204);
    expect(again.headers.get('set-cookie')).toBeNull();
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ viewer: `a:${id}` }));
  });

  it('a signed-in reader is counted by account, with no cookie', async () => {
    const publicId = await publishedStory();
    const reader = await insertUser('reader');
    const record = vi.fn<ViewCounter['record']>(() => Promise.resolve(true));
    const res = await appAs(reader, { record }).request(
      '/api/v1/reading/view',
      json('POST', { publicId, number: 1 }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ viewer: `u:${reader.id}` }));
  });

  it('an unreadable chapter → 404 and nothing counted; a dead counter still answers 204', async () => {
    const publicId = await publishedStory();
    const record = vi.fn<ViewCounter['record']>(() => Promise.reject(new Error('redis down')));
    const app = appAs(null, { record });
    const missing = await app.request(
      '/api/v1/reading/view',
      json('POST', { publicId, number: 2 }),
    );
    expect(missing.status).toBe(404);
    expect(record).not.toHaveBeenCalled();

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/v1/reading/view', json('POST', { publicId, number: 1 }));
    expect(res.status).toBe(204);
    error.mockRestore();
  });
});
