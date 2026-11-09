import { notifications, stories, storyAnnouncements, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { followStory } from '../follows/follows';
import { findRateableStory } from '../ratings/rating-dto';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { ANNOUNCEMENT_EXCERPT_MAX, listNotifications } from './list-notifications';
import { notifyFollowersOfChapter } from './notify-followers';
import { countUnreadNotifications } from './unread-count';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup(opts: { isMature?: boolean } = {}) {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1, 'Kiếm Đạo Độc Tôn', opts);
  const reader = await makeUser(db, 'doc_gia');
  return { author, story, reader };
}

/** Inserts an announcement and its notification directly, as the fan-out will. */
async function announce(
  storyId: string,
  authorId: string,
  userId: string,
  body = 'Tạm nghỉ hết tuần',
) {
  const [row] = await db
    .insert(storyAnnouncements)
    .values({ storyId, authorId, body })
    .returning({ id: storyAnnouncements.id });
  if (!row) throw new Error('announcement insert failed');
  await db.insert(notifications).values({
    userId,
    type: 'story_announcement',
    payload: { storyId, announcementId: row.id },
  });
  return row.id;
}

async function warn(userId: string, reason = 'Bình luận spam') {
  await db.insert(notifications).values({ userId, type: 'user_warned', payload: { reason } });
}

/** The list shows exactly what the badge counts while everything is unread. */
async function expectListMatchesCount(userId: string, expected: number) {
  expect((await listNotifications(db, userId)).items).toHaveLength(expected);
  expect(await countUnreadNotifications(db, userId)).toBe(expected);
}

describe('story_announcement and user_warned notifications', () => {
  it('lists all three types newest first and counts the same ones unread', async () => {
    const { author, story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    const number = await addChapter(db, author, story.publicId);
    const [chapter] = await db.query.chapters.findMany({
      where: (c, { and, eq: equals }) =>
        and(equals(c.storyId, story.storyId), equals(c.number, number)),
    });
    if (!chapter) throw new Error('chapter missing');
    await notifyFollowersOfChapter(db, chapter.id);
    await announce(story.storyId, author.id, reader.id);
    await warn(reader.id);

    const { items } = await listNotifications(db, reader.id);
    expect(items.map((n) => n.type)).toEqual([
      'user_warned',
      'story_announcement',
      'chapter_published',
    ]);
    expect(items[0]).toMatchObject({ type: 'user_warned', reason: 'Bình luận spam', read: false });
    expect(items[1]).toMatchObject({
      type: 'story_announcement',
      excerpt: 'Tạm nghỉ hết tuần',
      story: { publicId: story.publicId, title: 'Kiếm Đạo Độc Tôn' },
    });
    // `chapter_published` keeps its shape.
    expect(items[2]).toMatchObject({
      type: 'chapter_published',
      count: 1,
      chapter: { number },
      story: { publicId: story.publicId },
    });
    expect(Object.keys(items[2] ?? {}).sort()).toEqual(
      ['chapter', 'count', 'createdAt', 'id', 'read', 'story', 'type'].sort(),
    );
    expect(await countUnreadNotifications(db, reader.id)).toBe(3);
  });

  it('cuts long announcements to an excerpt', async () => {
    const { author, story, reader } = await setup();
    await announce(story.storyId, author.id, reader.id, 'x'.repeat(500));
    const [item] = (await listNotifications(db, reader.id)).items;
    expect(item?.type === 'story_announcement' && Array.from(item.excerpt)).toHaveLength(
      ANNOUNCEMENT_EXCERPT_MAX,
    );
  });

  it('drops announcements deleted or hidden by a moderator, and of hidden stories or banned authors', async () => {
    const { author, story, reader } = await setup();
    const id = await announce(story.storyId, author.id, reader.id);
    await expectListMatchesCount(reader.id, 1);

    for (const status of ['hidden_by_mod', 'deleted']) {
      await db.update(storyAnnouncements).set({ status }).where(eq(storyAnnouncements.id, id));
      await expectListMatchesCount(reader.id, 0);
    }
    await db.update(storyAnnouncements).set({ status: 'visible' });

    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    await expectListMatchesCount(reader.id, 0);
    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.storyId));

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    await expectListMatchesCount(reader.id, 0);
  });

  it('shows announcements of 18+ stories only to readers who turned 18+ on', async () => {
    const { author, story, reader } = await setup({ isMature: true });
    await announce(story.storyId, author.id, reader.id);
    await expectListMatchesCount(reader.id, 0);
    await db
      .update(users)
      .set({ preferences: { showMature: true } })
      .where(eq(users.id, reader.id));
    await expectListMatchesCount(reader.id, 1);
  });

  it('always shows warnings to the warned user, and pages across types', async () => {
    const { author, story, reader } = await setup();
    await warn(reader.id, 'Lần 1');
    await announce(story.storyId, author.id, reader.id);
    await warn(reader.id, 'Lần 2');
    // Hidden stories do not hide warnings.
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    await expectListMatchesCount(reader.id, 2);

    const first = await listNotifications(db, reader.id, undefined, 1);
    expect(first.items).toMatchObject([{ type: 'user_warned', reason: 'Lần 2' }]);
    const second = await listNotifications(db, reader.id, first.nextCursor ?? undefined, 1);
    expect(second.items).toMatchObject([{ type: 'user_warned', reason: 'Lần 1' }]);
    expect(second.nextCursor).toBeNull();
  });
});

describe('payloads of other types', () => {
  it('never cast keys a payload of another type happens to carry', async () => {
    const { author, story, reader } = await setup();
    await announce(story.storyId, author.id, reader.id);
    // A warning (or a future type) storing non-uuid text under the keys other types cast.
    await db.insert(notifications).values({
      userId: reader.id,
      type: 'user_warned',
      payload: { reason: 'Spam', storyId: 'not-a-uuid', chapterIds: 'x', announcementId: 'y' },
    });
    await expectListMatchesCount(reader.id, 2);
  });
});

describe('findRateableStory', () => {
  it('reports whether the story is 18+', async () => {
    const author = await makeAuthor(db, 'tac_gia');
    const plain = await makePublishedStory(db, author, 1, 'Thường');
    const mature = await makePublishedStory(db, author, 1, 'Người lớn', { isMature: true });
    expect(await findRateableStory(db, plain.publicId)).toMatchObject({ isMature: false });
    expect(await findRateableStory(db, mature.publicId)).toMatchObject({
      id: mature.storyId,
      authorId: author.id,
      isMature: true,
    });
  });
});
