import {
  chapters,
  contentEvents,
  contestEntries,
  contests,
  stories,
  storyTags,
  tags,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { HOME_DEDUPE_SLACK, NOTABLE_LIMIT, STORY_VISIBILITIES } from '@novel-hub/shared';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import type { StoryActor } from '../policies/story';
import { contentChangeSchema } from '../content/hooks';
import { createStory } from '../stories/create-story';
import { updateStory } from '../stories/update-story';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getAuthorPage } from './author-page';
import { listNotable, listRecentlyUpdated } from './home';
import { getHomePage } from './home-page';
import { listStories } from './lists';
import { publicStoryWhere, selectStoryCards } from './story-card';
import { getStoryPage } from './story-page';
import { getTagPage } from './tag-page';
import { catalogUrls } from './urls';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

async function setStory(storyId: string, values: Partial<typeof stories.$inferInsert>) {
  await db.update(stories).set(values).where(eq(stories.id, storyId));
}

/** Counters of a story just past the home listing threshold (3 chapters, 5,000 words). */
const LISTED = { chapterCount: 3, wordCount: 5_000 };

async function tagId(slug: string): Promise<string> {
  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug));
  if (!row) throw new Error(`tag ${slug} missing`);
  return row.id;
}

/** Links a story to a tag directly, as if the tag had been merged after the story was saved. */
async function linkTag(storyId: string, slug: string) {
  await db.insert(storyTags).values({ storyId, tagId: await tagId(slug) });
}

async function draftStory(author: StoryActor, title: string) {
  const created = await createStory(db, author, {
    title,
    synopsis: '',
    mainTag: 'do-thi',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!created.ok) throw new Error(created.error);
  const [row] = await db.select().from(stories).where(eq(stories.publicId, created.value.publicId));
  if (!row) throw new Error('story missing');
  return row;
}

describe('publicStoryWhere', () => {
  it('agrees with isStoryPubliclyVisible on every visibility × author status × 18+ combination', async () => {
    const expected = new Set<string>();
    const expectedWithoutMature = new Set<string>();
    for (const authorStatus of ['active', 'muted', 'banned'] as const) {
      const author = await makeAuthor(db, `author_${authorStatus}`);
      for (const visibility of STORY_VISIBILITIES) {
        for (const isMature of [false, true]) {
          const row = await draftStory(author, `${authorStatus} ${visibility} ${isMature}`);
          await setStory(row.id, { visibility, isMature });
          if (isStoryPubliclyVisible({ visibility, authorStatus })) {
            expected.add(row.id);
            if (!isMature) expectedWithoutMature.add(row.id);
          }
        }
      }
      await db.update(users).set({ status: authorStatus }).where(eq(users.id, author.id));
    }

    const listed = async (includeMature: boolean) =>
      new Set(
        (await selectStoryCards(db).where(publicStoryWhere({ includeMature }))).map((r) => r.id),
      );
    expect(await listed(true)).toEqual(expected);
    expect(await listed(false)).toEqual(expectedWithoutMature);
    expect(expected.size).toBe(4);
  });
});

describe('listRecentlyUpdated', () => {
  it('lists public stories with chapters, most recently updated first, 18+ only on request', async () => {
    const author = await makeAuthor(db);
    const older = await makePublishedStory(db, author, 1, 'Cũ Hơn');
    const newer = await makePublishedStory(db, author, 1, 'Mới Hơn');
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám');
    const hidden = await makePublishedStory(db, author, 1, 'Bị Ẩn');
    await draftStory(author, 'Bản Nháp');
    // Published but every chapter deleted: no `last_chapter_at`.
    const empty = await makePublishedStory(db, author, 1, 'Không Chương');
    await setStory(older.storyId, { ...LISTED, lastChapterAt: daysAgo(3) });
    await setStory(newer.storyId, { ...LISTED, lastChapterAt: daysAgo(1) });
    await setStory(mature.storyId, { ...LISTED, lastChapterAt: daysAgo(2), isMature: true });
    await setStory(hidden.storyId, { ...LISTED, visibility: 'hidden_by_mod' });
    await setStory(empty.storyId, { ...LISTED, lastChapterAt: null });

    const guest = await listRecentlyUpdated(db, { includeMature: false });
    expect(guest.items.map((s) => s.title)).toEqual(['Mới Hơn', 'Cũ Hơn']);
    expect(guest).toMatchObject({ page: 1, totalPages: 1 });
    const adult = await listRecentlyUpdated(db, { includeMature: true });
    expect(adult.items.map((s) => s.title)).toEqual(['Mới Hơn', 'Mười Tám', 'Cũ Hơn']);

    const second = await listRecentlyUpdated(db, { includeMature: true, page: 2, pageSize: 2 });
    expect(second.items.map((s) => s.title)).toEqual(['Cũ Hơn']);
    expect(second.totalPages).toBe(2);
  });

  it('hides every story of a banned author', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await setStory(s.storyId, LISTED);
    expect((await listRecentlyUpdated(db, { includeMature: true })).items).toHaveLength(1);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect((await listRecentlyUpdated(db, { includeMature: true })).items).toEqual([]);
  });

  it('lists only stories with at least 3 published chapters and 5,000 words', async () => {
    const author = await makeAuthor(db);
    // Real counters: 3 published chapters of 320 words, plus a draft that does not count.
    const real = await makePublishedStory(db, author, 3, 'Ba Chương Ngắn');
    await addChapter(db, author, real.publicId, true);
    const cases: [string, Partial<typeof stories.$inferInsert>][] = [
      ['Hai Chương', { chapterCount: 2, wordCount: 6_000 }],
      ['Thiếu Chữ', { chapterCount: 3, wordCount: 4_999 }],
      ['Vừa Đủ', LISTED],
    ];
    for (const [title, counters] of cases) {
      const s = await makePublishedStory(db, author, 1, title);
      await setStory(s.storyId, counters);
    }
    const [row] = await db
      .select({ chapterCount: stories.chapterCount, wordCount: stories.wordCount })
      .from(stories)
      .where(eq(stories.id, real.storyId));
    expect(row).toEqual({ chapterCount: 3, wordCount: 960 });

    const listed = await listRecentlyUpdated(db, { includeMature: true });
    expect(listed.items.map((s) => s.title)).toEqual(['Vừa Đủ']);
    const notable = await listNotable(db, { includeMature: true, now: NOW });
    expect(notable.map((s) => s.title)).toEqual(['Vừa Đủ']);
  });

  it('returns cards without internal ids', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 3);
    await setStory(s.storyId, { wordCount: 5_000 });
    const [card] = (await listRecentlyUpdated(db, { includeMature: false })).items;
    expect(card).toMatchObject({
      title: 'Kiếm Đạo Độc Tôn',
      author: { username: 'author', displayName: 'Lâm Phong' },
      mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
      chapterCount: 3,
      wordCount: 5_000,
      status: 'ongoing',
    });
    expect(card).not.toHaveProperty('id');
  });

  it('gives every card its latest readable chapter, on the API list and the home page', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 3);
    await setStory(s.storyId, { wordCount: 5_000 });
    // A draft after the published chapters is never the latest one.
    await addChapter(db, author, s.publicId, true);
    const expected = { number: 3, title: null };
    const [card] = (await listRecentlyUpdated(db, { includeMature: false })).items;
    expect(card?.latestChapter).toEqual(expected);
    const [home] = (await getHomePage(db, NOW)).recent;
    expect(home?.latestChapter).toEqual(expected);
  });
});

describe('getHomePage', () => {
  it('heroes the first notable story, never 18+, with its synopsis and first readable chapter', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 3, 'Truyện Chính');
    await setStory(story.storyId, {
      ...LISTED,
      synopsis: 'Giới thiệu truyện chính.',
      createdAt: daysAgo(60),
    });
    const number = (n: number) => and(eq(chapters.storyId, story.storyId), eq(chapters.number, n));
    await db.update(chapters).set({ deletedAt: NOW }).where(number(1));
    await db.update(chapters).set({ status: 'draft' }).where(number(2));
    const mature = await makePublishedStory(db, author, 3, 'Truyện Người Lớn');
    await setStory(mature.storyId, { ...LISTED, isMature: true, createdAt: daysAgo(1) });

    const { hero } = await getHomePage(db, NOW);
    expect(hero).toMatchObject({
      title: 'Truyện Chính',
      synopsis: 'Giới thiệu truyện chính.',
      firstChapterNumber: 3,
    });
  });

  it('has no first chapter when the counters are stale and no synopsis when none was written', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 0, 'Không Còn Chương');
    await setStory(story.storyId, {
      ...LISTED,
      visibility: 'published',
      lastChapterAt: daysAgo(1),
      synopsis: '',
    });

    const { hero } = await getHomePage(db, NOW);
    expect(hero).toMatchObject({ synopsis: null, firstChapterNumber: null });
  });

  it('has no hero without a listed story', async () => {
    expect((await getHomePage(db, NOW)).hero).toBeNull();
  });

  it('shows the contests running now on the home page, never an ended one', async () => {
    const mod = await makeAuthor(db, 'contest_mod');
    const contest = (slug: string, startsAt: Date, endsAt: Date) => ({
      slug,
      title: slug,
      description: 'Chủ đề.',
      startsAt,
      endsAt,
      createdBy: mod.id,
    });
    await db
      .insert(contests)
      .values([
        contest('dang-mo', daysAgo(1), new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000)),
        contest('da-qua', daysAgo(10), daysAgo(2)),
      ]);
    const home = await getHomePage(db, NOW);
    expect(home.contests.map((c) => [c.slug, c.status, c.entryCount])).toEqual([
      ['dang-mo', 'open', 0],
    ]);
  });
});

describe('listNotable', () => {
  it('prefers new stories with enough chapters and words, then fills with the newest', async () => {
    const author = await makeAuthor(db);
    const strong = await makePublishedStory(db, author, 1, 'Đủ Chuẩn');
    const tooOld = await makePublishedStory(db, author, 1, 'Quá Cũ');
    const tooShort = await makePublishedStory(db, author, 1, 'Quá Ngắn');
    const strongBig = { chapterCount: 3, wordCount: 12_000 };
    await setStory(strong.storyId, { ...strongBig, createdAt: daysAgo(5) });
    await setStory(tooOld.storyId, { ...strongBig, createdAt: daysAgo(40) });
    await setStory(tooShort.storyId, { chapterCount: 3, wordCount: 6_000, createdAt: daysAgo(2) });

    const notable = await listNotable(db, { includeMature: false, limit: 2, now: NOW });
    // The only qualifying story, then the newest other one.
    expect(notable.map((s) => s.title)).toEqual(['Đủ Chuẩn', 'Quá Ngắn']);
  });

  it('fills only with stories past the home listing threshold, never one without chapters', async () => {
    const author = await makeAuthor(db);
    const strong = await makePublishedStory(db, author, 1, 'Đủ Chuẩn');
    await setStory(strong.storyId, { chapterCount: 3, wordCount: 12_000, createdAt: daysAgo(5) });
    const listed = await makePublishedStory(db, author, 1, 'Đạt Ngưỡng');
    await setStory(listed.storyId, { ...LISTED, createdAt: daysAgo(60) });
    const below = await makePublishedStory(db, author, 1, 'Dưới Ngưỡng');
    await setStory(below.storyId, { chapterCount: 3, wordCount: 4_900, createdAt: daysAgo(1) });
    // Published, every chapter since deleted: newest of all, but nothing to read.
    const empty = await makePublishedStory(db, author, 1, 'Không Chương');
    await setStory(empty.storyId, { chapterCount: 0, wordCount: 0, lastChapterAt: null });

    const notable = await listNotable(db, { includeMature: false, limit: 4, now: NOW });
    expect(notable.map((s) => s.title)).toEqual(['Đủ Chuẩn', 'Đạt Ngưỡng']);
  });

  it('loads extra stories on the home page and the API, for sections that drop repeats', async () => {
    const author = await makeAuthor(db);
    const extra = NOTABLE_LIMIT + HOME_DEDUPE_SLACK;
    for (let i = 0; i <= extra; i++) {
      const s = await makePublishedStory(db, author, 0, `Truyện ${i}`);
      await setStory(s.storyId, { ...LISTED, visibility: 'published', lastChapterAt: daysAgo(1) });
    }
    expect((await getHomePage(db, NOW)).notable).toHaveLength(extra);
    const api = await listStories(db, { list: 'notable' }, { includeMature: false });
    expect(api?.stories).toHaveLength(extra);
  });
});

describe('getTagPage', () => {
  it('redirects a merged tag to its canonical tag', async () => {
    expect(await getTagPage(db, 'tu-tien', { includeMature: false, page: 1 })).toEqual({
      kind: 'redirect',
      slug: 'tien-hiep',
    });
    expect(await getTagPage(db, 'khong-co', { includeMature: false, page: 1 })).toBeNull();
  });

  it('lists stories tagged with the canonical tag or a tag merged into it', async () => {
    const author = await makeAuthor(db);
    const direct = await makePublishedStory(db, author, 1, 'Gắn Trực Tiếp');
    const viaMerged = await makePublishedStory(db, author, 1, 'Gắn Tag Cũ');
    await setStory(viaMerged.storyId, { mainTagId: await tagId('do-thi') });
    await db.delete(storyTags).where(eq(storyTags.storyId, viaMerged.storyId));
    await linkTag(viaMerged.storyId, 'do-thi');
    await linkTag(viaMerged.storyId, 'tu-tien');
    const other = await makePublishedStory(db, author, 1, 'Đô Thị Thuần');
    await setStory(other.storyId, { mainTagId: await tagId('do-thi') });
    await db.delete(storyTags).where(eq(storyTags.storyId, other.storyId));
    await linkTag(other.storyId, 'do-thi');
    await setStory(direct.storyId, { lastChapterAt: daysAgo(2) });
    await setStory(viaMerged.storyId, { lastChapterAt: daysAgo(1) });

    const result = await getTagPage(db, 'tien-hiep', { includeMature: false, page: 1 });
    if (result?.kind !== 'ok') throw new Error('expected a tag page');
    expect(result.tag).toEqual({ slug: 'tien-hiep', name: 'Tiên hiệp', kind: 'genre' });
    expect(result.stories.items.map((s) => s.title)).toEqual(['Gắn Tag Cũ', 'Gắn Trực Tiếp']);

    const page2 = await getTagPage(db, 'tien-hiep', { includeMature: false, page: 2, pageSize: 1 });
    if (page2?.kind !== 'ok') throw new Error('expected a tag page');
    expect(page2.stories).toMatchObject({ page: 2, totalPages: 2 });
    expect(page2.stories.items.map((s) => s.title)).toEqual(['Gắn Trực Tiếp']);
  });

  it('keeps pages that only 18+ readers fill, so their pagination never 404s', async () => {
    const author = await makeAuthor(db);
    const general = await makePublishedStory(db, author, 1, 'Thường');
    const adult = await makePublishedStory(db, author, 1, 'Người Lớn');
    await setStory(adult.storyId, { isMature: true, lastChapterAt: daysAgo(5) });
    await setStory(general.storyId, { lastChapterAt: daysAgo(1) });

    const guestPage2 = await getTagPage(db, 'tien-hiep', {
      includeMature: false,
      page: 2,
      pageSize: 1,
    });
    if (guestPage2?.kind !== 'ok') throw new Error('expected a tag page');
    expect(guestPage2.stories).toEqual({ items: [], page: 2, totalPages: 1 });
    expect(guestPage2.lastPage).toBe(2);

    const adultPage2 = await getTagPage(db, 'tien-hiep', {
      includeMature: true,
      page: 2,
      pageSize: 1,
    });
    if (adultPage2?.kind !== 'ok') throw new Error('expected a tag page');
    expect(adultPage2.stories.items.map((s) => s.title)).toEqual(['Người Lớn']);
    expect(adultPage2.stories.totalPages).toBe(2);
  });

  it('gives up on a merge cycle', async () => {
    const a = await tagId('xuyen-khong');
    const b = await tagId('he-thong');
    await db.update(tags).set({ canonicalId: b }).where(eq(tags.id, a));
    await db.update(tags).set({ canonicalId: a }).where(eq(tags.id, b));
    expect(await getTagPage(db, 'xuyen-khong', { includeMature: false, page: 1 })).toBeNull();
  });
});

describe('getAuthorPage', () => {
  it('is null for an unknown, banned or storyless author', async () => {
    const author = await makeAuthor(db);
    expect(await getAuthorPage(db, 'author', { includeMature: false })).toBeNull();
    await draftStory(author, 'Chỉ Có Nháp');
    expect(await getAuthorPage(db, 'author', { includeMature: false })).toBeNull();
    await makePublishedStory(db, author, 1);
    expect(await getAuthorPage(db, 'author', { includeMature: false })).not.toBeNull();
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await getAuthorPage(db, 'author', { includeMature: false })).toBeNull();
    expect(await getAuthorPage(db, 'nobody', { includeMature: false })).toBeNull();
  });

  it('keeps the page of an author with only 18+ stories but lists them only on request', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await setStory(s.storyId, { isMature: true });
    expect((await getAuthorPage(db, 'author', { includeMature: false }))?.stories).toEqual([]);
    expect((await getAuthorPage(db, 'author', { includeMature: true }))?.stories).toHaveLength(1);
  });
});

describe('getStoryPage', () => {
  it('returns the story with canonical tags, readable chapters and release pace', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 3);
    await addChapter(db, author, s.publicId, true);
    await linkTag(s.storyId, 'tu-tien');
    await linkTag(s.storyId, 'bao-luc');

    const page = await getStoryPage(db, s.publicId, new Date());
    expect(page?.story).toMatchObject({
      publicId: s.publicId,
      author: { username: 'author', displayName: 'Lâm Phong' },
      mainTag: { slug: 'tien-hiep', kind: 'genre' },
      tags: [{ slug: 'bao-luc', name: 'Bạo lực', kind: 'warning' }],
      chapterCount: 3,
    });
    expect(page?.chapters.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(page?.chaptersPerWeek).toBe(0.7);
  });

  it('is null for a draft, hidden or banned story', async () => {
    const author = await makeAuthor(db);
    const draft = await draftStory(author, 'Nháp');
    expect(await getStoryPage(db, draft.publicId)).toBeNull();
    const s = await makePublishedStory(db, author, 1);
    await setStory(s.storyId, { visibility: 'hidden_by_mod' });
    expect(await getStoryPage(db, s.publicId)).toBeNull();
    await setStory(s.storyId, { visibility: 'published' });
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await getStoryPage(db, s.publicId)).toBeNull();
  });
});

const RANKING_PATHS = ['/rankings/day', '/rankings/week', '/rankings/month', '/rankings/rising'];
const TIEN_HIEP_PATHS = ['/tags/tien-hiep', '/tags/tien-hiep?noAi=1'];

describe('catalogUrls', () => {
  it('a chapter change lists the home, explore, author, canonical tag and ranking pages', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await linkTag(s.storyId, 'tu-tien');
    await linkTag(s.storyId, 'bao-luc');
    const change = {
      entity: 'chapter' as const,
      action: 'published' as const,
      storyId: s.storyId,
      chapterId: s.storyId,
      chapterNumber: 1,
    };
    expect(await catalogUrls(db, change)).toEqual([
      '/',
      '/search',
      '/authors/author',
      '/tags/bao-luc',
      '/tags/bao-luc?noAi=1',
      '/tags/tien-hiep',
      '/tags/tien-hiep?noAi=1',
      '/rankings/day',
      '/rankings/week',
      '/rankings/month',
      '/rankings/rising',
    ]);
  });

  it('a story that changed its tags also purges the tag pages it left', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    const updated = await updateStory(db, author, s.publicId, { mainTag: 'do-thi', tags: [] });
    expect(updated.ok).toBe(true);
    const [event] = await db
      .select({ payload: contentEvents.payload })
      .from(contentEvents)
      .orderBy(desc(contentEvents.id))
      .limit(1);
    const change = contentChangeSchema.parse(event?.payload);
    expect(await catalogUrls(db, change)).toEqual([
      '/',
      '/search',
      '/authors/author',
      '/tags/do-thi',
      '/tags/do-thi?noAi=1',
      '/tags/tien-hiep',
      '/tags/tien-hiep?noAi=1',
      '/rankings/day',
      '/rankings/week',
      '/rankings/month',
      '/rankings/rising',
    ]);
  });

  it('still lists the pages of a hidden story and of a banned author', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await setStory(s.storyId, { visibility: 'hidden_by_mod' });
    expect(
      await catalogUrls(db, { entity: 'story', action: 'hidden', storyId: s.storyId }),
    ).toEqual(['/', '/search', '/authors/author', ...TIEN_HIEP_PATHS, ...RANKING_PATHS]);

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await catalogUrls(db, { entity: 'user', action: 'banned', userId: author.id })).toEqual([
      '/',
      '/search',
      ...TIEN_HIEP_PATHS,
      ...RANKING_PATHS,
    ]);
  });

  it('adds /contests and the page of every contest the story entered', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    const other = await makePublishedStory(db, author, 1, 'Truyện Khác');
    const contestRows = await db
      .insert(contests)
      .values(
        ['mua-thu', 'mua-dong', 'mua-he'].map((slug) => ({
          slug,
          title: slug,
          description: 'Chủ đề',
          startsAt: new Date('2026-09-01T00:00:00Z'),
          endsAt: new Date('2026-10-01T00:00:00Z'),
          createdBy: author.id,
        })),
      )
      .returning({ id: contests.id, slug: contests.slug });
    const id = (slug: string) => contestRows.find((c) => c.slug === slug)?.id ?? '';
    await db.insert(contestEntries).values([
      { contestId: id('mua-thu'), storyId: s.storyId },
      { contestId: id('mua-dong'), storyId: s.storyId },
      { contestId: id('mua-he'), storyId: other.storyId },
    ]);
    const story = await catalogUrls(db, { entity: 'story', action: 'hidden', storyId: s.storyId });
    expect(story.slice(-3)).toEqual(['/contests', '/contests/mua-dong', '/contests/mua-thu']);
    const user = await catalogUrls(db, { entity: 'user', action: 'banned', userId: author.id });
    expect(user.slice(-4)).toEqual([
      '/contests',
      '/contests/mua-dong',
      '/contests/mua-he',
      '/contests/mua-thu',
    ]);
  });
});
