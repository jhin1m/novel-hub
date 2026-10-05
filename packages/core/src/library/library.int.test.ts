import { chapters, libraryItems, readingProgress, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { saveReadingProgress } from '../reading/progress';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getShelf, listLibrary, removeFromLibrary, setShelf } from './library';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

describe('setShelf', () => {
  it('moving to another shelf keeps one row and the date it was first added', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeAuthor(db, 'reader');

    expect(await setShelf(db, reader.id, story.publicId, 'reading')).toEqual({
      ok: true,
      value: { shelf: 'reading' },
    });
    const [first] = await db.select().from(libraryItems);
    expect(await setShelf(db, reader.id, story.publicId, 'done')).toEqual({
      ok: true,
      value: { shelf: 'done' },
    });
    const rows = await db.select().from(libraryItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shelf).toBe('done');
    expect(rows[0]?.addedAt).toEqual(first?.addedAt);
    expect(await getShelf(db, reader.id, story.publicId)).toBe('done');
    expect(await getShelf(db, author.id, story.publicId)).toBeNull();
  });

  it('a draft, hidden or unknown story → NOT_FOUND, nothing written', async () => {
    const author = await makeAuthor(db);
    const draft = await makePublishedStory(db, author, 0, 'Bản Nháp');
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    const reader = await makeAuthor(db, 'reader');

    for (const publicId of [draft.publicId, hidden.publicId, 'k7m2xq9p']) {
      expect(await setShelf(db, reader.id, publicId, 'plan')).toEqual({
        ok: false,
        error: 'NOT_FOUND',
      });
    }
    expect(await db.select().from(libraryItems)).toEqual([]);
  });
});

describe('removeFromLibrary', () => {
  it('removes only the reader’s own row and is idempotent', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeAuthor(db, 'reader');
    await setShelf(db, reader.id, story.publicId, 'plan');
    await setShelf(db, author.id, story.publicId, 'plan');

    await removeFromLibrary(db, reader.id, story.publicId);
    await removeFromLibrary(db, reader.id, story.publicId);
    expect(await getShelf(db, reader.id, story.publicId)).toBeNull();
    expect(await getShelf(db, author.id, story.publicId)).toBe('plan');
  });
});

describe('listLibrary', () => {
  it('lists one shelf, newest first, with the chapter to continue at', async () => {
    const author = await makeAuthor(db);
    const older = await makePublishedStory(db, author, 2, 'Truyện Cũ');
    const newer = await makePublishedStory(db, author, 1, 'Truyện Mới');
    const other = await makePublishedStory(db, author, 1, 'Kệ Khác');
    const reader = await makeAuthor(db, 'reader');
    await setShelf(db, reader.id, older.publicId, 'reading');
    await setShelf(db, reader.id, newer.publicId, 'reading');
    await setShelf(db, reader.id, other.publicId, 'dropped');
    await db
      .update(libraryItems)
      .set({ addedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(libraryItems.storyId, older.storyId));
    await saveReadingProgress(db, reader.id, {
      publicId: older.publicId,
      number: 2,
      scrollPct: 35,
    });

    const result = await listLibrary(db, reader.id, { shelf: 'reading', page: 1 });
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.items.map((i) => i.story.title)).toEqual(['Truyện Mới', 'Truyện Cũ']);
    expect(result.items[0]?.progress).toBeNull();
    expect(result.items[1]).toMatchObject({
      shelf: 'reading',
      addedAt: '2026-01-01T00:00:00.000Z',
      progress: { chapterNumber: 2, scrollPct: 35 },
    });
    expect(JSON.stringify(result)).not.toContain(older.storyId);
  });

  it('leaves out hidden stories and banned authors without deleting rows; they come back', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeAuthor(db, 'reader');
    await setShelf(db, reader.id, story.publicId, 'reading');

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect((await listLibrary(db, reader.id, { shelf: 'reading', page: 1 })).items).toEqual([]);
    expect(await db.select().from(libraryItems)).toHaveLength(1);

    await db.update(users).set({ status: 'active' }).where(eq(users.id, author.id));
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect((await listLibrary(db, reader.id, { shelf: 'reading', page: 1 })).items).toEqual([]);

    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.storyId));
    expect((await listLibrary(db, reader.id, { shelf: 'reading', page: 1 })).items).toHaveLength(1);
  });

  it('progress on a deleted chapter falls back to the closest readable one, from the top', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 3);
    const reader = await makeAuthor(db, 'reader');
    await setShelf(db, reader.id, story.publicId, 'reading');
    await saveReadingProgress(db, reader.id, {
      publicId: story.publicId,
      number: 3,
      scrollPct: 60,
    });
    await db
      .update(chapters)
      .set({ deletedAt: new Date() })
      .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, 3)));

    const [item] = (await listLibrary(db, reader.id, { shelf: 'reading', page: 1 })).items;
    expect(item?.progress).toEqual({ chapterNumber: 2, scrollPct: 0 });
    expect(await db.select().from(readingProgress)).toHaveLength(1);
  });

  it('a page past the end shows the last page', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeAuthor(db, 'reader');
    await setShelf(db, reader.id, story.publicId, 'plan');
    const result = await listLibrary(db, reader.id, { shelf: 'plan', page: 9 });
    expect(result).toMatchObject({ page: 1, totalPages: 1 });
    expect(result.items).toHaveLength(1);
  });
});
