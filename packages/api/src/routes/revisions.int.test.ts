import type { CurrentUser } from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
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

const words = (n: number, seed = 'chữ') =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');

/** A story with chapter 1 holding `text` as its draft; returns the draft version. */
async function chapterWith(cookie: string, text: string) {
  const publicId = await createdStory(cookie);
  const created = await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
  const { chapter } = (await created.json()) as ChapterBody;
  const saved = await call(`/stories/${publicId}/chapters/1/draft`, {
    method: 'PUT',
    cookie,
    json: {
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { pid: 'k7m2xq9p' }, content: [{ type: 'text', text }] },
        ],
      },
      baseUpdatedAt: chapter.draftUpdatedAt,
    },
  });
  expect(saved.status).toBe(200);
  const { updatedAt } = (await saved.json()) as { updatedAt: string };
  return { publicId, base: updatedAt };
}

/** Saves `text` as the draft on top of `base` and publishes it; returns the new draft version. */
async function publishText(cookie: string, publicId: string, base: string, text: string) {
  const saved = await call(`/stories/${publicId}/chapters/1/draft`, {
    method: 'PUT',
    cookie,
    json: {
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { pid: 'k7m2xq9p' }, content: [{ type: 'text', text }] },
        ],
      },
      baseUpdatedAt: base,
    },
  });
  expect(saved.status).toBe(200);
  const { updatedAt } = (await saved.json()) as { updatedAt: string };
  const published = await call(`/stories/${publicId}/chapters/1/publish`, {
    method: 'POST',
    cookie,
    json: { baseUpdatedAt: updatedAt },
  });
  expect(published.status).toBe(200);
  return ((await published.json()) as { draft: { updatedAt: string } }).draft.updatedAt;
}

interface RevisionList {
  revisions: { key: string; createdAt: string; wordCount: number; isPublished: boolean }[];
}

describe('revision routes', () => {
  it('lists, previews and restores revisions without exposing internal ids', async () => {
    const cookie = await signedIn('author');
    const { publicId, base } = await chapterWith(cookie, words(10));
    const empty = await call(`/stories/${publicId}/chapters/1/revisions`, { cookie });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ revisions: [] });

    const first = await publishText(cookie, publicId, base, words(300, 'cũ'));
    const second = await publishText(cookie, publicId, first, words(300, 'mới'));

    const listed = await call(`/stories/${publicId}/chapters/1/revisions`, { cookie });
    expect(listed.status).toBe(200);
    const { revisions } = (await listed.json()) as RevisionList;
    expectNoInternalIds(revisions);
    expect(revisions.map((r) => r.isPublished)).toEqual([true, false]);
    const old = revisions[1];
    if (!old) throw new Error('missing revision');
    expect(old).toEqual({
      key: old.key,
      createdAt: new Date(Number(old.key)).toISOString(),
      wordCount: 300,
      isPublished: false,
    });

    const preview = await call(`/stories/${publicId}/chapters/1/revisions/${old.key}`, { cookie });
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as { revision: { html: string } };
    expectNoInternalIds(previewBody);
    expect(previewBody.revision.html).toMatch(/^<p data-pid="k7m2xq9p">cũ0 cũ1/);

    const restored = await call(`/stories/${publicId}/chapters/1/revisions/${old.key}/restore`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: second },
    });
    expect(restored.status).toBe(200);
    const restoredBody = (await restored.json()) as {
      draft: { doc: unknown; updatedAt: string };
    };
    expectNoInternalIds(restoredBody);
    expect(restoredBody.draft.updatedAt > second).toBe(true);
    expect(JSON.stringify(restoredBody.draft.doc)).toContain('cũ299');

    const draft = await call(`/stories/${publicId}/chapters/1/draft`, { cookie });
    expect(await draft.json()).toMatchObject({
      updatedAt: restoredBody.draft.updatedAt,
      hasUnpublishedChanges: true,
      chapter: { status: 'published' },
    });

    const stale = await call(`/stories/${publicId}/chapters/1/revisions/${old.key}/restore`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: second },
    });
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('DRAFT_CONFLICT');
  });

  it('validates keys and bodies, and guards access', async () => {
    const cookie = await signedIn('author');
    const other = await signedIn('other');
    const unverified = await signedIn('unverified', false);
    const { publicId, base } = await chapterWith(cookie, words(10));
    await publishText(cookie, publicId, base, words(300));
    const list = await call(`/stories/${publicId}/chapters/1/revisions`, { cookie });
    const key = ((await list.json()) as RevisionList).revisions[0]?.key ?? '';

    const badKey = await call(`/stories/${publicId}/chapters/1/revisions/abc`, { cookie });
    expect(badKey.status).toBe(400);
    expect(await errorCode(badKey)).toBe('VALIDATION_ERROR');
    const badBody = await call(`/stories/${publicId}/chapters/1/revisions/${key}/restore`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: 'yesterday' },
    });
    expect(badBody.status).toBe(400);
    expect(await errorCode(badBody)).toBe('VALIDATION_ERROR');

    const unknown = await call(`/stories/${publicId}/chapters/1/revisions/1/restore`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: new Date().toISOString() },
    });
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe('NOT_FOUND');

    const guest = await call(`/stories/${publicId}/chapters/1/revisions`);
    expect(guest.status).toBe(401);
    const notVerified = await call(`/stories/${publicId}/chapters/1/revisions`, {
      cookie: unverified,
    });
    expect(notVerified.status).toBe(403);
    expect(await errorCode(notVerified)).toBe('EMAIL_NOT_VERIFIED');
    for (const path of ['/revisions', `/revisions/${key}`]) {
      const res = await call(`/stories/${publicId}/chapters/1${path}`, { cookie: other });
      expect(res.status, path).toBe(403);
      expect(await errorCode(res)).toBe('FORBIDDEN');
    }
    const forbidden = await call(`/stories/${publicId}/chapters/1/revisions/${key}/restore`, {
      method: 'POST',
      cookie: other,
      json: { baseUpdatedAt: new Date().toISOString() },
    });
    expect(forbidden.status).toBe(403);
  });
});
