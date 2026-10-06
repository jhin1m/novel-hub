import { badges, follows, stories, userBadges, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { BADGES } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthorPage } from '../catalog/author-page';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { awardMilestoneBadges } from './award-badges';
import { ensureBadgeCatalog } from './badge-catalog';
import { listUserBadges } from './user-badges';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** Codes awarded to `userId`, in catalog order. */
async function codes(userId: string): Promise<string[]> {
  return (await listUserBadges(db, userId)).map((b) => b.code);
}

/** `n` readers following `authorId`; `unverified` of them have not verified their email. */
async function addFollowers(authorId: string, n: number, unverified = 0): Promise<void> {
  const rows = await db
    .insert(users)
    .values(
      Array.from({ length: n }, (_, i) => ({
        username: `follower_${i}`,
        displayName: `Độc Giả ${i}`,
        email: `follower_${i}@example.com`,
        emailVerified: i >= unverified,
      })),
    )
    .returning({ id: users.id });
  await db
    .insert(follows)
    .values(rows.map((r) => ({ userId: r.id, targetType: 'user' as const, targetId: authorId })));
}

describe('ensureBadgeCatalog', () => {
  it('upserts the catalog idempotently', async () => {
    await ensureBadgeCatalog(db);
    await db.update(badges).set({ name: 'stale' }).where(eq(badges.code, 'chapters_10'));
    await ensureBadgeCatalog(db);
    const rows = await db.select().from(badges);
    expect(rows.map((r) => r.code).sort()).toEqual(BADGES.map((b) => b.code).sort());
    expect(rows.find((r) => r.code === 'chapters_10')?.name).toBe('10 chapters');
  });
});

describe('awardMilestoneBadges', () => {
  it('awards chapter milestones once, from an empty catalog table', async () => {
    const author = await makeAuthor(db);
    await makePublishedStory(db, author, 12);
    expect(await db.select().from(badges)).toHaveLength(0);

    expect(await awardMilestoneBadges(db)).toBe(2);
    expect(await codes(author.id)).toEqual(['first_chapter', 'chapters_10']);
    expect(await awardMilestoneBadges(db)).toBe(0);
    expect(await db.select().from(userBadges)).toHaveLength(2);
  });

  it('counts only public stories of authors who are not banned', async () => {
    const author = await makeAuthor(db);
    const draft = await makePublishedStory(db, author, 0, 'Chỉ Có Nháp');
    await addChapter(db, author, draft.publicId, true);
    expect(await awardMilestoneBadges(db)).toBe(0);

    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    expect(await awardMilestoneBadges(db)).toBe(0);

    const banned = await makeAuthor(db, 'banned_author');
    await makePublishedStory(db, banned, 1);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));
    expect(await awardMilestoneBadges(db)).toBe(0);
    expect(await codes(banned.id)).toEqual([]);
  });

  it('sums chapters and words across stories', async () => {
    const author = await makeAuthor(db);
    const a = await makePublishedStory(db, author, 1, 'Truyện A');
    const b = await makePublishedStory(db, author, 1, 'Truyện B');
    await db.update(stories).set({ wordCount: 60_000 }).where(eq(stories.id, a.storyId));
    await db.update(stories).set({ wordCount: 40_000 }).where(eq(stories.id, b.storyId));
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter', 'words_100k']);
  });

  it('counts only verified followers who are not banned', async () => {
    const author = await makeAuthor(db);
    await makePublishedStory(db, author, 1);
    await addFollowers(author.id, 10, 1);
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter']);

    await db.update(users).set({ emailVerified: true }).where(eq(users.username, 'follower_0'));
    await db.update(users).set({ status: 'banned' }).where(eq(users.username, 'follower_1'));
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter']);

    await db.update(users).set({ status: 'active' }).where(eq(users.username, 'follower_1'));
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter', 'followers_10']);
  });

  it('awards a completed story with a chapter, and never takes a badge back', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await db.update(stories).set({ status: 'completed' }).where(eq(stories.id, s.storyId));
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter', 'story_completed']);

    await db.update(stories).set({ status: 'ongoing' }).where(eq(stories.id, s.storyId));
    await awardMilestoneBadges(db);
    expect(await codes(author.id)).toEqual(['first_chapter', 'story_completed']);
  });
});

describe('listUserBadges', () => {
  it('drops codes no longer in the catalog', async () => {
    const author = await makeAuthor(db);
    await makePublishedStory(db, author, 1);
    await awardMilestoneBadges(db);
    const [retired] = await db
      .insert(badges)
      .values({ code: 'retired_badge', name: 'Retired' })
      .returning();
    if (!retired) throw new Error('badge insert failed');
    await db.insert(userBadges).values({ userId: author.id, badgeId: retired.id });
    expect(await codes(author.id)).toEqual(['first_chapter']);
  });
});

describe('getAuthorPage badges', () => {
  it('lists the badges of the author', async () => {
    const author = await makeAuthor(db);
    await makePublishedStory(db, author, 1);
    expect((await getAuthorPage(db, 'author', { includeMature: false }))?.badges).toEqual([]);
    await awardMilestoneBadges(db);
    const page = await getAuthorPage(db, 'author', { includeMature: false });
    expect(page?.badges.map((b) => b.code)).toEqual(['first_chapter']);
    expect(page?.badges[0]?.awardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
