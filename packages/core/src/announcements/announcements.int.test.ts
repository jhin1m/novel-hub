import { contentEvents, notifications, stories, storyAnnouncements, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthorPage } from '../catalog/author-page';
import { urlsFor } from '../cdn/urls-for';
import { followAuthor, followStory } from '../follows/follows';
import { listNotifications } from '../notifications/list-notifications';
import { notifyFollowersOfChapter } from '../notifications/notify-followers';
import type { StoryActor } from '../policies/story';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { createStory } from '../stories/create-story';
import { deleteAnnouncement } from './delete-announcement';
import {
  listAuthorAnnouncements,
  listManagedAnnouncements,
  listStoryAnnouncements,
} from './list-announcements';
import { notifyFollowersOfAnnouncement } from './notify-announcement';
import { postAnnouncement } from './post-announcement';

const { db, pool } = createTestDb();
const APP = 'https://truyen.example';

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup() {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1);
  const reader = await makeUser(db, 'doc_gia');
  return { author, story, reader };
}

async function post(actor: StoryActor, publicId: string, body = 'Tạm nghỉ hết tuần', now?: Date) {
  const result = await postAnnouncement(db, actor, publicId, body, now);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function setStatus(userId: string, status: 'muted' | 'banned') {
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

/** The reader's `story_announcement` rows, read or not. */
async function announcementRows(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'story_announcement')));
}

describe('postAnnouncement', () => {
  it('posts on the author’s public story and records the outbox change', async () => {
    const { author, story } = await setup();
    const posted = await post(author, story.publicId);
    expect(posted).toMatchObject({ body: 'Tạm nghỉ hết tuần' });
    expect(Object.keys(posted).sort()).toEqual(['body', 'createdAt', 'id']);

    const events = await db.select({ payload: contentEvents.payload }).from(contentEvents);
    expect(events.map((e) => e.payload)).toContainEqual({
      entity: 'announcement',
      action: 'posted',
      announcementId: posted.id,
      storyId: story.storyId,
    });
  });

  it('refuses someone else’s story, a muted author, an unknown, draft or hidden story', async () => {
    const { author, story, reader } = await setup();
    expect(await postAnnouncement(db, reader, story.publicId, 'x')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await postAnnouncement(db, author, 'zzzzzzzz', 'x')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });

    const draft = await createStory(db, author, {
      title: 'Bản Nháp',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    if (!draft.ok) throw new Error(draft.error);
    expect(await postAnnouncement(db, author, draft.value.publicId, 'x')).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });

    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(await postAnnouncement(db, author, story.publicId, 'x')).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });

    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.storyId));
    await setStatus(author.id, 'muted');
    expect(await postAnnouncement(db, { ...author, status: 'muted' }, story.publicId, 'x')).toEqual(
      { ok: false, error: 'USER_MUTED' },
    );
    expect(await db.select().from(storyAnnouncements)).toHaveLength(0);
  });

  it('allows 3 a Vietnamese day, deleted ones included, and resets at 00:00 Vietnam time', async () => {
    const { author, story } = await setup();
    // 23:00 on 7 Oct in Vietnam (UTC+7) is 16:00 UTC; midnight there is 17:00 UTC.
    const lateEvening = new Date('2026-10-07T16:00:00Z');
    const first = await post(author, story.publicId, 'Một', lateEvening);
    await post(author, story.publicId, 'Hai', lateEvening);
    expect(await deleteAnnouncement(db, author, story.publicId, first.id)).toEqual({
      ok: true,
      value: undefined,
    });
    await post(author, story.publicId, 'Ba', lateEvening);
    expect(await postAnnouncement(db, author, story.publicId, 'Bốn', lateEvening)).toEqual({
      ok: false,
      error: 'ANNOUNCEMENT_DAILY_LIMIT',
    });
    // Still 7 Oct in Vietnam one minute before midnight.
    expect(
      await postAnnouncement(db, author, story.publicId, 'Bốn', new Date('2026-10-07T16:59:00Z')),
    ).toEqual({ ok: false, error: 'ANNOUNCEMENT_DAILY_LIMIT' });
    await post(author, story.publicId, 'Ngày mới', new Date('2026-10-07T17:00:00Z'));
  });

  it('lets only 3 of 4 parallel posts through', async () => {
    const { author, story } = await setup();
    const results = await Promise.all(
      ['A', 'B', 'C', 'D'].map((body) => postAnnouncement(db, author, story.publicId, body)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual([
      'ANNOUNCEMENT_DAILY_LIMIT',
    ]);
  });
});

describe('deleteAnnouncement', () => {
  it('deletes a visible one, records a purge-only change, and refuses repeats', async () => {
    const { author, story, reader } = await setup();
    const posted = await post(author, story.publicId);
    expect(await deleteAnnouncement(db, reader, story.publicId, posted.id)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await deleteAnnouncement(db, author, story.publicId, posted.id)).ok).toBe(true);
    expect(await deleteAnnouncement(db, author, story.publicId, posted.id)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const events = await db.select({ payload: contentEvents.payload }).from(contentEvents);
    expect(events.map((e) => e.payload)).toContainEqual({
      entity: 'announcement',
      action: 'deleted',
      announcementId: posted.id,
      storyId: story.storyId,
    });
    expect(await listStoryAnnouncements(db, story.storyId, { limit: 10 })).toEqual([]);
  });

  it('never reaches another story’s announcement through the author’s own public id', async () => {
    const { author, story } = await setup();
    const other = await makeAuthor(db, 'tac_gia_khac');
    const otherStory = await makePublishedStory(db, other, 1, 'Truyện Khác');
    const theirs = await post(other, otherStory.publicId);
    expect(await deleteAnnouncement(db, author, story.publicId, theirs.id)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await listStoryAnnouncements(db, otherStory.storyId, { limit: 10 })).toHaveLength(1);
  });

  it('leaves one hidden by a moderator alone', async () => {
    const { author, story } = await setup();
    const posted = await post(author, story.publicId);
    await db
      .update(storyAnnouncements)
      .set({ status: 'hidden_by_mod' })
      .where(eq(storyAnnouncements.id, posted.id));
    expect(await deleteAnnouncement(db, author, story.publicId, posted.id)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });
});

describe('listing announcements', () => {
  it('lists the story’s visible ones newest first, and only to its author for management', async () => {
    const { author, story, reader } = await setup();
    await post(author, story.publicId, 'Cũ', new Date(Date.now() - 60_000));
    await post(author, story.publicId, 'Mới');
    expect(
      (await listStoryAnnouncements(db, story.storyId, { limit: 1 })).map((a) => a.body),
    ).toEqual(['Mới']);
    const managed = await listManagedAnnouncements(db, author, story.publicId);
    expect(managed.ok && managed.value.map((a) => a.body)).toEqual(['Mới', 'Cũ']);
    expect(await listManagedAnnouncements(db, reader, story.publicId)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('shows the author’s latest ones on the author page, never those of an 18+ story', async () => {
    const { author, story } = await setup();
    const mature = await makePublishedStory(db, author, 1, 'Truyện Người Lớn', { isMature: true });
    await post(author, mature.publicId, 'Của truyện 18+');
    await post(author, story.publicId, 'Của truyện thường');

    const items = await listAuthorAnnouncements(db, author.id, { limit: 3 });
    expect(items).toEqual([
      expect.objectContaining({
        body: 'Của truyện thường',
        story: { publicId: story.publicId, slug: story.slug, title: 'Kiếm Đạo Độc Tôn' },
      }),
    ]);
    // The author page is cached for everyone: no internal id in its data.
    expect(items[0]).not.toHaveProperty('id');
    const page = await getAuthorPage(db, 'tac_gia', { includeMature: true });
    expect(page?.announcements.map((a) => a.body)).toEqual(['Của truyện thường']);
  });
});

describe('notifyFollowersOfAnnouncement', () => {
  it('tells story followers only, once, even after they read it', async () => {
    const { author, story, reader } = await setup();
    const authorFan = await makeUser(db, 'fan_tac_gia');
    const banned = await makeUser(db, 'bi_cam');
    await followStory(db, reader, story.publicId);
    await followStory(db, banned, story.publicId);
    await followStory(db, author, story.publicId);
    await followAuthor(db, authorFan, 'tac_gia');
    await setStatus(banned.id, 'banned');

    const posted = await post(author, story.publicId);
    expect(await notifyFollowersOfAnnouncement(db, posted.id)).toEqual({ affected: 1 });
    expect(await announcementRows(reader.id)).toHaveLength(1);
    for (const nobody of [authorFan.id, banned.id, author.id]) {
      expect(await announcementRows(nobody)).toHaveLength(0);
    }

    expect(await notifyFollowersOfAnnouncement(db, posted.id)).toEqual({ affected: 0 });
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.userId, reader.id));
    expect(await notifyFollowersOfAnnouncement(db, posted.id)).toEqual({ affected: 0 });
    expect(await announcementRows(reader.id)).toHaveLength(1);
  });

  it('keeps the unread new-chapter notification of the same story', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const number = await addChapter(db, author, story.publicId);
    const [chapter] = await db.query.chapters.findMany({
      where: (c, { and: all, eq: equals }) =>
        all(equals(c.storyId, story.storyId), equals(c.number, number)),
    });
    if (!chapter) throw new Error('chapter missing');
    await notifyFollowersOfChapter(db, chapter.id);
    const posted = await post(author, story.publicId);
    await notifyFollowersOfAnnouncement(db, posted.id);
    // Running the chapter fan-out again leaves the announcement notification alone.
    await notifyFollowersOfChapter(db, chapter.id);

    const { items } = await listNotifications(db, reader.id);
    expect(items.map((n) => n.type).sort()).toEqual(['chapter_published', 'story_announcement']);
    const keys = await db
      .select({ key: notifications.dedupeKey })
      .from(notifications)
      .where(eq(notifications.userId, reader.id));
    expect(keys.map((k) => k.key).sort()).toEqual(
      [`announcement:${posted.id}`, `story:${story.storyId}`].sort(),
    );
  });

  it('sends nothing for an announcement deleted before the job ran, or of a hidden story', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const deleted = await post(author, story.publicId, 'Một');
    await deleteAnnouncement(db, author, story.publicId, deleted.id);
    expect(await notifyFollowersOfAnnouncement(db, deleted.id)).toEqual({ affected: 0 });

    const kept = await post(author, story.publicId, 'Hai');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(await notifyFollowersOfAnnouncement(db, kept.id)).toEqual({ affected: 0 });
    const id = (await db.execute<{ id: string }>(sql`select uuidv7() as id`)).rows[0]?.id ?? '';
    expect(await notifyFollowersOfAnnouncement(db, id)).toEqual({ affected: 0 });
  });

  it('drops the notification from the list once the announcement is deleted', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const posted = await post(author, story.publicId);
    await notifyFollowersOfAnnouncement(db, posted.id);
    expect((await listNotifications(db, reader.id)).items).toHaveLength(1);
    await deleteAnnouncement(db, author, story.publicId, posted.id);
    expect((await listNotifications(db, reader.id)).items).toHaveLength(0);
  });
});

describe('urlsFor announcement', () => {
  it('purges exactly the story page and the author page', async () => {
    const { author, story } = await setup();
    await addChapter(db, author, story.publicId);
    const posted = await post(author, story.publicId);
    for (const action of ['posted', 'deleted', 'hidden', 'restored'] as const) {
      const urls = await urlsFor(
        db,
        { entity: 'announcement', action, announcementId: posted.id, storyId: story.storyId },
        APP,
      );
      expect(urls).toEqual([
        `${APP}/stories/${story.slug}-${story.publicId}`,
        `${APP}/authors/tac_gia`,
      ]);
    }
  });
});
