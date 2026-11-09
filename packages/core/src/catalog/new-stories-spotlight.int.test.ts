import { chapters, reports, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { NEW_STORY_SPOTLIGHT } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { StoryActor } from '../policies/story';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getHomePage } from './home-page';
import { listNewStoriesSpotlight } from './new-stories-spotlight';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * HOUR_MS);

/**
 * A published story that qualifies for the spotlight (2 days old, 3 chapters, 5,000 words) unless
 * `values` says otherwise. Returns its internal id.
 */
async function candidate(
  author: StoryActor,
  title: string,
  values: Partial<typeof stories.$inferInsert> = {},
): Promise<string> {
  const s = await makePublishedStory(db, author, 1, title);
  await db
    .update(stories)
    .set({ chapterCount: 3, wordCount: 5_000, createdAt: daysAgo(2), ...values })
    .where(eq(stories.id, s.storyId));
  return s.storyId;
}

async function makeReporter(username: string, emailVerified: boolean, createdAt: Date) {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      emailVerified,
      createdAt,
    })
    .returning({ id: users.id });
  if (!row) throw new Error('user insert failed');
  return row.id;
}

async function firstChapterId(storyId: string): Promise<string> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.storyId, storyId))
    .limit(1);
  if (!row) throw new Error('chapter missing');
  return row.id;
}

const titles = (list: { title: string }[]) => list.map((s) => s.title).sort();

describe('listNewStoriesSpotlight', () => {
  it('lists new public stories past the threshold that no trusted open report is about', async () => {
    const author = await makeAuthor(db);
    await candidate(author, 'Mới Đủ');
    await candidate(author, 'Ba Mươi Ngày', { createdAt: daysAgo(30) });
    await candidate(author, 'Quá Cũ', { createdAt: daysAgo(31) });
    await candidate(author, 'Mười Tám', { isMature: true });
    await candidate(author, 'Dưới Ngưỡng', { wordCount: 4_999 });
    await candidate(author, 'Bị Ẩn', { visibility: 'hidden_by_mod' });
    const banned = await makeAuthor(db, 'banned_author');
    await candidate(banned, 'Tác Giả Bị Cấm');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    const trusted = await makeReporter('trusted', true, daysAgo(10));
    const unverified = await makeReporter('unverified', false, daysAgo(10));
    const fresh = await makeReporter('fresh', true, daysAgo(1));
    const bannedReporter = await makeReporter('banned_reporter', true, daysAgo(10));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, bannedReporter));
    const reported = await candidate(author, 'Bị Báo Cáo');
    const autoReported = await candidate(author, 'Chương Trùng Lặp');
    const resolved = await candidate(author, 'Đã Xử Lý');
    const spammed = await candidate(author, 'Bị Báo Bừa');
    await db.insert(reports).values([
      { reporterId: trusted, targetType: 'story', targetId: reported, reason: 'spam' },
      {
        reporterId: null,
        targetType: 'chapter',
        targetId: await firstChapterId(autoReported),
        reason: 'duplicate',
      },
      {
        reporterId: trusted,
        targetType: 'chapter',
        targetId: await firstChapterId(resolved),
        reason: 'spam',
        status: 'resolved',
      },
      { reporterId: unverified, targetType: 'story', targetId: spammed, reason: 'spam' },
      { reporterId: bannedReporter, targetType: 'story', targetId: spammed, reason: 'copyright' },
      {
        reporterId: fresh,
        targetType: 'chapter',
        targetId: await firstChapterId(spammed),
        reason: 'plagiarism',
      },
    ]);

    const expected = ['Ba Mươi Ngày', 'Bị Báo Bừa', 'Mới Đủ', 'Đã Xử Lý'].sort();
    expect(titles(await listNewStoriesSpotlight(db, NOW))).toEqual(expected);
    // The home page carries the same section.
    expect(titles((await getHomePage(db, NOW)).spotlight)).toEqual(expected);

    // A trusted report on a chapter keeps the whole story out until it is handled.
    await db.insert(reports).values({
      reporterId: trusted,
      targetType: 'chapter',
      targetId: await firstChapterId(spammed),
      reason: 'copyright',
    });
    expect(titles(await listNewStoriesSpotlight(db, NOW))).not.toContain('Bị Báo Bừa');
  });

  it('keeps one order all hour, shuffles the next hour and shows at most 8', async () => {
    const author = await makeAuthor(db);
    for (let i = 1; i <= NEW_STORY_SPOTLIGHT.size + 1; i++) await candidate(author, `Truyện ${i}`);

    const order = async (at: Date) =>
      (await listNewStoriesSpotlight(db, at)).map((s) => s.publicId);
    const hourStart = new Date(Math.floor(NOW.getTime() / HOUR_MS) * HOUR_MS);
    const thisHour = await order(hourStart);
    expect(thisHour).toHaveLength(NEW_STORY_SPOTLIGHT.size);
    expect(await order(new Date(hourStart.getTime() + HOUR_MS - 1))).toEqual(thisHour);
    expect(await order(new Date(hourStart.getTime() + HOUR_MS))).not.toEqual(thisHour);
  });

  it('takes a larger limit, starting with the same stories in the same order', async () => {
    const author = await makeAuthor(db);
    for (let i = 1; i <= NEW_STORY_SPOTLIGHT.size + 3; i++) await candidate(author, `Truyện ${i}`);
    const base = (await listNewStoriesSpotlight(db, NOW)).map((s) => s.publicId);
    const more = (await listNewStoriesSpotlight(db, NOW, NEW_STORY_SPOTLIGHT.size + 2)).map(
      (s) => s.publicId,
    );
    expect(more).toHaveLength(NEW_STORY_SPOTLIGHT.size + 2);
    expect(more.slice(0, NEW_STORY_SPOTLIGHT.size)).toEqual(base);
    // The home page loads the extra stories its sections may need once they drop repeats.
    expect((await getHomePage(db, NOW)).spotlight).toHaveLength(NEW_STORY_SPOTLIGHT.size + 3);
  });
});
