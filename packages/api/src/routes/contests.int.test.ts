import {
  type CurrentUser,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { contestEntries, contests, moderationActions, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
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

const HOUR = 60 * 60 * 1000;

async function makeUser(
  username: string,
  role: CurrentUser['role'] = 'reader',
  emailVerified = true,
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({ username, displayName: 'U', email: `${username}@example.com`, emailVerified, role })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** A story by `author` with one published chapter; returns its public id. */
async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Dự Thi',
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
  return publicId;
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

function contestBody(title: string) {
  return {
    title,
    description: 'Chủ đề: mùa thu.',
    startsAt: new Date(Date.now() - HOUR).toISOString(),
    endsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
  };
}

describe('contests over HTTP', () => {
  it('a moderator runs a contest an author enters, then places the entry', async () => {
    const mod = await makeUser('mod_one', 'mod');
    const author = await makeUser('author');
    const publicId = await makeStory(author);

    const created = await appAs(mod).request(
      '/api/v1/moderation/contests',
      send('POST', contestBody('Mùa Thu')),
    );
    expect(created.status).toBe(201);
    const { id, slug } = (await created.json()) as { id: string; slug: string };
    expect(slug).toBe('mua-thu');

    const renamed = await appAs(mod).request(
      `/api/v1/moderation/contests/${id}`,
      send('PATCH', { ...contestBody('Mùa Thu Vàng'), startsAt: undefined }),
    );
    expect(renamed.status).toBe(400);
    const [row] = await db.select().from(contests).where(eq(contests.id, id));
    const patched = await appAs(mod).request(
      `/api/v1/moderation/contests/${id}`,
      send('PATCH', { ...contestBody('Mùa Thu Vàng'), startsAt: row?.startsAt.toISOString() }),
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({ slug: 'mua-thu' });

    const open = await appAs(author).request(`/api/v1/contests/open?story=${publicId}`);
    expect(open.status).toBe(200);
    expect(await open.json()).toEqual([
      expect.objectContaining({ slug, title: 'Mùa Thu Vàng', entered: false, eligible: true }),
    ]);
    const entered = await appAs(author).request(
      `/api/v1/contests/${slug}/entries/${publicId}`,
      send('PUT'),
    );
    expect(entered.status).toBe(200);
    expect(await entered.json()).toEqual({ entered: true });

    const tooEarly = await appAs(mod).request(
      `/api/v1/moderation/contests/${id}/placements`,
      send('PUT', { story: publicId, placement: 1 }),
    );
    expect(tooEarly.status).toBe(409);
    expect(await tooEarly.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });

    // The contest ends.
    await db
      .update(contests)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(contests.id, id));
    const late = await appAs(author).request(
      `/api/v1/contests/${slug}/entries/${publicId}`,
      send('DELETE'),
    );
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: { code: 'CONTEST_NOT_OPEN' } });

    const placed = await appAs(mod).request(
      `/api/v1/moderation/contests/${id}/placements`,
      send('PUT', { story: publicId, placement: 1 }),
    );
    expect(placed.status).toBe(200);
    const entries = await appAs(mod).request(`/api/v1/moderation/contests/${id}/entries`);
    expect(await entries.json()).toEqual([expect.objectContaining({ placement: 1, listed: true })]);
    const list = await appAs(mod).request('/api/v1/moderation/contests');
    expect(await list.json()).toEqual([
      expect.objectContaining({ id, slug, status: 'ended', entryCount: 1 }),
    ]);
    const log = await db.select({ action: moderationActions.action }).from(moderationActions);
    expect(log.map((l) => l.action).sort()).toEqual([
      'create_contest',
      'set_contest_placement',
      'update_contest',
    ]);
  });

  it('keeps readers out of the moderator routes', async () => {
    const reader = await makeUser('reader_one');
    expect((await appAs(reader).request('/api/v1/moderation/contests')).status).toBe(403);
    expect(
      (
        await appAs(reader).request(
          '/api/v1/moderation/contests',
          send('POST', contestBody('Mùa Thu')),
        )
      ).status,
    ).toBe(403);
  });

  it('keeps authors to their own stories, and asks for a verified email to enter', async () => {
    const mod = await makeUser('mod_one', 'mod');
    const author = await makeUser('author');
    const other = await makeUser('other');
    const unverified = await makeUser('unverified', 'reader', false);
    const publicId = await makeStory(author);
    await appAs(mod).request('/api/v1/moderation/contests', send('POST', contestBody('Mùa Thu')));

    const stranger = await appAs(other).request(
      `/api/v1/contests/mua-thu/entries/${publicId}`,
      send('PUT'),
    );
    expect(stranger.status).toBe(404);
    expect((await appAs(other).request(`/api/v1/contests/open?story=${publicId}`)).status).toBe(
      404,
    );
    const notVerified = await appAs(unverified).request(
      `/api/v1/contests/mua-thu/entries/${publicId}`,
      send('PUT'),
    );
    expect(notVerified.status).toBe(403);
    expect(await db.select().from(contestEntries)).toHaveLength(0);
  });
});
