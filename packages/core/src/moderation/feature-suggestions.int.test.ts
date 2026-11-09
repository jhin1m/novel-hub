import { featuredSlots, storyDailyStats, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOME_PICKS } from '../featured/featured-slots';
import { computeRankings } from '../rankings/compute-rankings';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listFeatureSuggestions } from './feature-suggestions';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** Noon on 7 October 2026 in Vietnam: "last month" is September 2026. */
const NOW = new Date('2026-10-07T05:00:00Z');
const HOUR_MS = 3_600_000;

async function readers(storyId: string, date: string, uniqueReaders: number) {
  await db.insert(storyDailyStats).values({ storyId, date, uniqueReaders });
}

async function slot(storyId: string, startsAt: Date, endsAt: Date) {
  await db.insert(featuredSlots).values({ storyId, slot: HOME_PICKS, startsAt, endsAt });
}

async function suggestions(actor: Parameters<typeof listFeatureSuggestions>[1]) {
  const result = await listFeatureSuggestions(db, actor, NOW);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('listFeatureSuggestions', () => {
  it('ranks last calendar month (Vietnam time) and leaves out what cannot or need not be featured', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const author = await makeAuthor(db, 'tac_gia');
    const top = await makePublishedStory(db, author, 1, 'Đứng đầu');
    const second = await makePublishedStory(db, author, 1, 'Thứ hai');
    const lateOnly = await makePublishedStory(db, author, 1, 'Chỉ có tháng Mười');
    const mature = await makePublishedStory(db, author, 1, 'Truyện 18', { isMature: true });
    const running = await makePublishedStory(db, author, 1, 'Đang nổi bật');
    const upcoming = await makePublishedStory(db, author, 1, 'Sắp nổi bật');
    const ended = await makePublishedStory(db, author, 1, 'Đã hết nổi bật');
    const bannedAuthor = await makeAuthor(db, 'bi_cam');
    const banned = await makePublishedStory(db, bannedAuthor, 1, 'Tác giả bị cấm');
    const own = await makePublishedStory(db, mod, 1, 'Của mod');

    // 30 September and 1 October sit on either side of the month boundary.
    await readers(top.storyId, '2026-09-30', 300);
    await readers(top.storyId, '2026-10-01', 5);
    await readers(second.storyId, '2026-09-01', 100);
    await readers(second.storyId, '2026-08-31', 999);
    await readers(lateOnly.storyId, '2026-10-01', 900);
    for (const s of [mature, running, upcoming, ended, banned, own]) {
      await readers(s.storyId, '2026-09-15', 500);
    }
    await slot(
      running.storyId,
      new Date(NOW.getTime() - HOUR_MS),
      new Date(NOW.getTime() + HOUR_MS),
    );
    await slot(
      upcoming.storyId,
      new Date(NOW.getTime() + HOUR_MS),
      new Date(NOW.getTime() + 2 * HOUR_MS),
    );
    await slot(
      ended.storyId,
      new Date(NOW.getTime() - 2 * HOUR_MS),
      new Date(NOW.getTime() - HOUR_MS),
    );
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, bannedAuthor.id));

    const result = await suggestions(mod);
    expect(result.month).toBe('9/2026');
    expect(result.items.map((i) => [i.story.title, i.readers])).toEqual([
      ['Đã hết nổi bật', 500],
      ['Đứng đầu', 300],
      ['Thứ hai', 100],
    ]);
    expect(result.items[0]?.story).toMatchObject({ publicId: ended.publicId, isMature: false });
  });

  it('keeps the ten best', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const author = await makeAuthor(db, 'tac_gia');
    for (let i = 1; i <= 11; i++) {
      const story = await makePublishedStory(db, author, 1, `Truyện số ${i}`);
      await readers(story.storyId, '2026-09-10', i * 10);
    }
    const { items } = await suggestions(mod);
    expect(items).toHaveLength(10);
    expect(items[0]).toMatchObject({ story: { title: 'Truyện số 11' }, readers: 110 });
    expect(items.map((i) => i.story.title)).not.toContain('Truyện số 1');
  });

  it('is empty without data and refuses a reader', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const reader = await makeUser(db, 'doc_gia');
    expect(await suggestions(mod)).toEqual({ month: '9/2026', items: [] });
    expect(await listFeatureSuggestions(db, reader, NOW)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('leaves computeRankings answering ids as before', async () => {
    const author = await makeAuthor(db, 'tac_gia');
    const a = await makePublishedStory(db, author, 1, 'A');
    const b = await makePublishedStory(db, author, 1, 'B');
    await readers(a.storyId, '2026-10-06', 3);
    await readers(b.storyId, '2026-10-07', 7);
    expect(await computeRankings(db, 'week', '2026-10-07', { includeMature: false })).toEqual([
      b.storyId,
      a.storyId,
    ]);
  });
});
