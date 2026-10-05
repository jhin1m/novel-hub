import { chapters, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteChapter } from '../publishing/delete-chapter';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { urlsFor } from './urls-for';

const APP = 'https://truyen.example';
const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const storyUrl = (slug: string, publicId: string) => `${APP}/stories/${slug}-${publicId}`;
const chapterUrl = (slug: string, publicId: string, n: number) =>
  `${storyUrl(slug, publicId)}/chapter-${n}`;
/** List pages showing a story by `author` tagged only with its main tag `tien-hiep`. */
const listUrls = [`${APP}/`, `${APP}/authors/author`, `${APP}/tags/tien-hiep`];

describe('urlsFor', () => {
  it('a chapter change purges the chapter, its readable neighbours, the story page and its lists', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 5);
    // Chapter 4 hidden: the next readable chapter after 3 is 5.
    await db
      .update(chapters)
      .set({ status: 'hidden_by_mod' })
      .where(and(eq(chapters.storyId, s.storyId), eq(chapters.number, 4)));
    const [ch3] = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.storyId, s.storyId), eq(chapters.number, 3)));

    const urls = await urlsFor(
      db,
      {
        entity: 'chapter',
        action: 'updated',
        storyId: s.storyId,
        chapterId: ch3?.id ?? '',
        chapterNumber: 3,
      },
      APP,
    );
    expect(urls.sort()).toEqual(
      [
        storyUrl(s.slug, s.publicId),
        chapterUrl(s.slug, s.publicId, 2),
        chapterUrl(s.slug, s.publicId, 3),
        chapterUrl(s.slug, s.publicId, 5),
        ...listUrls,
      ].sort(),
    );
  });

  it('a hidden story purges its page and every chapter ever published, hidden or deleted', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 3);
    const deleted = await deleteChapter(db, author, s.publicId, 3);
    expect(deleted.ok).toBe(true);
    await db
      .update(chapters)
      .set({ status: 'hidden_by_mod' })
      .where(and(eq(chapters.storyId, s.storyId), eq(chapters.number, 2)));
    await db.update(stories).set({ visibility: 'hidden_by_mod' }).where(eq(stories.id, s.storyId));

    const urls = await urlsFor(db, { entity: 'story', action: 'hidden', storyId: s.storyId }, APP);
    expect(urls.sort()).toEqual(
      [
        storyUrl(s.slug, s.publicId),
        chapterUrl(s.slug, s.publicId, 1),
        chapterUrl(s.slug, s.publicId, 2),
        chapterUrl(s.slug, s.publicId, 3),
        ...listUrls,
      ].sort(),
    );
  });

  it('a renamed story purges every page under the old and the new slug', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 2);
    const urls = await urlsFor(
      db,
      { entity: 'story', action: 'updated', storyId: s.storyId, previousSlug: 'ten-cu' },
      APP,
    );
    expect(urls).toHaveLength(6 + listUrls.length);
    expect(urls).toContain(storyUrl('ten-cu', s.publicId));
    expect(urls).toContain(chapterUrl('ten-cu', s.publicId, 2));
    expect(urls).toContain(chapterUrl(s.slug, s.publicId, 2));
  });

  it('a banned author purges the author page, every page of every story and their lists', async () => {
    const author = await makeAuthor(db);
    const a = await makePublishedStory(db, author, 2, 'Truyện Một');
    const b = await makePublishedStory(db, author, 1, 'Truyện Hai');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));

    for (const action of ['banned', 'updated'] as const) {
      const urls = await urlsFor(db, { entity: 'user', action, userId: author.id }, APP);
      expect(urls.sort()).toEqual(
        [
          `${APP}/authors/author`,
          storyUrl(a.slug, a.publicId),
          chapterUrl(a.slug, a.publicId, 1),
          chapterUrl(a.slug, a.publicId, 2),
          storyUrl(b.slug, b.publicId),
          chapterUrl(b.slug, b.publicId, 1),
          `${APP}/`,
          `${APP}/tags/tien-hiep`,
        ].sort(),
      );
    }
  });

  it('an unknown story or user yields no URL', async () => {
    const id = (await db.execute<{ id: string }>(sql`select uuidv7() as id`)).rows[0]?.id ?? '';
    expect(await urlsFor(db, { entity: 'story', action: 'updated', storyId: id }, APP)).toEqual([]);
    expect(await urlsFor(db, { entity: 'user', action: 'banned', userId: id }, APP)).toEqual([]);
  });
});
