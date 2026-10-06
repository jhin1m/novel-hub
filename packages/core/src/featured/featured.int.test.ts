import { featuredSlots, moderationActions, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getHomePage } from '../catalog/home';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listActiveFeatured } from './active-featured';
import { listFeaturedSlotsForMods } from './featured-slot-list';
import { createFeaturedSlot, deleteFeaturedSlot, endFeaturedSlot } from './featured-slots';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-06T03:00:00Z');
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();

async function logRows() {
  return db
    .select({ action: moderationActions.action, targetType: moderationActions.targetType })
    .from(moderationActions);
}

describe('createFeaturedSlot', () => {
  it('features a public story and logs it', async () => {
    const mod = await makeUser(db, 'mod_a', 'mod');
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);

    const created = await createFeaturedSlot(
      db,
      mod,
      { story: story.publicId, startsAt: at(-1), endsAt: at(24) },
      NOW,
    );
    expect(created.ok && created.value.state).toBe('active');
    const list = await listFeaturedSlotsForMods(db, mod, NOW);
    expect(list.ok && list.value.active[0]?.story).toEqual({
      publicId: story.publicId,
      slug: story.slug,
      title: 'Kiếm Đạo Độc Tôn',
      coverUrl: null,
      authorName: 'Lâm Phong',
      mainTagSlug: 'tien-hiep',
    });
    expect(await logRows()).toEqual([{ action: 'feature_story', targetType: 'story' }]);
    expect((await listActiveFeatured(db, NOW)).map((s) => s.publicId)).toEqual([story.publicId]);
  });

  it('refuses 18+, own, hidden and chapterless stories, and non-moderators', async () => {
    const mod = await makeUser(db, 'mod_a', 'mod');
    const author = await makeAuthor(db);
    const window = { startsAt: at(0), endsAt: at(24) };

    const mature = await makePublishedStory(db, author, 1, 'Truyện Người Lớn');
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, mature.storyId));
    expect(await createFeaturedSlot(db, mod, { story: mature.publicId, ...window }, NOW)).toEqual({
      ok: false,
      error: 'FEATURED_MATURE',
    });

    const own = await makePublishedStory(db, { ...mod }, 1, 'Truyện Của Mod');
    expect(await createFeaturedSlot(db, mod, { story: own.publicId, ...window }, NOW)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    const empty = await makePublishedStory(db, author, 0, 'Chưa Có Chương');
    for (const publicId of [hidden.publicId, empty.publicId, 'zzzzzzzz']) {
      expect(await createFeaturedSlot(db, mod, { story: publicId, ...window }, NOW)).toEqual({
        ok: false,
        error: 'NOT_FOUND',
      });
    }

    const reader = await makeUser(db, 'reader_a');
    const story = await makePublishedStory(db, author, 1, 'Bình Thường');
    expect(await createFeaturedSlot(db, reader, { story: story.publicId, ...window }, NOW)).toEqual(
      { ok: false, error: 'FORBIDDEN' },
    );
    expect(await db.select().from(featuredSlots)).toHaveLength(0);
    expect(await logRows()).toHaveLength(0);
  });
});

describe('ending and deleting slots', () => {
  it('ends a running slot now and deletes only one that has not started', async () => {
    const mod = await makeUser(db, 'mod_a', 'mod');
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const running = await createFeaturedSlot(
      db,
      mod,
      { story: story.publicId, startsAt: at(-2), endsAt: at(24) },
      NOW,
    );
    const later = await createFeaturedSlot(
      db,
      mod,
      { story: story.publicId, startsAt: at(48), endsAt: at(72) },
      NOW,
    );
    if (!running.ok || !later.ok) throw new Error('setup failed');

    expect(await deleteFeaturedSlot(db, mod, running.value.id, NOW)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await endFeaturedSlot(db, mod, later.value.id, NOW)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });

    expect(await endFeaturedSlot(db, mod, running.value.id, NOW)).toEqual({
      ok: true,
      value: { ended: true },
    });
    expect(await listActiveFeatured(db, NOW)).toEqual([]);
    expect(await endFeaturedSlot(db, mod, running.value.id, NOW)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });

    expect(await deleteFeaturedSlot(db, mod, later.value.id, NOW)).toEqual({
      ok: true,
      value: { deleted: true },
    });
    expect(await deleteFeaturedSlot(db, mod, later.value.id, NOW)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect((await logRows()).map((r) => r.action)).toEqual([
      'feature_story',
      'feature_story',
      'unfeature_story',
      'unfeature_story',
    ]);

    const list = await listFeaturedSlotsForMods(db, mod, NOW);
    expect(list.ok && list.value.ended.map((s) => [s.endsAt, s.state])).toEqual([
      [NOW.toISOString(), 'ended'],
    ]);
  });
});

describe('listFeaturedSlotsForMods', () => {
  it('groups running, upcoming and recently ended slots', async () => {
    const mod = await makeUser(db, 'mod_a', 'mod');
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const storyId = story.storyId;
    await db.insert(featuredSlots).values([
      { storyId, slot: 'home_picks', startsAt: new Date(at(-1)), endsAt: new Date(at(1)) },
      { storyId, slot: 'home_picks', startsAt: new Date(at(5)), endsAt: new Date(at(6)) },
      { storyId, slot: 'home_picks', startsAt: new Date(at(-48)), endsAt: new Date(at(-24)) },
      // Ended more than 30 days ago: no longer listed.
      { storyId, slot: 'home_picks', startsAt: new Date(at(-800)), endsAt: new Date(at(-750)) },
    ]);
    const list = await listFeaturedSlotsForMods(db, mod, NOW);
    if (!list.ok) throw new Error(list.error);
    expect([list.value.active, list.value.upcoming, list.value.ended].map((g) => g.length)).toEqual(
      [1, 1, 1],
    );
    expect(list.value.active[0]?.story.publicId).toBe(story.publicId);

    const reader = await makeUser(db, 'reader_a');
    expect(await listFeaturedSlotsForMods(db, reader, NOW)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});

describe('listActiveFeatured and the home page', () => {
  it('shows running picks once, newest start first, without hidden, banned or 18+ stories', async () => {
    const author = await makeAuthor(db);
    const other = await makeAuthor(db, 'author_b');
    const a = await makePublishedStory(db, author, 1, 'Truyện A');
    const b = await makePublishedStory(db, author, 1, 'Truyện B');
    const hidden = await makePublishedStory(db, author, 1, 'Truyện Ẩn');
    const banned = await makePublishedStory(db, other, 1, 'Truyện Bị Ban');
    const mature = await makePublishedStory(db, author, 1, 'Truyện 18');
    const expired = await makePublishedStory(db, author, 1, 'Hết Hạn');
    const slot = (storyId: string, from: number, to: number) => ({
      storyId,
      slot: 'home_picks',
      startsAt: new Date(at(from)),
      endsAt: new Date(at(to)),
    });
    await db
      .insert(featuredSlots)
      .values([
        slot(a.storyId, -5, 5),
        slot(a.storyId, -1, 5),
        slot(b.storyId, -3, 5),
        slot(hidden.storyId, -2, 5),
        slot(banned.storyId, -2, 5),
        slot(mature.storyId, -2, 5),
        slot(expired.storyId, -10, -1),
      ]);
    // Changes after the pick: the block follows the story's current state.
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    await db.update(users).set({ status: 'banned' }).where(eq(users.username, 'author_b'));
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, mature.storyId));

    expect((await listActiveFeatured(db, NOW)).map((s) => s.title)).toEqual([
      'Truyện A',
      'Truyện B',
    ]);
    expect((await listActiveFeatured(db, NOW, 1)).map((s) => s.title)).toEqual(['Truyện A']);
    expect((await getHomePage(db, NOW)).picks.map((s) => s.title)).toEqual([
      'Truyện A',
      'Truyện B',
    ]);
  });
});
