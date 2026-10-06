import { chapters, notifications, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { followAuthor, followStory } from '../follows/follows';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listNotifications } from './list-notifications';
import { markNotificationsRead } from './mark-read';
import { notifyFollowersOfChapter } from './notify-followers';
import { pruneNotifications } from './prune-notifications';
import { countUnreadNotifications } from './unread-count';

const { db, pool } = createTestDb();

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

async function chapterId(storyId: string, number: number): Promise<string> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
  if (!row) throw new Error('chapter missing');
  return row.id;
}

/** Publishes the next chapter and runs the fan-out the outbox would run for it. */
async function publishAndNotify(
  author: Awaited<ReturnType<typeof makeAuthor>>,
  story: { publicId: string; storyId: string },
) {
  const number = await addChapter(db, author, story.publicId);
  const id = await chapterId(story.storyId, number);
  return { number, id, result: await notifyFollowersOfChapter(db, id) };
}

const rowsOf = (userId: string) =>
  db.select().from(notifications).where(eq(notifications.userId, userId));

describe('notifyFollowersOfChapter', () => {
  it('notifies story and author followers once each, never the author or banned followers', async () => {
    const { author, story, reader } = await setup();
    const both = await makeUser(db, 'ca_hai');
    const banned = await makeUser(db, 'bi_cam');
    await followStory(db, reader, story.publicId);
    await followAuthor(db, both, 'tac_gia');
    await followStory(db, both, story.publicId);
    await followStory(db, banned, story.publicId);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    const { id, result } = await publishAndNotify(author, story);
    expect(result.affected).toBe(2);
    const rows = await db.select().from(notifications);
    expect(rows.map((r) => r.userId).sort()).toEqual([reader.id, both.id].sort());
    expect(rows[0]?.payload).toEqual({ storyId: story.storyId, chapterIds: [id], count: 1 });
    expect(rows[0]?.dedupeKey).toBe(`story:${story.storyId}`);
    expect(await rowsOf(author.id)).toEqual([]);
  });

  it('is idempotent per chapter and groups later chapters into one unread notification', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const first = await publishAndNotify(author, story);
    expect((await notifyFollowersOfChapter(db, first.id)).affected).toBe(0);
    const second = await publishAndNotify(author, story);
    const third = await publishAndNotify(author, story);

    const rows = await rowsOf(reader.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({
      storyId: story.storyId,
      chapterIds: [first.id, second.id, third.id],
      count: 3,
    });
    const page = await listNotifications(db, reader.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      count: 3,
      chapter: { number: third.number },
      read: false,
    });
    expect(await countUnreadNotifications(db, reader.id)).toBe(1);

    // Read: the next chapter starts a new notification.
    expect(await markNotificationsRead(db, reader.id, { all: true })).toBe(1);
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);
    // A late redelivery of a chapter already read about announces nothing again.
    expect((await notifyFollowersOfChapter(db, third.id)).affected).toBe(0);
    const fourth = await publishAndNotify(author, story);
    const after = await listNotifications(db, reader.id);
    expect(after.items.map((n) => [n.count, n.chapter.number, n.read])).toEqual([
      [1, fourth.number, false],
      [3, third.number, true],
    ]);
  });

  it('keeps only the last 20 chapter ids of a grouped notification', async () => {
    const { story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const ids = Array.from(
      { length: 22 },
      (_, i) => `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    // Seed the grouped row directly: 22 publishes would be slow and only the SQL is under test.
    await db.insert(notifications).values({
      userId: reader.id,
      type: 'chapter_published',
      payload: { storyId: story.storyId, chapterIds: ids.slice(0, 20), count: 20 },
      dedupeKey: `story:${story.storyId}`,
    });
    const real = await chapterId(story.storyId, 1);
    await notifyFollowersOfChapter(db, real);
    const [row] = await rowsOf(reader.id);
    const payload = row?.payload as { chapterIds: string[]; count: number };
    expect(payload.count).toBe(21);
    expect(payload.chapterIds).toHaveLength(20);
    expect(payload.chapterIds.at(-1)).toBe(real);
    expect(payload.chapterIds[0]).toBe(ids[1]);
  });

  it('sends nothing for a chapter that can no longer be read', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const number = await addChapter(db, author, story.publicId);
    const id = await chapterId(story.storyId, number);
    await db.update(chapters).set({ status: 'hidden_by_mod' }).where(eq(chapters.id, id));
    expect((await notifyFollowersOfChapter(db, id)).affected).toBe(0);

    await db.update(chapters).set({ status: 'published' }).where(eq(chapters.id, id));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect((await notifyFollowersOfChapter(db, id)).affected).toBe(0);
    expect(await notifyFollowersOfChapter(db, '01920000-0000-7000-8000-000000000999')).toEqual({
      affected: 0,
    });
    expect(await rowsOf(reader.id)).toEqual([]);
  });
});

describe('listing notifications', () => {
  it('hides 18+ stories from the list and the count until the reader turns 18+ on', async () => {
    const { author, story, reader } = await setup();
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, story.storyId));
    await followAuthor(db, reader, 'tac_gia');
    await publishAndNotify(author, story);
    expect(await rowsOf(reader.id)).toHaveLength(1);
    expect((await listNotifications(db, reader.id)).items).toEqual([]);
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);

    await db
      .update(users)
      .set({ preferences: { showMature: true } })
      .where(eq(users.id, reader.id));
    expect((await listNotifications(db, reader.id)).items).toHaveLength(1);
    expect(await countUnreadNotifications(db, reader.id)).toBe(1);
  });

  it('links the latest readable chapter and drops notifications with none left', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const second = await publishAndNotify(author, story);
    const third = await publishAndNotify(author, story);
    await db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, third.id));
    const [item] = (await listNotifications(db, reader.id)).items;
    expect(item?.chapter.number).toBe(second.number);

    await db.update(chapters).set({ status: 'hidden_by_mod' }).where(eq(chapters.id, second.id));
    expect((await listNotifications(db, reader.id)).items).toEqual([]);
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);
  });

  it('drops notifications of hidden stories and banned authors, and unknown types', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    await publishAndNotify(author, story);
    await db
      .insert(notifications)
      .values({ userId: reader.id, type: 'badge_awarded', payload: {} });
    expect(await countUnreadNotifications(db, reader.id)).toBe(1);

    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect((await listNotifications(db, reader.id)).items).toEqual([]);
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);

    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.storyId));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);
  });

  it('pages newest first with a keyset cursor', async () => {
    const reader = await makeUser(db, 'doc_gia');
    for (let i = 0; i < 3; i++) {
      const author = await makeAuthor(db, `tac_gia_${i}`);
      const story = await makePublishedStory(db, author, 0, `Truyện ${i}`);
      // A draft story cannot be followed; follow once it has its first chapter.
      const number = await addChapter(db, author, story.publicId);
      await followStory(db, reader, story.publicId);
      await notifyFollowersOfChapter(db, await chapterId(story.storyId, number));
    }
    const first = await listNotifications(db, reader.id, undefined, 2);
    expect(first.items.map((n) => n.story.title)).toEqual(['Truyện 2', 'Truyện 1']);
    expect(first.nextCursor).not.toBeNull();
    const second = await listNotifications(db, reader.id, first.nextCursor ?? undefined, 2);
    expect(second.items.map((n) => n.story.title)).toEqual(['Truyện 0']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('marking read and pruning', () => {
  it("marks only the reader's own notifications by id", async () => {
    const { author, story, reader } = await setup();
    const other = await makeUser(db, 'nguoi_khac');
    await followStory(db, reader, story.publicId);
    await followStory(db, other, story.publicId);
    await publishAndNotify(author, story);
    const [theirs] = await rowsOf(other.id);
    const [mine] = await rowsOf(reader.id);
    if (!theirs || !mine) throw new Error('missing notifications');

    expect(await markNotificationsRead(db, reader.id, { ids: [theirs.id] })).toBe(0);
    expect(await countUnreadNotifications(db, other.id)).toBe(1);
    expect(await markNotificationsRead(db, reader.id, { ids: [mine.id] })).toBe(1);
    expect(await markNotificationsRead(db, reader.id, { ids: [mine.id] })).toBe(0);
    expect(await countUnreadNotifications(db, reader.id)).toBe(0);
  });

  it('deletes notifications older than the retention, in batches', async () => {
    const reader = await makeUser(db, 'doc_gia');
    const old = new Date(Date.now() - 91 * 24 * 3_600_000);
    await db.insert(notifications).values(
      Array.from({ length: 5 }, () => ({
        userId: reader.id,
        type: 'chapter_published',
        payload: {},
        createdAt: old,
        readAt: old,
      })),
    );
    await db.insert(notifications).values({ userId: reader.id, type: 'chapter_published' });
    expect(await pruneNotifications(db, 90, 2)).toBe(5);
    expect(await rowsOf(reader.id)).toHaveLength(1);
  });
});
