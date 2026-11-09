import { stories, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { HOME_GENRE_TILE_COVERS, HOME_GENRE_TILE_SLUGS } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryActor } from '../policies/story';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listHomeGenreTiles } from './home-genre-tiles';
import { getHomePage } from './home-page';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);
const coverOf = (name: string) => `https://cdn.example.com/covers/${name}-600.webp`;

let storyNumber = 0;

/** A public story with a cover in the `tagSlug` genre; `values` overrides any story column. */
async function makeStory(
  author: StoryActor,
  tagSlug: string,
  name: string,
  values: Partial<typeof stories.$inferInsert> = {},
) {
  storyNumber += 1;
  const { storyId } = await makePublishedStory(db, author, 0, `Truyện ${storyNumber}`);
  const [tag] = await db.select().from(tags).where(eq(tags.slug, tagSlug));
  if (!tag) throw new Error(`tag missing: ${tagSlug}`);
  await db
    .update(stories)
    .set({
      mainTagId: tag.id,
      visibility: 'published',
      coverUrl: coverOf(name),
      lastChapterAt: hoursAgo(1),
      ...values,
    })
    .where(eq(stories.id, storyId));
  return storyId;
}

async function coversOf(slug: string) {
  const tiles = await listHomeGenreTiles(db);
  return tiles.find((tile) => tile.slug === slug)?.coverUrls;
}

describe('listHomeGenreTiles', () => {
  it('returns the four genres in order, named from the tags, empty when nothing has a cover', async () => {
    expect(await listHomeGenreTiles(db)).toEqual([
      { slug: 'ngon-tinh', name: 'Ngôn tình', coverUrls: [] },
      { slug: 'tien-hiep', name: 'Tiên hiệp', coverUrls: [] },
      { slug: 'kinh-di', name: 'Kinh dị', coverUrls: [] },
      { slug: 'huyen-huyen', name: 'Huyền huyễn', coverUrls: [] },
    ]);
  });

  it('leaves out a genre whose tag is missing, merged, or not a genre', async () => {
    await db.delete(tags).where(eq(tags.slug, 'ngon-tinh'));
    const [canonical] = await db.select().from(tags).where(eq(tags.slug, 'tien-hiep'));
    await db.update(tags).set({ canonicalId: canonical?.id }).where(eq(tags.slug, 'kinh-di'));
    await db.update(tags).set({ kind: 'theme' }).where(eq(tags.slug, 'huyen-huyen'));

    expect((await listHomeGenreTiles(db)).map((tile) => tile.slug)).toEqual(['tien-hiep']);
  });

  it('keeps the newest covers of each genre, at most three', async () => {
    const author = await makeAuthor(db);
    await makeStory(author, 'kinh-di', 'old', { lastChapterAt: hoursAgo(9) });
    await makeStory(author, 'kinh-di', 'third', { lastChapterAt: hoursAgo(3) });
    await makeStory(author, 'kinh-di', 'first', { lastChapterAt: hoursAgo(1) });
    await makeStory(author, 'kinh-di', 'second', { lastChapterAt: hoursAgo(2) });
    await makeStory(author, 'kinh-di', 'no-chapter', { lastChapterAt: null });
    await makeStory(author, 'ngon-tinh', 'other-genre');

    expect(HOME_GENRE_TILE_COVERS).toBe(3);
    expect(await coversOf('kinh-di')).toEqual([
      coverOf('first'),
      coverOf('second'),
      coverOf('third'),
    ]);
    expect(await coversOf('ngon-tinh')).toEqual([coverOf('other-genre')]);
    expect(await coversOf('huyen-huyen')).toEqual([]);
  });

  it('never uses an 18+ story, even the newest of the genre', async () => {
    const author = await makeAuthor(db);
    await makeStory(author, 'kinh-di', 'mature', { isMature: true, lastChapterAt: NOW });
    await makeStory(author, 'kinh-di', 'public');

    expect(await coversOf('kinh-di')).toEqual([coverOf('public')]);
    const home = await getHomePage(db, NOW);
    expect(JSON.stringify(home.genreTiles)).not.toContain(coverOf('mature'));
  });

  it('ignores hidden and draft stories, stories without a cover and those of banned authors', async () => {
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_author');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));
    await makeStory(banned, 'tien-hiep', 'banned', { lastChapterAt: NOW });
    await makeStory(author, 'tien-hiep', 'hidden', {
      visibility: 'hidden_by_mod',
      lastChapterAt: NOW,
    });
    await makeStory(author, 'tien-hiep', 'draft', { visibility: 'draft', lastChapterAt: NOW });
    await makeStory(author, 'tien-hiep', 'no-cover', { coverUrl: null, lastChapterAt: NOW });
    await makeStory(author, 'tien-hiep', 'public');

    expect(await coversOf('tien-hiep')).toEqual([coverOf('public')]);
  });

  it('counts a story under a merged tag towards its canonical genre', async () => {
    const author = await makeAuthor(db);
    await makeStory(author, 'tu-tien', 'merged');

    expect(await coversOf('tien-hiep')).toEqual([coverOf('merged')]);
  });

  it('takes a story below the home listing threshold', async () => {
    const author = await makeAuthor(db);
    await makeStory(author, 'huyen-huyen', 'short', { chapterCount: 1, wordCount: 300 });

    expect(await coversOf('huyen-huyen')).toEqual([coverOf('short')]);
  });

  it('runs two queries, not one per genre', async () => {
    const author = await makeAuthor(db);
    for (const slug of HOME_GENRE_TILE_SLUGS) await makeStory(author, slug, slug);
    const spy = vi.spyOn(pool, 'query');

    const tiles = await listHomeGenreTiles(db);

    expect(tiles.every((tile) => tile.coverUrls.length === 1)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('getHomePage', () => {
  it('carries the genre tiles instead of the full genre list', async () => {
    const home = await getHomePage(db, NOW);
    expect(home.genreTiles.map((tile) => tile.slug)).toEqual([...HOME_GENRE_TILE_SLUGS]);
    expect(home).not.toHaveProperty('genres');
  });
});
