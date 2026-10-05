import type { CurrentUser } from '@novel-hub/core';
import { chapters, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Sessions are faked: the `session` cookie carries the user id. */
const sessions = new Map<string, CurrentUser>();

function buildApp() {
  return createApp(
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
}

const app = buildApp();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
  sessions.clear();
});

async function signedIn(username: string, emailVerified = true): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ username, displayName: username, email: `${username}@example.com`, emailVerified })
    .returning();
  if (!row) throw new Error('user insert failed');
  sessions.set(row.id, {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerified,
    avatarUrl: null,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  });
  return `session=${row.id}`;
}

interface CallOptions {
  method?: string;
  cookie?: string;
  json?: unknown;
}

function call(path: string, { method = 'GET', cookie, json }: CallOptions = {}) {
  const headers: Record<string, string> = { origin: TEST_APP_URL };
  if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers['content-type'] = 'application/json';
  return app.request(`${TEST_APP_URL}/api/v1${path}`, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

async function errorCode(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { error?: { code: string } }).error?.code;
}

/** Fails if any key or string value anywhere in the body could expose an internal id. */
function expectNoInternalIds(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    expect(value, path).not.toMatch(UUID);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => expectNoInternalIds(item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      expect(['id', 'authorId', 'mainTagId'], `${path}.${key}`).not.toContain(key);
      expectNoInternalIds(item, `${path}.${key}`);
    }
  }
}

async function createdStory(cookie: string): Promise<string> {
  const res = await call('/stories', {
    method: 'POST',
    cookie,
    json: { title: 'Kiếm Đạo Độc Tôn', mainTag: 'tien-hiep' },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { story: { publicId: string } }).story.publicId;
}

interface ChapterBody {
  chapter: { number: number; draftUpdatedAt: string };
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { pid: 'k7m2xq9p' }, content: [{ type: 'text', text }] }],
});

describe('chapter routes', () => {
  it('creates a chapter, reads and saves its draft without exposing internal ids', async () => {
    const cookie = await signedIn('author');
    const publicId = await createdStory(cookie);

    const created = await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
    expect(created.status).toBe(201);
    const { chapter } = (await created.json()) as ChapterBody;
    expect(chapter.number).toBe(1);
    expectNoInternalIds(chapter);

    const draftRes = await call(`/stories/${publicId}/chapters/1/draft`, { cookie });
    expect(draftRes.status).toBe(200);
    const draft = (await draftRes.json()) as { updatedAt: string; doc: unknown };
    expectNoInternalIds(draft);
    expect(draft.updatedAt).toBe(chapter.draftUpdatedAt);

    const saved = await call(`/stories/${publicId}/chapters/1/draft`, {
      method: 'PUT',
      cookie,
      json: { doc: doc('Một'), baseUpdatedAt: draft.updatedAt },
    });
    expect(saved.status).toBe(200);
    const { updatedAt } = (await saved.json()) as { updatedAt: string };

    const stale = await call(`/stories/${publicId}/chapters/1/draft`, {
      method: 'PUT',
      cookie,
      json: { doc: doc('Hai'), baseUpdatedAt: draft.updatedAt },
    });
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('DRAFT_CONFLICT');

    const invalid = await call(`/stories/${publicId}/chapters/1/draft`, {
      method: 'PUT',
      cookie,
      json: { doc: { type: 'doc', content: [{ type: 'image' }] }, baseUpdatedAt: updatedAt },
    });
    expect(invalid.status).toBe(422);
    expect(await errorCode(invalid)).toBe('INVALID_DOCUMENT');
  });

  it('rejects drafts over 2 MB with 413 DRAFT_TOO_LARGE', async () => {
    const cookie = await signedIn('author');
    const publicId = await createdStory(cookie);
    await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
    const res = await call(`/stories/${publicId}/chapters/1/draft`, {
      method: 'PUT',
      cookie,
      json: { doc: doc('x'.repeat(2_100_000)), baseUpdatedAt: new Date().toISOString() },
    });
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe('DRAFT_TOO_LARGE');
  });

  it('updates title and author note, and lists chapters for the author', async () => {
    const cookie = await signedIn('author');
    const publicId = await createdStory(cookie);
    await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
    await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });

    const patched = await call(`/stories/${publicId}/chapters/2`, {
      method: 'PATCH',
      cookie,
      json: { title: '  Gặp lại  ', authorNote: 'Cảm ơn đã đọc' },
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { chapter: object }).chapter).toMatchObject({
      number: 2,
      title: 'Gặp lại',
      authorNote: 'Cảm ơn đã đọc',
    });
    const tooLong = await call(`/stories/${publicId}/chapters/2`, {
      method: 'PATCH',
      cookie,
      json: { title: 'a'.repeat(151) },
    });
    expect(tooLong.status).toBe(400);

    await db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.number, 1));
    const list = await call(`/me/stories/${publicId}/chapters`, { cookie });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { chapters: { number: number }[] };
    expect(body.chapters.map((c) => c.number)).toEqual([2]);
    expectNoInternalIds(body);
  });

  it('answers 401, 403 and 404 with the standard error shape', async () => {
    const author = await signedIn('author');
    const other = await signedIn('other');
    const unverified = await signedIn('unverified', false);
    const publicId = await createdStory(author);
    await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie: author });

    const guest = await call(`/stories/${publicId}/chapters/1/draft`);
    expect(guest.status).toBe(401);
    expect(await errorCode(guest)).toBe('UNAUTHENTICATED');

    const notVerified = await call(`/stories/${publicId}/chapters`, {
      method: 'POST',
      cookie: unverified,
    });
    expect(notVerified.status).toBe(403);
    expect(await errorCode(notVerified)).toBe('EMAIL_NOT_VERIFIED');

    const forbidden = await call(`/stories/${publicId}/chapters/1/draft`, { cookie: other });
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe('FORBIDDEN');
    const forbiddenList = await call(`/me/stories/${publicId}/chapters`, { cookie: other });
    expect(forbiddenList.status).toBe(403);

    const missing = await call(`/stories/${publicId}/chapters/9/draft`, { cookie: author });
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('NOT_FOUND');
    const badNumber = await call(`/stories/${publicId}/chapters/abc/draft`, { cookie: author });
    expect(badNumber.status).toBe(400);
  });

  it('refuses to delete a chapter a moderator hid with 409 CHAPTER_HIDDEN_BY_MOD', async () => {
    const cookie = await signedIn('author');
    const publicId = await createdStory(cookie);
    await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
    await db.update(chapters).set({ status: 'hidden_by_mod' });

    const res = await call(`/stories/${publicId}/chapters/1`, { method: 'DELETE', cookie });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CHAPTER_HIDDEN_BY_MOD');
    const [row] = await db.select().from(chapters);
    expect(row?.deletedAt).toBeNull();
  });
});
