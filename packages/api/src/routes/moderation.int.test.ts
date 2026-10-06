import {
  type CurrentUser,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import {
  contentEvents,
  featuredSlots,
  moderationActions,
  reports,
  stories,
  users,
} from '@novel-hub/db';
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

async function makeUser(
  username: string,
  role: CurrentUser['role'] = 'reader',
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: 'U',
      email: `${username}@example.com`,
      emailVerified: true,
      role,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** A story by `author` with one published chapter; returns its public id. */
async function makeStory(author: CurrentUser): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Báo Cáo',
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

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

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

const post = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
});

describe('reports and moderation over HTTP', () => {
  it('report → queue → hide the chapter, with the report resolved', async () => {
    const publicId = await makeStory(await makeUser('author'));
    const reader = await makeUser('reader_one');
    const mod = await makeUser('mod_one', 'mod');
    const target = { type: 'chapter', storyPublicId: publicId, number: 1 };

    const created = await appAs(reader).request(
      '/api/v1/reports',
      post({ target, reason: 'plagiarism', detail: 'Chép từ trang khác' }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ created: true });
    const repeat = await appAs(reader).request(
      '/api/v1/reports',
      post({ target, reason: 'plagiarism' }),
    );
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual({ created: false });
    const missing = await appAs(reader).request(
      '/api/v1/reports',
      post({ target: { ...target, number: 7 }, reason: 'spam' }),
    );
    expect(missing.status).toBe(404);

    const queue = await appAs(mod).request('/api/v1/moderation/reports?status=open');
    expect(queue.status).toBe(200);
    const text = await queue.text();
    const page = JSON.parse(text) as { items: { reportId: string }[] };
    expect(page.items).toHaveLength(1);
    const reportId = page.items[0]?.reportId ?? '';
    expect(text.match(UUID)).toEqual([reportId]);

    const hide = { action: 'hide_chapter', storyPublicId: publicId, number: 1, reportId };
    const acted = await appAs(mod).request('/api/v1/moderation/actions', post(hide));
    expect(acted.status).toBe(200);
    expect(await acted.json()).toEqual({ action: 'hide_chapter' });
    const again = await appAs(mod).request('/api/v1/moderation/actions', post(hide));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });

    const [report] = await db.select().from(reports);
    expect(report).toMatchObject({ status: 'resolved', handledBy: mod.id });
    const events = await db.select().from(contentEvents);
    expect(events.at(-1)?.payload).toMatchObject({ entity: 'chapter', action: 'hidden' });
  });

  it('answers 403 when the moderator may not act on the user, 404 for unknown targets', async () => {
    const mod = await makeUser('mod_one', 'mod');
    await makeUser('admin_one', 'admin');
    const forbidden = await appAs(mod).request(
      '/api/v1/moderation/actions',
      post({ action: 'ban_user', username: 'admin_one' }),
    );
    expect(forbidden.status).toBe(403);
    const unknown = await appAs(mod).request(
      '/api/v1/moderation/actions',
      post({ action: 'restore_story', storyPublicId: 'zzzzzzzz' }),
    );
    expect(unknown.status).toBe(404);
    expect((await db.select().from(users)).every((u) => u.status === 'active')).toBe(true);
  });
});

describe('featured stories over HTTP', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
  const send = (method: string) => ({
    method,
    headers: { origin: TEST_APP_URL },
  });

  it('a moderator features, lists, ends and deletes; readers get 403', async () => {
    const publicId = await makeStory(await makeUser('author'));
    const mod = await makeUser('mod_one', 'mod');
    const reader = await makeUser('reader_one');

    const body = {
      story: `https://example.com/stories/truyen-${publicId}`,
      startsAt: iso(-60_000),
    };
    const tooLong = await appAs(mod).request(
      '/api/v1/moderation/featured',
      post({ ...body, endsAt: iso(91 * DAY) }),
    );
    expect(tooLong.status).toBe(400);
    const created = await appAs(mod).request(
      '/api/v1/moderation/featured',
      post({ ...body, endsAt: iso(7 * DAY) }),
    );
    expect(created.status).toBe(201);
    const running = (await created.json()) as { id: string; state: string };
    expect(running.state).toBe('active');
    const later = await appAs(mod).request(
      '/api/v1/moderation/featured',
      post({ story: publicId, startsAt: iso(2 * DAY), endsAt: iso(3 * DAY) }),
    );
    const upcoming = (await later.json()) as { id: string };

    const list = await appAs(mod).request('/api/v1/moderation/featured');
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      active: [{ id: running.id, story: { publicId } }],
      upcoming: [{ id: upcoming.id }],
      ended: [],
    });

    expect((await appAs(reader).request('/api/v1/moderation/featured')).status).toBe(403);
    expect(
      (
        await appAs(reader).request(
          '/api/v1/moderation/featured',
          post({ ...body, endsAt: iso(DAY) }),
        )
      ).status,
    ).toBe(403);

    const deleteRunning = await appAs(mod).request(
      `/api/v1/moderation/featured/${running.id}`,
      send('DELETE'),
    );
    expect(deleteRunning.status).toBe(409);
    expect(await deleteRunning.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });
    const ended = await appAs(mod).request(
      `/api/v1/moderation/featured/${running.id}/end`,
      send('POST'),
    );
    expect(ended.status).toBe(200);
    const deleted = await appAs(mod).request(
      `/api/v1/moderation/featured/${upcoming.id}`,
      send('DELETE'),
    );
    expect(deleted.status).toBe(200);
    expect(
      (await appAs(mod).request('/api/v1/moderation/featured/not-a-uuid', send('DELETE'))).status,
    ).toBe(400);

    expect(await db.select().from(featuredSlots)).toHaveLength(1);
    expect((await db.select().from(moderationActions)).map((r) => r.action).sort()).toEqual([
      'feature_story',
      'feature_story',
      'unfeature_story',
      'unfeature_story',
    ]);
  });

  it('refuses an 18+ story with 422 FEATURED_MATURE', async () => {
    const publicId = await makeStory(await makeUser('author'));
    await db.update(stories).set({ isMature: true }).where(eq(stories.publicId, publicId));
    const mod = await makeUser('mod_one', 'mod');
    const res = await appAs(mod).request(
      '/api/v1/moderation/featured',
      post({ story: publicId, startsAt: iso(0), endsAt: iso(DAY) }),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'FEATURED_MATURE' } });
  });
});
