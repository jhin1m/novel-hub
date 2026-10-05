import { stories, storyTags, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { type SearchQuery, searchQuerySchema } from '@novel-hub/shared';
import { loadServerEnv, meiliWorkerEnvSchema } from '@novel-hub/shared/env';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { type SearchCtx, createSearchCtx } from './client';
import type { StoryDoc } from './documents';
import { searchCatalog } from './query';
import { reindexAll } from './reindex';
import { ensureSearchSettings } from './settings';
import { syncAuthor, syncStory, syncStoryAndAuthor, syncUserContent } from './sync';

const { db, pool } = createTestDb();
// Meilisearch always runs with `pnpm infra:up`; a missing key fails here with the variable name.
const meili = loadServerEnv(meiliWorkerEnvSchema);
const prefix = `test_${Math.random().toString(36).slice(2, 10)}`;
const ctx: SearchCtx = createSearchCtx({
  url: meili.MEILI_URL,
  apiKey: meili.MEILI_MASTER_KEY,
  prefix,
});

beforeAll(async () => {
  await ensureSearchSettings(ctx);
});

afterAll(async () => {
  await ctx.client.deleteIndexIfExists(ctx.names.stories);
  await ctx.client.deleteIndexIfExists(ctx.names.authors);
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
  for (const uid of [ctx.names.stories, ctx.names.authors]) {
    await ctx.client.index(uid).deleteAllDocuments().waitTask();
  }
});

const query = (input: Partial<SearchQuery>) =>
  searchCatalog(db, ctx, searchQuerySchema.parse(input), { includeMature: false });

const titlesFor = async (q: string, includeMature = false) =>
  (
    await searchCatalog(db, ctx, searchQuerySchema.parse({ q }), { includeMature })
  ).stories.hits.map((hit) => hit.title);

/** Searches with every word required, so a typo only matches if it is actually corrected. */
const strictTitles = async (q: string) =>
  (
    await ctx.client
      .index<StoryDoc>(ctx.names.stories)
      .search(q, { matchingStrategy: 'all', filter: ['isMature = false'] })
  ).hits.map((hit) => hit.title);

async function setStory(storyId: string, values: Partial<typeof stories.$inferInsert>) {
  await db.update(stories).set(values).where(eq(stories.id, storyId));
}

async function indexedPublicIds(): Promise<string[]> {
  const { results } = await ctx.client
    .index<StoryDoc>(ctx.names.stories)
    .getDocuments<Pick<StoryDoc, 'publicId'>>({ fields: ['publicId'], limit: 1000 });
  return results.map((doc): string => doc.publicId).sort();
}

async function indexedAuthors(): Promise<string[]> {
  const { results } = await ctx.client
    .index<{ username: string }>(ctx.names.authors)
    .getDocuments<{ username: string }>({ fields: ['username'], limit: 1000 });
  return results.map((doc): string => doc.username).sort();
}

describe('Vietnamese matching', () => {
  beforeEach(async () => {
    const author = await makeAuthor(db, 'lam_phong');
    for (const title of ['Kiếm Đạo Độc Tôn', 'Con Đường Bá Chủ', 'Thiên Long Bát Bộ']) {
      const { storyId } = await makePublishedStory(db, author, 1, title);
      await syncStoryAndAuthor(db, ctx, storyId);
    }
  });

  it('finds a title with or without diacritics and in any case', async () => {
    for (const q of ['kiếm đạo', 'kiem dao doc ton', 'KIEM DAO']) {
      expect(await titlesFor(q), q).toContain('Kiếm Đạo Độc Tôn');
    }
  });

  it('folds đ to d', async () => {
    expect(await titlesFor('duong')).toContain('Con Đường Bá Chủ');
    expect(await titlesFor('đường')).toContain('Con Đường Bá Chủ');
  });

  it('forgives a typo in the first word when every word must match', async () => {
    expect(await strictTitles('kiemm dao doc ton')).toContain('Kiếm Đạo Độc Tôn');
    expect(await strictTitles('kiwm dao')).toContain('Kiếm Đạo Độc Tôn');
    expect(await strictTitles('xyzq dao')).toEqual([]);
  });

  it('returns matching authors on the first page of a text search only', async () => {
    const first = await query({ q: 'lam phong' });
    expect(first.authors.map((a) => a.username)).toEqual(['lam_phong']);
    expect(first.authors[0]?.storyCount).toBe(3);
    expect((await query({ q: 'lam phong', page: 2 })).authors).toEqual([]);
    expect((await query({ q: '' })).authors).toEqual([]);
  });
});

describe('filters and 18+', () => {
  it('leaves 18+ stories out unless allowed', async () => {
    const author = await makeAuthor(db);
    const normal = await makePublishedStory(db, author, 1, 'Truyện Thường');
    const mature = await makePublishedStory(db, author, 1, 'Truyện Người Lớn');
    await setStory(mature.storyId, { isMature: true });
    await syncStory(db, ctx, normal.storyId);
    await syncStory(db, ctx, mature.storyId);

    expect(await titlesFor('truyen')).toEqual(['Truyện Thường']);
    expect((await titlesFor('truyen', true)).sort()).toEqual(['Truyện Người Lớn', 'Truyện Thường']);
  });

  it('hides an author whose public stories are all 18+ unless 18+ is allowed', async () => {
    const author = await makeAuthor(db, 'chi_nguoi_lon');
    const first = await makePublishedStory(db, author, 1, 'Một');
    const second = await makePublishedStory(db, author, 1, 'Hai');
    await setStory(first.storyId, { isMature: true });
    await syncStoryAndAuthor(db, ctx, first.storyId);
    await syncStoryAndAuthor(db, ctx, second.storyId);

    const authorsFor = async (includeMature: boolean) =>
      (
        await searchCatalog(db, ctx, searchQuerySchema.parse({ q: 'chi nguoi lon' }), {
          includeMature,
        })
      ).authors;
    expect(await authorsFor(false)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 1 }]);
    expect(await authorsFor(true)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 2 }]);

    // The last general story turns 18+: the story sync also resyncs its author.
    await setStory(second.storyId, { isMature: true });
    await syncStoryAndAuthor(db, ctx, second.storyId);
    expect(await authorsFor(false)).toEqual([]);
    expect(await authorsFor(true)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 2 }]);

    // A reindex rebuilds the same doc.
    await ctx.client.index(ctx.names.authors).deleteAllDocuments().waitTask();
    await reindexAll(db, ctx);
    expect(await authorsFor(false)).toEqual([]);
    expect(await authorsFor(true)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 2 }]);

    // Back to general once a moderator hides the 18+ one and a general story remains.
    await setStory(second.storyId, { isMature: false });
    await setStory(first.storyId, { visibility: 'hidden_by_mod' });
    await syncStoryAndAuthor(db, ctx, first.storyId);
    expect(await authorsFor(false)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 1 }]);
    expect(await authorsFor(true)).toMatchObject([{ username: 'chi_nguoi_lon', storyCount: 1 }]);
  });

  it('filters by tag (a merged tag as its canonical tag), status and word count', async () => {
    const author = await makeAuthor(db);
    const a = await makePublishedStory(db, author, 1, 'Alpha');
    const b = await makePublishedStory(db, author, 1, 'Beta');
    const [doThi] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, 'do-thi'));
    await setStory(b.storyId, { mainTagId: doThi?.id, status: 'completed', wordCount: 250_000 });
    await db.delete(storyTags).where(eq(storyTags.storyId, b.storyId));
    await setStory(a.storyId, { wordCount: 10_000 });
    for (const s of [a, b]) await syncStory(db, ctx, s.storyId);

    const titles = async (input: Partial<SearchQuery>) =>
      (await query(input)).stories.hits.map((h) => h.title).sort();
    expect(await titles({ tag: 'tien-hiep' })).toEqual(['Alpha']);
    expect(await titles({ tag: 'tu-tien' })).toEqual(['Alpha']);
    expect(await titles({ tag: 'do-thi' })).toEqual(['Beta']);
    expect(await titles({ status: 'completed' })).toEqual(['Beta']);
    expect(await titles({ minWords: 200_000, maxWords: 499_999 })).toEqual(['Beta']);
    expect(await titles({ maxWords: 49_999 })).toEqual(['Alpha']);
    expect(await titles({})).toEqual(['Alpha', 'Beta']);
  });

  it('browses an empty query most recently updated first, with page counts', async () => {
    const author = await makeAuthor(db);
    const old = await makePublishedStory(db, author, 1, 'Cũ');
    const recent = await makePublishedStory(db, author, 1, 'Mới');
    await setStory(old.storyId, { lastChapterAt: new Date('2026-01-01T00:00:00Z') });
    await setStory(recent.storyId, { lastChapterAt: new Date('2026-09-01T00:00:00Z') });
    for (const s of [old, recent]) await syncStory(db, ctx, s.storyId);

    const result = await query({});
    expect(result.stories.hits.map((h) => h.title)).toEqual(['Mới', 'Cũ']);
    expect(result.stories).toMatchObject({ page: 1, totalPages: 1, totalHits: 2 });
    expect(result.stories.hits[0]?.lastChapterAt).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('sync', () => {
  it('removes a story that is hidden or back to draft, and restores it when public again', async () => {
    const author = await makeAuthor(db);
    const { storyId, publicId } = await makePublishedStory(db, author, 1);
    expect(await syncStory(db, ctx, storyId)).toBe('upserted');
    expect(await indexedPublicIds()).toEqual([publicId]);

    for (const visibility of ['hidden_by_mod', 'draft'] as const) {
      await setStory(storyId, { visibility });
      expect(await syncStory(db, ctx, storyId)).toBe('deleted');
      expect(await indexedPublicIds()).toEqual([]);
      await setStory(storyId, { visibility: 'published' });
      expect(await syncStory(db, ctx, storyId)).toBe('upserted');
      expect(await indexedPublicIds()).toEqual([publicId]);
    }
    expect(await syncStory(db, ctx, '01920000-0000-7000-8000-00000000ffff')).toBe('missing');
  });

  it('follows a ban, an unban and a rename of the author', async () => {
    const author = await makeAuthor(db, 'tac_gia');
    const one = await makePublishedStory(db, author, 1, 'Một');
    const two = await makePublishedStory(db, author, 1, 'Hai');
    await syncStoryAndAuthor(db, ctx, one.storyId);
    await syncStoryAndAuthor(db, ctx, two.storyId);
    expect(await indexedAuthors()).toEqual(['tac_gia']);

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    await syncUserContent(db, ctx, author.id);
    expect(await indexedPublicIds()).toEqual([]);
    expect(await indexedAuthors()).toEqual([]);

    await db
      .update(users)
      .set({ status: 'active', displayName: 'Tên Mới' })
      .where(eq(users.id, author.id));
    await syncUserContent(db, ctx, author.id);
    expect(await indexedPublicIds()).toEqual([one.publicId, two.publicId].sort());
    const hits = (await query({ q: 'ten moi' })).stories.hits;
    expect(hits.map((h) => h.author.displayName)).toEqual(['Tên Mới', 'Tên Mới']);
  });

  it('drops the author once their last public story is gone', async () => {
    const author = await makeAuthor(db, 'mot_truyen');
    const { storyId } = await makePublishedStory(db, author, 1);
    await syncStoryAndAuthor(db, ctx, storyId);
    expect(await indexedAuthors()).toEqual(['mot_truyen']);

    await setStory(storyId, { visibility: 'hidden_by_mod' });
    await syncStoryAndAuthor(db, ctx, storyId);
    expect(await indexedAuthors()).toEqual([]);
    expect(await syncAuthor(db, ctx, author.id)).toBe('deleted');
  });

  it('applies two changes in a row, whatever arrives last', async () => {
    const author = await makeAuthor(db);
    const { storyId } = await makePublishedStory(db, author, 1, 'Tên Đầu');
    await setStory(storyId, { title: 'Tên Hai' });
    await syncStory(db, ctx, storyId);
    await setStory(storyId, { title: 'Tên Ba' });
    await syncStory(db, ctx, storyId);
    expect((await query({ q: 'ten ba' })).stories.hits.map((h) => h.title)).toEqual(['Tên Ba']);
  });
});

describe('reindexAll', () => {
  it('rebuilds from Postgres and removes stale docs', async () => {
    const author = await makeAuthor(db, 'tac_gia');
    const kept = await makePublishedStory(db, author, 1, 'Còn');
    const hidden = await makePublishedStory(db, author, 1, 'Ẩn');
    await setStory(hidden.storyId, { visibility: 'hidden_by_mod' });
    // Junk the index holds from before: a deleted row and a story no longer public.
    await ctx.client
      .index(ctx.names.stories)
      .addDocuments([
        { publicId: 'zzzzzzzz', title: 'Rác' },
        { publicId: hidden.publicId, title: 'Ẩn' },
      ])
      .waitTask();
    await ctx.client
      .index(ctx.names.authors)
      .addDocuments([{ username: 'ghost' }])
      .waitTask();

    const result = await reindexAll(db, ctx);
    expect(result).toEqual({ upserted: 2, deleted: 3 });
    expect(await indexedPublicIds()).toEqual([kept.publicId]);
    expect(await indexedAuthors()).toEqual(['tac_gia']);
  });

  it('rewrites an outdated doc of a public story', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await ctx.client
      .index(ctx.names.stories)
      .addDocuments([{ publicId: story.publicId, title: 'cũ' }])
      .waitTask();
    await reindexAll(db, ctx);
    expect(await indexedPublicIds()).toEqual([story.publicId]);
  });
});
