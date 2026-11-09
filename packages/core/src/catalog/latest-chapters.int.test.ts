import { chapters, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { latestReadableChapters, withLatestChapters } from './latest-chapters';
import { selectStoryCards } from './story-card';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setChapter(
  storyId: string,
  number: number,
  values: Partial<typeof chapters.$inferInsert>,
) {
  await db
    .update(chapters)
    .set(values)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
}

const at = (iso: string) => new Date(iso);

describe('latestReadableChapters', () => {
  it('is empty for no stories', async () => {
    expect(await latestReadableChapters(db, [])).toEqual(new Map());
  });

  it('takes the readable chapter published last, never a draft, scheduled, hidden or deleted one', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 5);
    for (const number of [1, 2, 3, 4, 5]) {
      await setChapter(s.storyId, number, {
        publishedAt: at(`2026-10-0${number}T00:00:00Z`),
        title: `Chương thứ ${number}`,
      });
    }
    // Later chapters that cannot be read: a draft, a scheduled one, hidden and deleted ones.
    await addChapter(db, author, s.publicId, true);
    await setChapter(s.storyId, 5, { status: 'hidden_by_mod' });
    await setChapter(s.storyId, 4, { deletedAt: at('2026-10-06T00:00:00Z') });
    await addChapter(db, author, s.publicId, true);
    await setChapter(s.storyId, 7, {
      status: 'scheduled',
      scheduledAt: at('2026-12-01T00:00:00Z'),
    });

    expect((await latestReadableChapters(db, [s.storyId])).get(s.storyId)).toEqual({
      number: 3,
      title: 'Chương thứ 3',
    });
  });

  it('orders by publication time: a lower number published later wins', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 3);
    await setChapter(s.storyId, 1, { publishedAt: at('2026-10-01T00:00:00Z') });
    await setChapter(s.storyId, 2, { publishedAt: at('2026-10-05T00:00:00Z') });
    await setChapter(s.storyId, 3, { publishedAt: at('2026-10-03T00:00:00Z') });
    expect((await latestReadableChapters(db, [s.storyId])).get(s.storyId)?.number).toBe(2);
  });

  it('reports a missing or blank title as null', async () => {
    const author = await makeAuthor(db);
    const untitled = await makePublishedStory(db, author, 1, 'Không Tên');
    const blank = await makePublishedStory(db, author, 1, 'Tên Trắng');
    await setChapter(blank.storyId, 1, { title: '   ' });
    const latest = await latestReadableChapters(db, [untitled.storyId, blank.storyId]);
    expect(latest.get(untitled.storyId)).toEqual({ number: 1, title: null });
    expect(latest.get(blank.storyId)).toEqual({ number: 1, title: null });
  });

  it('leaves out stories that cannot be read: hidden, or by a banned author', async () => {
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_author');
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    const ofBanned = await makePublishedStory(db, banned, 1, 'Của Người Bị Cấm');
    const fine = await makePublishedStory(db, author, 1, 'Bình Thường');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));
    const latest = await latestReadableChapters(db, [
      hidden.storyId,
      ofBanned.storyId,
      fine.storyId,
    ]);
    expect([...latest.keys()]).toEqual([fine.storyId]);
  });
});

describe('withLatestChapters', () => {
  it('maps rows to cards with their latest chapter, null when none is readable', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 2, 'Có Chương');
    const gone = await makePublishedStory(db, author, 1, 'Hết Chương');
    await setChapter(gone.storyId, 1, { deletedAt: at('2026-10-06T00:00:00Z') });
    const rows = await selectStoryCards(db).orderBy(stories.title);
    const cards = await withLatestChapters(db, rows);
    expect(cards.map((c) => [c.title, c.latestChapter])).toEqual([
      ['Có Chương', { number: 2, title: null }],
      ['Hết Chương', null],
    ]);
    expect(cards[0]).not.toHaveProperty('id');
    expect(s.publicId).toBe(cards[0]?.publicId);
  });
});
