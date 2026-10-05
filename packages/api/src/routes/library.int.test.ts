import type { CurrentUser } from '@novel-hub/core';
import {
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
  saveReadingProgress,
} from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

async function insertUser(username: string, emailVerified = true): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({ username, displayName: 'U', email: `${username}@example.com`, emailVerified })
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
    createdAt: row.createdAt,
  };
}

/** A reader whose email is not verified: the library does not require it. */
function insertReader(): Promise<CurrentUser> {
  return insertUser('reader', false);
}

/** A story by a new author with `published` published chapters (none = still a draft). */
async function makeStory(published: number): Promise<{ publicId: string }> {
  const author = await insertUser('author');
  const actor = { id: author.id, role: author.role, status: author.status, emailVerified: true };
  const story = await createStory(db, actor, {
    title: 'Truyện Tủ',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const { publicId } = story.value;
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  for (let i = 0; i < published; i++) {
    const created = await createChapter(db, actor, publicId);
    if (!created.ok) throw new Error(created.error);
    const saved = await saveDraft(db, actor, publicId, created.value.number, {
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
      },
      baseUpdatedAt: created.value.draftUpdatedAt ?? '',
    });
    if (!saved.ok) throw new Error(saved.error);
    const done = await publishChapter(db, actor, publicId, created.value.number, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!done.ok) throw new Error(done.error);
  }
  return { publicId };
}

function appAs(user: CurrentUser) {
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

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('/api/v1/library', () => {
  it('add, move, list and remove (no verified email needed); no internal ids', async () => {
    const story = await makeStory(1);
    const app = appAs(await insertReader());
    const path = `/api/v1/library/${story.publicId}`;

    expect(await (await app.request(path, send('GET'))).json()).toEqual({ shelf: null });
    const put = await app.request(path, send('PUT', { shelf: 'reading' }));
    expect(put.status).toBe(200);
    expect(put.headers.get('cache-control')).toBe('no-store');
    expect(await put.json()).toEqual({ shelf: 'reading' });
    await app.request(path, send('PUT', { shelf: 'done' }));
    expect(await (await app.request(path, send('GET'))).json()).toEqual({ shelf: 'done' });

    const list = await app.request('/api/v1/library?shelf=done&page=1', send('GET'));
    expect(list.status).toBe(200);
    const text = await list.text();
    expect(text).not.toMatch(UUID);
    const body = JSON.parse(text) as { items: { story: { publicId: string } }[] };
    expect(body).toMatchObject({ page: 1, totalPages: 1 });
    expect(body.items.map((i) => i.story.publicId)).toEqual([story.publicId]);

    expect((await app.request(path, send('DELETE'))).status).toBe(204);
    expect((await app.request(path, send('DELETE'))).status).toBe(204);
    expect(await (await app.request(path, send('GET'))).json()).toEqual({ shelf: null });
  });

  it('a draft or unknown story → 404 NOT_FOUND', async () => {
    const draft = await makeStory(0);
    const app = appAs(await insertReader());
    for (const publicId of [draft.publicId, 'k7m2xq9p']) {
      const res = await app.request(`/api/v1/library/${publicId}`, send('PUT', { shelf: 'plan' }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
      });
    }
  });
});

describe('/api/v1/reading progress and history', () => {
  it('continue reading, history pages and removal; no internal ids', async () => {
    const story = await makeStory(2);
    const reader = await insertReader();
    const app = appAs(reader);
    const progressPath = `/api/v1/reading/progress/${story.publicId}`;

    expect(await (await app.request(progressPath, send('GET'))).json()).toEqual({
      progress: null,
    });
    await saveReadingProgress(db, reader.id, {
      publicId: story.publicId,
      number: 2,
      scrollPct: 55,
    });
    const progress = await app.request(progressPath, send('GET'));
    expect(progress.headers.get('cache-control')).toBe('no-store');
    expect(await progress.json()).toEqual({
      progress: {
        chapterNumber: 2,
        chapterTitle: null,
        scrollPct: 55,
        updatedAt: expect.any(String) as string,
      },
    });

    const history = await app.request('/api/v1/reading/history', send('GET'));
    const text = await history.text();
    expect(text).not.toMatch(UUID);
    expect(JSON.parse(text)).toMatchObject({
      items: [{ story: { publicId: story.publicId }, chapterNumber: 2, scrollPct: 55 }],
      nextCursor: null,
    });

    const removed = await app.request(`/api/v1/reading/history/${story.publicId}`, send('DELETE'));
    expect(removed.status).toBe(204);
    expect(await (await app.request('/api/v1/reading/history', send('GET'))).json()).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
