import { chapters, readingProgress, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getContinueReading } from './continue';
import { listHistory, removeFromHistory } from './history';
import { saveReadingProgress } from './progress';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** Sets when `userId` last read the story, bypassing the ORM's automatic `updated_at`. */
async function readAt(userId: string, storyId: string, at: string) {
  await db.execute(
    sql`update reading_progress set updated_at = ${at}::timestamptz where user_id = ${userId} and story_id = ${storyId}`,
  );
}

describe('getContinueReading', () => {
  it('returns the saved chapter and position', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 2);
    const reader = await makeAuthor(db, 'reader');
    expect(await getContinueReading(db, reader.id, story.publicId)).toBeNull();

    await saveReadingProgress(db, reader.id, {
      publicId: story.publicId,
      number: 2,
      scrollPct: 48,
    });
    expect(await getContinueReading(db, reader.id, story.publicId)).toMatchObject({
      chapterNumber: 2,
      chapterTitle: null,
      scrollPct: 48,
    });
    expect(await getContinueReading(db, author.id, story.publicId)).toBeNull();
  });

  it('a chapter that cannot be read any more falls back, from the top of the chapter', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 3);
    const reader = await makeAuthor(db, 'reader');
    await saveReadingProgress(db, reader.id, {
      publicId: story.publicId,
      number: 2,
      scrollPct: 70,
    });
    const setChapter = (number: number, values: Partial<typeof chapters.$inferInsert>) =>
      db
        .update(chapters)
        .set(values)
        .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, number)));

    // Soft-deleted → the closest readable chapter before it.
    await setChapter(2, { deletedAt: new Date() });
    expect(await getContinueReading(db, reader.id, story.publicId)).toMatchObject({
      chapterNumber: 1,
      scrollPct: 0,
    });
    // Nothing readable before it → the first readable chapter after it.
    await setChapter(1, { status: 'hidden_by_mod' });
    expect(await getContinueReading(db, reader.id, story.publicId)).toMatchObject({
      chapterNumber: 3,
      scrollPct: 0,
    });
    // No readable chapter at all.
    await setChapter(3, { deletedAt: new Date() });
    expect(await getContinueReading(db, reader.id, story.publicId)).toBeNull();
  });

  it('a story that is no longer public → null, row kept', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeAuthor(db, 'reader');
    await saveReadingProgress(db, reader.id, { publicId: story.publicId, number: 1, scrollPct: 5 });
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await getContinueReading(db, reader.id, story.publicId)).toBeNull();
    expect(await db.select().from(readingProgress)).toHaveLength(1);
  });
});

describe('listHistory', () => {
  it('most recently read first; hidden stories left out until they come back', async () => {
    const author = await makeAuthor(db);
    const reader = await makeAuthor(db, 'reader');
    const titles = ['Một', 'Hai', 'Ba'];
    const made = [];
    for (const [i, title] of titles.entries()) {
      const story = await makePublishedStory(db, author, 1, title);
      await saveReadingProgress(db, reader.id, {
        publicId: story.publicId,
        number: 1,
        scrollPct: 10,
      });
      await readAt(reader.id, story.storyId, `2026-10-0${i + 1}T00:00:00Z`);
      made.push(story);
    }

    const all = await listHistory(db, reader.id);
    expect(all.items.map((i) => i.story.title)).toEqual(['Ba', 'Hai', 'Một']);
    expect(all.items[0]).toMatchObject({ chapterNumber: 1, scrollPct: 10 });
    expect(all.nextCursor).toBeNull();

    const [, hidden] = made;
    if (!hidden) throw new Error('missing story');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, hidden.storyId));
    expect((await listHistory(db, reader.id)).items.map((i) => i.story.title)).toEqual([
      'Ba',
      'Một',
    ]);
    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, hidden.storyId));
    expect((await listHistory(db, reader.id)).items).toHaveLength(3);

    await removeFromHistory(db, reader.id, hidden.publicId);
    await removeFromHistory(db, reader.id, hidden.publicId);
    expect((await listHistory(db, reader.id)).items.map((i) => i.story.title)).toEqual([
      'Ba',
      'Một',
    ]);
  });

  it('keyset pages cover every entry exactly once, ties and sub-millisecond gaps included', async () => {
    const author = await makeAuthor(db);
    const reader = await makeAuthor(db, 'reader');
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      const story = await makePublishedStory(db, author, 1, `Truyện ${i}`);
      await saveReadingProgress(db, reader.id, {
        publicId: story.publicId,
        number: 1,
        scrollPct: 1,
      });
      // 10 entries share one instant; two are only microseconds apart from it.
      const at =
        i < 10
          ? '2026-10-01T00:00:00.123456Z'
          : i === 10
            ? '2026-10-01T00:00:00.123457Z'
            : i === 11
              ? '2026-10-01T00:00:00.123455Z'
              : `2026-09-${String((i % 28) + 1).padStart(2, '0')}T0${i % 10}:00:00Z`;
      await readAt(reader.id, story.storyId, at);
      ids.push(story.publicId);
    }

    /** Walks every page of `limit` entries; returns the public ids in order and the page count. */
    const walk = async (limit?: number) => {
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await listHistory(db, reader.id, cursor, limit);
        seen.push(...page.items.map((i) => i.story.publicId));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor && pages < 20);
      return { seen, pages };
    };

    const byDefault = await walk();
    expect(byDefault.pages).toBe(3);
    // Small pages so ties and microsecond gaps fall on page boundaries.
    const small = await walk(4);
    expect(small.pages).toBe(12);
    for (const { seen } of [byDefault, small]) {
      expect(seen).toHaveLength(45);
      expect(new Set(seen)).toEqual(new Set(ids));
    }
    expect(small.seen).toEqual(byDefault.seen);
  });
});
