import type { CurrentUser, StoragePort } from '@novel-hub/core';
import { stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Sessions are faked: the `session` cookie carries the user id. */
const sessions = new Map<string, CurrentUser>();
const objects = new Map<string, { cacheControl: string }>();
const deleted: string[] = [];
const storage: StoragePort = {
  put: (key, _body, opts) => {
    objects.set(key, { cacheControl: opts.cacheControl });
    return Promise.resolve();
  },
  delete: (key) => {
    deleted.push(key);
    return Promise.resolve();
  },
  publicUrl: (key) => `https://cdn.test/${key}`,
};

function buildApp(withStorage = true) {
  return createApp(
    makeTestApiDeps({
      db,
      storage: withStorage ? storage : null,
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
  objects.clear();
  deleted.length = 0;
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
  body?: FormData;
  origin?: string;
  target?: ReturnType<typeof buildApp>;
}

function call(
  path: string,
  { method = 'GET', cookie, json, body, origin, target = app }: CallOptions = {},
) {
  const headers: Record<string, string> = { origin: origin ?? TEST_APP_URL };
  if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers['content-type'] = 'application/json';
  return target.request(`${TEST_APP_URL}/api/v1${path}`, {
    method,
    headers,
    body: json === undefined ? body : JSON.stringify(json),
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

const createBody = {
  title: 'Kiếm Đạo Độc Tôn',
  synopsis: 'Giới thiệu',
  mainTag: 'tien-hiep',
  tags: ['he-thong'],
  isMature: true,
};

async function createdStory(cookie: string): Promise<{ publicId: string }> {
  const res = await call('/stories', { method: 'POST', cookie, json: createBody });
  expect(res.status).toBe(201);
  return ((await res.json()) as { story: { publicId: string } }).story;
}

async function png(width: number, height: number, background = '#a8432a'): Promise<Blob> {
  const buffer = await sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(buffer)], { type: 'image/png' });
}

function coverForm(file: Blob, name = 'cover.png'): FormData {
  const form = new FormData();
  form.append('file', file, name);
  return form;
}

describe('POST /api/v1/stories', () => {
  it('guest → 401; unverified email → 403 EMAIL_NOT_VERIFIED; bad body → 400', async () => {
    let res = await call('/stories', { method: 'POST', json: createBody });
    expect([res.status, await errorCode(res)]).toEqual([401, 'UNAUTHENTICATED']);

    const unverified = await signedIn('chua_xac_thuc', false);
    res = await call('/stories', { method: 'POST', cookie: unverified, json: createBody });
    expect([res.status, await errorCode(res)]).toEqual([403, 'EMAIL_NOT_VERIFIED']);

    const cookie = await signedIn('tac_gia');
    res = await call('/stories', { method: 'POST', cookie, json: { ...createBody, title: 'a' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) as unknown },
    });
  });

  it('creates a draft story → 201 without internal ids', async () => {
    const cookie = await signedIn('tac_gia');
    const res = await call('/stories', { method: 'POST', cookie, json: createBody });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { story: Record<string, unknown> };
    expect(body.story).toMatchObject({
      visibility: 'draft',
      slug: 'kiem-dao-doc-ton',
      isMature: true,
    });
    expectNoInternalIds(body);
  });

  it('tag errors → 422 with the core code', async () => {
    const cookie = await signedIn('tac_gia');
    const res = await call('/stories', {
      method: 'POST',
      cookie,
      json: { ...createBody, mainTag: 'xuyen-khong' },
    });
    expect([res.status, await errorCode(res)]).toEqual([422, 'MAIN_TAG_NOT_GENRE']);
  });
});

describe('PATCH /api/v1/stories/:publicId', () => {
  it('author updates; another user → 403; unknown or malformed id → 404', async () => {
    const cookie = await signedIn('tac_gia');
    const other = await signedIn('nguoi_khac');
    const { publicId } = await createdStory(cookie);

    let res = await call(`/stories/${publicId}`, {
      method: 'PATCH',
      cookie,
      json: { title: 'Tên Mới' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { story: { slug: string; publicId: string } };
    expect(body.story).toMatchObject({ slug: 'ten-moi', publicId });
    expectNoInternalIds(body);

    res = await call(`/stories/${publicId}`, {
      method: 'PATCH',
      cookie: other,
      json: { title: 'X y' },
    });
    expect([res.status, await errorCode(res)]).toEqual([403, 'FORBIDDEN']);

    for (const id of ['zzzzzzzz', 'NOT-AN-ID']) {
      res = await call(`/stories/${id}`, { method: 'PATCH', cookie, json: { title: 'X y' } });
      expect([res.status, await errorCode(res)]).toEqual([404, 'NOT_FOUND']);
    }
  });

  it('empty patch → 400', async () => {
    const cookie = await signedIn('tac_gia');
    const { publicId } = await createdStory(cookie);
    const res = await call(`/stories/${publicId}`, { method: 'PATCH', cookie, json: {} });
    expect([res.status, await errorCode(res)]).toEqual([400, 'VALIDATION_ERROR']);
  });
});

describe('GET /api/v1/me/stories and /api/v1/tags', () => {
  it('lists my stories and one story for the edit page, without internal ids', async () => {
    const cookie = await signedIn('tac_gia');
    const { publicId } = await createdStory(cookie);

    const list = await call('/me/stories', { cookie });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { stories: { publicId: string }[] };
    expect(listBody.stories.map((s) => s.publicId)).toEqual([publicId]);
    expectNoInternalIds(listBody);

    const one = await call(`/me/stories/${publicId}`, { cookie });
    expect(one.status).toBe(200);
    expectNoInternalIds(await one.json());

    expect((await call('/me/stories')).status).toBe(401);
    const other = await signedIn('nguoi_khac');
    expect((await call(`/me/stories/${publicId}`, { cookie: other })).status).toBe(403);
  });

  it('tags are public and briefly cacheable', async () => {
    const res = await call('/tags');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await res.json()) as { tags: { slug: string; kind: string }[] };
    expect(body.tags[0]).toEqual({
      slug: expect.any(String) as unknown,
      name: expect.any(String) as unknown,
      kind: 'genre',
    });
    expect(body.tags.some((t) => t.slug === 'tu-tien')).toBe(false);
    expectNoInternalIds(body);
  });
});

describe('PUT/DELETE /api/v1/stories/:publicId/cover', () => {
  it('stores two immutable variants, updates cover_url and keeps the old files', async () => {
    const cookie = await signedIn('tac_gia');
    const { publicId } = await createdStory(cookie);

    let res = await call(`/stories/${publicId}/cover`, {
      method: 'PUT',
      cookie,
      body: coverForm(await png(600, 900)),
    });
    expect(res.status).toBe(200);
    const first = ((await res.json()) as { story: { coverUrl: string } }).story.coverUrl;
    expect(first).toMatch(new RegExp(`/covers/${publicId}/[0-9a-f]{16}-600\\.webp$`));
    const keys = [...objects.keys()].sort();
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.slice(-9))).toEqual(['-300.webp', '-600.webp']);
    for (const object of objects.values()) {
      expect(object.cacheControl).toBe('public, max-age=31536000, immutable');
    }

    res = await call(`/stories/${publicId}/cover`, {
      method: 'PUT',
      cookie,
      body: coverForm(await png(600, 900, '#1f6b66')),
    });
    expect(res.status).toBe(200);
    expect(objects.size).toBe(4);
    expect(deleted).toEqual([]);
    const [row] = await db.select().from(stories).where(eq(stories.publicId, publicId));
    expect(row?.coverUrl).not.toBe(first);

    res = await call(`/stories/${publicId}/cover`, { method: 'DELETE', cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { story: { coverUrl: null } }).story.coverUrl).toBeNull();
    expect(deleted).toEqual([]);
  });

  it('maps bad uploads to 413, 415, 422, 503 and blocks cross-origin multipart', async () => {
    const cookie = await signedIn('tac_gia');
    const { publicId } = await createdStory(cookie);
    const path = `/stories/${publicId}/cover`;

    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/jpeg' });
    let res = await call(path, { method: 'PUT', cookie, body: coverForm(big, 'big.jpg') });
    expect([res.status, await errorCode(res)]).toEqual([413, 'FILE_TOO_LARGE']);

    const text = new Blob(['plain text'], { type: 'image/jpeg' });
    res = await call(path, { method: 'PUT', cookie, body: coverForm(text, 'cover.jpg') });
    expect([res.status, await errorCode(res)]).toEqual([415, 'UNSUPPORTED_IMAGE']);

    res = await call(path, { method: 'PUT', cookie, body: coverForm(await png(500, 800)) });
    expect([res.status, await errorCode(res)]).toEqual([422, 'IMAGE_TOO_SMALL']);

    res = await call(path, { method: 'PUT', cookie, body: new FormData() });
    expect([res.status, await errorCode(res)]).toEqual([400, 'VALIDATION_ERROR']);

    res = await call(path, {
      method: 'PUT',
      cookie,
      body: coverForm(await png(600, 900)),
      target: buildApp(false),
    });
    expect([res.status, await errorCode(res)]).toEqual([503, 'STORAGE_UNAVAILABLE']);

    res = await call(path, {
      method: 'PUT',
      cookie,
      body: coverForm(await png(600, 900)),
      origin: 'http://evil.example',
    });
    expect(res.status).toBe(403);
    expect(objects.size).toBe(0);
  });

  it('another user cannot change the cover', async () => {
    const cookie = await signedIn('tac_gia');
    const other = await signedIn('nguoi_khac');
    const { publicId } = await createdStory(cookie);
    const res = await call(`/stories/${publicId}/cover`, {
      method: 'PUT',
      cookie: other,
      body: coverForm(await png(600, 900)),
    });
    expect([res.status, await errorCode(res)]).toEqual([403, 'FORBIDDEN']);
    expect(
      (await call(`/stories/${publicId}/cover`, { method: 'DELETE', cookie: other })).status,
    ).toBe(403);
  });
});
