import { contentEvents, stories, storyTags, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { STORY_VISIBILITIES } from '@novel-hub/shared';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import type { StoryActor } from '../policies/story';
import { contentChangeSchema } from '../content/hooks';
import { createStory } from '../stories/create-story';
import { updateStory } from '../stories/update-story';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getAuthorPage } from './author-page';
import { listNotable, listRecentlyUpdated } from './home';
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
    await setStory(older.storyId, { lastChapterAt: daysAgo(3) });
    await setStory(newer.storyId, { lastChapterAt: daysAgo(1) });
    await setStory(mature.storyId, { lastChapterAt: daysAgo(2), isMature: true });
    await setStory(hidden.storyId, { visibility: 'hidden_by_mod' });
    await setStory(empty.storyId, { lastChapterAt: null });

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
    await makePublishedStory(db, author, 1);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect((await listRecentlyUpdated(db, { includeMature: true })).items).toEqual([]);
  });

  it('returns cards without internal ids', async () => {
    const author = await makeAuthor(db);
    await makePublishedStory(db, author, 2);
    const [card] = (await listRecentlyUpdated(db, { includeMature: false })).items;
    expect(card).toMatchObject({
      title: 'Kiếm Đạo Độc Tôn',
      author: { username: 'author', displayName: 'Lâm Phong' },
      mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
      chapterCount: 2,
      wordCount: 640,
      status: 'ongoing',
    });
    expect(card).not.toHaveProperty('id');
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
    await setStory(tooShort.storyId, { chapterCount: 3, wordCount: 900, createdAt: daysAgo(2) });

    const notable = await listNotable(db, { includeMature: false, limit: 2, now: NOW });
    // The only qualifying story, then the newest other one.
    expect(notable.map((s) => s.title)).toEqual(['Đủ Chuẩn', 'Quá Ngắn']);
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

describe('catalogUrls', () => {
  it('a chapter change lists the home page, the author page and the canonical tag pages', async () => {
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
      '/authors/author',
      '/tags/bao-luc',
      '/tags/tien-hiep',
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
      '/authors/author',
      '/tags/do-thi',
      '/tags/tien-hiep',
    ]);
  });

  it('still lists the pages of a hidden story and of a banned author', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await setStory(s.storyId, { visibility: 'hidden_by_mod' });
    expect(
      await catalogUrls(db, { entity: 'story', action: 'hidden', storyId: s.storyId }),
    ).toEqual(['/', '/authors/author', '/tags/tien-hiep']);

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await catalogUrls(db, { entity: 'user', action: 'banned', userId: author.id })).toEqual([
      '/',
      '/tags/tien-hiep',
    ]);
  });
});
