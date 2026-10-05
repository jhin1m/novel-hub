import { chapters, readingProgress, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findReadableChapterRef } from '../reader/readable-chapter-ref';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { saveReadingProgress } from './progress';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

describe('findReadableChapterRef', () => {
  it('finds published chapters only, through canReadChapter', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 2);
    await addChapter(db, author, story.publicId, true);

    const ref = await findReadableChapterRef(db, story.publicId, 1);
    expect(ref?.storyId).toBe(story.storyId);
    expect(await findReadableChapterRef(db, story.publicId, 3)).toBeNull();
    expect(await findReadableChapterRef(db, story.publicId, 9)).toBeNull();
    expect(await findReadableChapterRef(db, 'not-an-id', 1)).toBeNull();

    await db
      .update(chapters)
      .set({ status: 'hidden_by_mod' })
      .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, 2)));
    expect(await findReadableChapterRef(db, story.publicId, 2)).toBeNull();

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await findReadableChapterRef(db, story.publicId, 1)).toBeNull();
  });
});

describe('saveReadingProgress', () => {
  it('keeps one row per reader and story, moved to the latest chapter', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 2);
    const reader = await makeAuthor(db, 'reader');

    expect(
      await saveReadingProgress(db, reader.id, {
        publicId: story.publicId,
        number: 1,
        scrollPct: 40,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await saveReadingProgress(db, reader.id, {
        publicId: story.publicId,
        number: 2,
        scrollPct: 12.5,
      }),
    ).toEqual({ ok: true, value: undefined });

    const rows = await db.select().from(readingProgress);
    expect(rows).toHaveLength(1);
    const [chapter2] = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, 2)));
    expect(rows[0]).toMatchObject({ chapterId: chapter2?.id, scrollPct: 12.5 });
  });

  it('answers NOT_FOUND for a chapter that cannot be read, and writes nothing', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(
      await saveReadingProgress(db, author.id, {
        publicId: story.publicId,
        number: 1,
        scrollPct: 5,
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await db.select().from(readingProgress)).toEqual([]);
  });
});
