import type { CurrentUser } from '@novel-hub/core';
import { chapters, users } from '@novel-hub/db';
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

const words = (n: number, seed = 'chữ') =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');

/** A story with chapter 1 holding `text` as its draft; returns the draft version. */
async function chapterWith(cookie: string, text: string, pid: string | null = 'k7m2xq9p') {
  const publicId = await createdStory(cookie);
  const created = await call(`/stories/${publicId}/chapters`, { method: 'POST', cookie });
  const { chapter } = (await created.json()) as ChapterBody;
  const saved = await call(`/stories/${publicId}/chapters/1/draft`, {
    method: 'PUT',
    cookie,
    json: {
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { pid }, content: [{ type: 'text', text }] }],
      },
      baseUpdatedAt: chapter.draftUpdatedAt,
    },
  });
  expect(saved.status).toBe(200);
  const { updatedAt } = (await saved.json()) as { updatedAt: string };
  return { publicId, base: updatedAt };
}

interface PublishBody {
  chapter: { status: string; number: number };
  draft: { updatedAt: string; doc: unknown };
  unchanged: boolean;
  storyVisibility: string;
}

describe('publishing routes', () => {
  it('publishes, returns the normalized draft when pids changed, and hides internal ids', async () => {
    const cookie = await signedIn('author');
    const { publicId, base } = await chapterWith(cookie, words(300), null);
    const res = await call(`/stories/${publicId}/chapters/1/publish`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: base },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PublishBody;
    expectNoInternalIds(body);
    expect(body).toMatchObject({
      chapter: { status: 'published', number: 1 },
      unchanged: false,
      storyVisibility: 'published',
    });
    expect(body.draft.updatedAt > base).toBe(true);
    expect(JSON.stringify(body.draft.doc)).toMatch(/"pid":"[a-z2-9]{8}"/);

    const again = await call(`/stories/${publicId}/chapters/1/publish`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: body.draft.updatedAt },
    });
    expect(((await again.json()) as PublishBody).unchanged).toBe(true);

    const stale = await call(`/stories/${publicId}/chapters/1/publish`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: base },
    });
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('DRAFT_CONFLICT');

    const reschedule = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'PUT',
      cookie,
      json: {
        baseUpdatedAt: body.draft.updatedAt,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    expect(reschedule.status).toBe(409);
    expect(await errorCode(reschedule)).toBe('ALREADY_PUBLISHED');
  });

  it('maps word count, schedule time, hidden and not-scheduled errors', async () => {
    const cookie = await signedIn('author');
    const short = await chapterWith(cookie, words(299));
    const tooShort = await call(`/stories/${short.publicId}/chapters/1/publish`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: short.base },
    });
    expect(tooShort.status).toBe(422);
    expect(await errorCode(tooShort)).toBe('WORD_COUNT_OUT_OF_RANGE');

    const { publicId, base } = await chapterWith(cookie, words(300));
    const soon = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'PUT',
      cookie,
      json: { baseUpdatedAt: base, scheduledAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(soon.status).toBe(422);
    expect(await errorCode(soon)).toBe('INVALID_SCHEDULE_TIME');

    const noOffset = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'PUT',
      cookie,
      json: { baseUpdatedAt: base, scheduledAt: '2026-12-01T08:00:00' },
    });
    expect(noOffset.status).toBe(400);

    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'PUT',
      cookie,
      json: { baseUpdatedAt: base, scheduledAt },
    });
    expect(scheduled.status).toBe(200);
    expect(((await scheduled.json()) as PublishBody).chapter).toMatchObject({
      status: 'scheduled',
      scheduledAt,
    });

    const unscheduled = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'DELETE',
      cookie,
    });
    expect(unscheduled.status).toBe(200);
    const twice = await call(`/stories/${publicId}/chapters/1/schedule`, {
      method: 'DELETE',
      cookie,
    });
    expect(twice.status).toBe(409);
    expect(await errorCode(twice)).toBe('NOT_SCHEDULED');

    await db.update(chapters).set({ status: 'hidden_by_mod' });
    const hidden = await call(`/stories/${publicId}/chapters/1/publish`, {
      method: 'POST',
      cookie,
      json: { baseUpdatedAt: base },
    });
    expect(hidden.status).toBe(409);
    expect(await errorCode(hidden)).toBe('CHAPTER_HIDDEN_BY_MOD');
    const meta = await call(`/stories/${publicId}/chapters/1`, {
      method: 'PATCH',
      cookie,
      json: { title: 'x' },
    });
    expect(meta.status).toBe(409);
  });

  it('soft deletes with 204 and guards ownership', async () => {
    const cookie = await signedIn('author');
    const other = await signedIn('other');
    const { publicId } = await chapterWith(cookie, words(10));
    const forbidden = await call(`/stories/${publicId}/chapters/1`, {
      method: 'DELETE',
      cookie: other,
    });
    expect(forbidden.status).toBe(403);
    const guest = await call(`/stories/${publicId}/chapters/1/publish`, {
      method: 'POST',
      json: { baseUpdatedAt: new Date().toISOString() },
    });
    expect(guest.status).toBe(401);

    const deleted = await call(`/stories/${publicId}/chapters/1`, { method: 'DELETE', cookie });
    expect(deleted.status).toBe(204);
    const gone = await call(`/stories/${publicId}/chapters/1/draft`, { cookie });
    expect(gone.status).toBe(404);
  });
});
