import { chapters, contests, stories, storyTags, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { countSitemap, listSitemapChapters, listSitemapPages, listSitemapStories } from './sitemap';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setStory(storyId: string, values: Partial<typeof stories.$inferInsert>) {
  await db.update(stories).set(values).where(eq(stories.id, storyId));
}

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

async function setUserStatus(userId: string, status: 'active' | 'banned') {
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

async function linkTag(storyId: string, slug: string) {
  const [tag] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug));
  if (!tag) throw new Error(`tag ${slug} missing`);
  await db.insert(storyTags).values({ storyId, tagId: tag.id });
}

const paths = (entries: { path: string }[] | null) => entries?.map((e) => e.path) ?? null;

describe('listSitemapStories', () => {
  it('lists published stories only: no draft, hidden, 18+ or banned author', async () => {
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_author');
    const ok = await makePublishedStory(db, author, 1, 'Được Liệt Kê');
    // No chapter published yet: still a draft.
    await makePublishedStory(db, author, 0, 'Chưa Có Chương');
    const draft = await makePublishedStory(db, author, 1, 'Bản Nháp');
    await setStory(draft.storyId, { visibility: 'draft' });
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await setStory(hidden.storyId, { visibility: 'hidden_by_mod' });
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám');
    await setStory(mature.storyId, { isMature: true });
    await makePublishedStory(db, banned, 1, 'Của Người Bị Khoá');
    await setUserStatus(banned.id, 'banned');

    const listed = await listSitemapStories(db, 1);
    expect(paths(listed)?.sort()).toEqual([canonicalPath({ kind: 'story', ...ok })]);
  });

  it('dates a story by its latest edit or chapter, whichever is later', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    const later = new Date('2030-01-01T00:00:00Z');
    await setStory(story.storyId, { lastChapterAt: later });
    const [entry] = (await listSitemapStories(db, 1)) ?? [];
    expect(entry?.lastmod).toEqual(later);
  });

  it('pages in a stable order and rejects pages that do not exist', async () => {
    const author = await makeAuthor(db);
    for (const title of ['Một', 'Hai', 'Ba']) await makePublishedStory(db, author, 1, title);

    const all = paths(await listSitemapStories(db, 1));
    const pageOne = paths(await listSitemapStories(db, 1, { pageSize: 2 }));
    const pageTwo = paths(await listSitemapStories(db, 2, { pageSize: 2 }));
    expect([...(pageOne ?? []), ...(pageTwo ?? [])]).toEqual(all);
    expect(pageTwo).toHaveLength(1);
    expect(await listSitemapStories(db, 3, { pageSize: 2 })).toBeNull();
    expect(await listSitemapStories(db, 0)).toBeNull();
    expect(await listSitemapStories(db, 1.5)).toBeNull();
    expect(await countSitemap(db, { pageSize: 2 })).toEqual({ storyPages: 2, chapterPages: 2 });
  });

  it('keeps an empty first page', async () => {
    expect(await listSitemapStories(db, 1)).toEqual([]);
    expect(await listSitemapChapters(db, 1)).toEqual([]);
    expect(await listSitemapStories(db, 2)).toBeNull();
    expect(await countSitemap(db)).toEqual({ storyPages: 1, chapterPages: 1 });
  });
});

describe('listSitemapChapters', () => {
  it('lists readable chapters of sitemap stories only', async () => {
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_author');
    const story = await makePublishedStory(db, author, 5);
    await addChapter(db, author, story.publicId, true); // 6: draft
    await setChapter(story.storyId, 2, { status: 'scheduled' });
    await setChapter(story.storyId, 3, { status: 'hidden_by_mod' });
    await setChapter(story.storyId, 4, { deletedAt: new Date() });
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await setStory(hidden.storyId, { visibility: 'hidden_by_mod' });
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám');
    await setStory(mature.storyId, { isMature: true });
    await makePublishedStory(db, banned, 1, 'Của Người Bị Khoá');
    await setUserStatus(banned.id, 'banned');

    const listed = await listSitemapChapters(db, 1);
    expect(paths(listed)?.sort()).toEqual(
      [1, 5].map((number) => canonicalPath({ kind: 'chapter', ...story, number })).sort(),
    );
    expect(listed?.every((e) => e.lastmod instanceof Date)).toBe(true);
    expect(await countSitemap(db, { pageSize: 1 })).toEqual({ storyPages: 1, chapterPages: 2 });
    expect(await listSitemapChapters(db, 3, { pageSize: 1 })).toBeNull();
  });
});

describe('listSitemapPages', () => {
  it('lists home, static, ranking and contest pages, canonical tags and authors with a listed story', async () => {
    const author = await makeAuthor(db);
    const matureOnly = await makeAuthor(db, 'mature_only');
    const banned = await makeAuthor(db, 'banned_author');
    const story = await makePublishedStory(db, author, 1);
    // A tag merged into `tien-hiep` (seed data): listed as its canonical tag.
    await linkTag(story.storyId, 'tu-tien');
    const adult = await makePublishedStory(db, matureOnly, 1, 'Mười Tám');
    await setStory(adult.storyId, { isMature: true });
    await db.delete(storyTags).where(eq(storyTags.storyId, adult.storyId));
    await linkTag(adult.storyId, 'kinh-di');
    const bannedStory = await makePublishedStory(db, banned, 1, 'Của Người Bị Khoá');
    await db.delete(storyTags).where(eq(storyTags.storyId, bannedStory.storyId));
    await linkTag(bannedStory.storyId, 'do-thi');
    await setUserStatus(banned.id, 'banned');
    // A published story without chapters has no place on tag or author lists.
    const empty = await makeAuthor(db, 'no_chapters');
    const emptied = await makePublishedStory(db, empty, 1, 'Hết Chương');
    await setStory(emptied.storyId, { lastChapterAt: null });
    // Every contest page is listed, newest start first.
    await db.insert(contests).values([
      {
        slug: 'mua-thu',
        title: 'Mùa thu',
        description: 'Chủ đề',
        startsAt: new Date('2026-09-01T00:00:00Z'),
        endsAt: new Date('2026-10-01T00:00:00Z'),
        createdBy: author.id,
      },
      {
        slug: 'mua-dong',
        title: 'Mùa đông',
        description: 'Chủ đề',
        startsAt: new Date('2026-12-01T00:00:00Z'),
        endsAt: new Date('2027-01-01T00:00:00Z'),
        createdBy: author.id,
      },
    ]);

    expect(paths(await listSitemapPages(db))).toEqual([
      '/',
      '/terms',
      '/content-policy',
      '/rankings/day',
      '/rankings/week',
      '/rankings/month',
      '/rankings/rising',
      '/contests',
      '/contests/mua-dong',
      '/contests/mua-thu',
      '/tags/tien-hiep',
      '/authors/author',
    ]);

    await setUserStatus(banned.id, 'active');
    expect(paths(await listSitemapPages(db))).toEqual([
      '/',
      '/terms',
      '/content-policy',
      '/rankings/day',
      '/rankings/week',
      '/rankings/month',
      '/rankings/rising',
      '/contests',
      '/contests/mua-dong',
      '/contests/mua-thu',
      '/tags/do-thi',
      '/tags/tien-hiep',
      '/authors/author',
      '/authors/banned_author',
    ]);
  });
});
