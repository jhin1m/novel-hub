// Demo seed for local browsing: `pnpm db:seed-demo`. Wipes the database, loads the base seed,
// then adds ~47 stories with random chapters, extra authors, a reader library, open reports and 30
// days of daily readers for the rankings.
// Same guard and password (`SEED_USER_PASSWORD`) as `pnpm db:seed`. Run `pnpm search:reindex` after.
import { renderPublishedContent } from '@novel-hub/core';
import {
  type Tx,
  accounts,
  chapterContents,
  chapterDrafts,
  chapterRevisions,
  chapters,
  createDb,
  insertStoryWithPublicId,
  libraryItems,
  readingProgress,
  reports,
  storyDailyStats,
  storyTags,
  tags,
  users,
} from '@novel-hub/db';
import {
  assertSeedAllowed,
  describeDbError,
  seedDatabase,
  truncatePublicTables,
} from '@novel-hub/db/seed';
import { countWords, generatePid, slugify, statsDate } from '@novel-hub/shared';
import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { hashPassword } from 'better-auth/crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AUTHOR_NOTES, COMMON_SENTENCES, GENRES, type GenreBank } from './demo-content';

const DEMO_STORY_COUNT = 47;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DEMO_AUTHORS = [
  { username: 'mac_vu', displayName: 'Mặc Vũ', bio: 'Thích viết về những kẻ đi ngược dòng.' },
  { username: 'thanh_tam', displayName: 'Thanh Tâm', bio: 'Một ngày viết một nghìn chữ.' },
  { username: 'lam_phong', displayName: 'Lâm Phong Vũ', bio: 'Kiếm hiệp, tiên hiệp và trà đá.' },
  { username: 'ha_an', displayName: 'Hạ An', bio: 'Viết truyện tình cảm cho người đã lớn.' },
  { username: 'dem_trang', displayName: 'Đêm Trắng', bio: 'Truyện kinh dị đọc lúc nửa đêm.' },
  { username: 'tinh_van', displayName: 'Tinh Vân', bio: 'Khoa học viễn tưởng, đôi khi hơi buồn.' },
  { username: 'co_hoa', displayName: 'Cổ Họa', bio: '' },
  {
    username: 'bach_lo',
    displayName: 'Bạch Lộ',
    bio: 'Trinh thám là trò chơi giữa tác giả và độc giả.',
  },
];

/** Deterministic PRNG (mulberry32) so repeated runs produce the same catalogue. */
function createRandom(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('pick() on an empty list');
    return item;
  };
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}
type Random = ReturnType<typeof createRandom>;

function fill(template: string, cast: { a: string; b: string; p: string }): string {
  return template.replaceAll('{A}', cast.a).replaceAll('{B}', cast.b).replaceAll('{P}', cast.p);
}

/** Builds paragraphs from the genre's sentence bank until the chapter reaches `targetWords`. */
function buildParagraphs(rand: Random, genre: GenreBank, targetWords: number): string[] {
  const cast = { a: rand.pick(genre.names), b: rand.pick(genre.names), p: rand.pick(genre.places) };
  const paragraphs: string[] = [];
  let words = 0;
  while (words < targetWords) {
    const sentences = Array.from({ length: rand.int(3, 6) }, () =>
      fill(rand.chance(0.25) ? rand.pick(COMMON_SENTENCES) : rand.pick(genre.sentences), cast),
    );
    const paragraph = sentences.join(' ');
    paragraphs.push(paragraph);
    words += countWords(paragraph);
  }
  return paragraphs;
}

function toDoc(paragraphs: string[]) {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      attrs: { pid: generatePid() },
      content: [{ type: 'text', text }],
    })),
  };
}

function render(doc: unknown) {
  const rendered = renderPublishedContent(doc);
  if (!rendered.ok) throw new Error('A demo chapter does not match the editor schema');
  return rendered.value;
}

interface DemoStoryPlan {
  title: string;
  synopsis: string;
  genre: GenreBank;
  authorId: string;
  extraTagSlugs: string[];
  status: 'ongoing' | 'completed' | 'hiatus';
  visibility: 'published' | 'draft' | 'hidden_by_mod';
  isMature: boolean;
  isAiAssisted: boolean;
  createdAt: Date;
  publishedChapters: number;
  wordsPerChapter: [number, number];
  scheduledChapter: boolean;
  draftChapter: boolean;
}

function planStories(rand: Random, authorIds: string[], now: Date): DemoStoryPlan[] {
  const usedTitles = new Set<string>();
  const plans: DemoStoryPlan[] = [];
  for (let i = 0; i < DEMO_STORY_COUNT; i++) {
    const genre = GENRES[i % GENRES.length] as GenreBank;
    const randomTitle = () => `${rand.pick(genre.titleHeads)} ${rand.pick(genre.titleTails)}`;
    let title = randomTitle();
    while (usedTitles.has(title)) title = randomTitle();
    usedTitles.add(title);

    // About a third are new enough (< 30 days) to compete for the "notable new stories" shelf.
    const ageDays = rand.chance(0.35) ? rand.int(3, 28) : rand.int(35, 240);
    const isMature = ['kinh-di', 'do-thi', 'ngon-tinh'].includes(genre.slug) && rand.chance(0.25);
    const extraTagSlugs = [
      ...(rand.chance(0.3) ? ['xuyen-khong'] : []),
      ...(rand.chance(0.3) ? ['he-thong'] : []),
      ...(genre.slug === 'kinh-di' || genre.slug === 'kiem-hiep' || rand.chance(0.1)
        ? ['bao-luc']
        : []),
      ...(isMature ? ['noi-dung-18'] : []),
    ];
    const visibility = i === 5 ? 'hidden_by_mod' : i === 9 || i === 17 ? 'draft' : 'published';
    const roll = rand.next();
    const status = roll < 0.2 ? 'completed' : roll < 0.3 ? 'hiatus' : 'ongoing';
    const cast = {
      a: rand.pick(genre.names),
      b: rand.pick(genre.names),
      p: rand.pick(genre.places),
    };

    plans.push({
      title,
      synopsis: fill(rand.pick(genre.synopses), cast),
      genre,
      authorId: rand.pick(authorIds),
      extraTagSlugs,
      status,
      visibility,
      isMature,
      isAiAssisted: rand.chance(0.12),
      createdAt: new Date(now.getTime() - ageDays * DAY_MS),
      publishedChapters:
        visibility === 'draft' ? 0 : status === 'completed' ? rand.int(8, 14) : rand.int(1, 9),
      wordsPerChapter: rand.chance(0.5) ? [1800, 3200] : [600, 1600],
      scheduledChapter: status === 'ongoing' && visibility === 'published' && rand.chance(0.2),
      draftChapter: rand.chance(0.25) || visibility === 'draft',
    });
  }
  return plans;
}

async function insertStory(
  tx: Tx,
  rand: Random,
  plan: DemoStoryPlan,
  tagIds: Map<string, string>,
  now: Date,
): Promise<{ storyId: string; chapterCount: number }> {
  const tagId = (slug: string) => {
    const id = tagIds.get(slug);
    if (!id) throw new Error(`Unknown tag slug: ${slug}`);
    return id;
  };

  // Published chapters spread between story creation and (at most) a few hours ago; completed and
  // hiatus stories stop well before today.
  const lastAt =
    plan.status === 'ongoing'
      ? now.getTime() -
        rand.int(
          1,
          Math.max(2, Math.min(240, (now.getTime() - plan.createdAt.getTime()) / HOUR_MS)),
        ) *
          HOUR_MS
      : now.getTime() - rand.int(10, 30) * DAY_MS;
  const firstAt = plan.createdAt.getTime() + HOUR_MS;
  const span = Math.max(lastAt - firstAt, HOUR_MS);
  const published = Array.from({ length: plan.publishedChapters }, (_, i) => {
    const at =
      plan.publishedChapters === 1 ? lastAt : firstAt + (span * i) / (plan.publishedChapters - 1);
    const paragraphs = buildParagraphs(rand, plan.genre, rand.int(...plan.wordsPerChapter));
    return { publishedAt: new Date(Math.min(at, lastAt)), paragraphs };
  });
  const wordCounts = published.map((c) => countWords(c.paragraphs.join(' ')));
  const lastChapterAt = published.at(-1)?.publishedAt ?? null;

  const { id: storyId } = await insertStoryWithPublicId(tx, {
    slug: slugify(plan.title),
    authorId: plan.authorId,
    title: plan.title,
    synopsis: plan.synopsis,
    mainTagId: tagId(plan.genre.slug),
    status: plan.status,
    visibility: plan.visibility,
    isAiAssisted: plan.isAiAssisted,
    isMature: plan.isMature,
    wordCount: wordCounts.reduce((a, b) => a + b, 0),
    chapterCount: published.length,
    lastChapterAt,
    createdAt: plan.createdAt,
    updatedAt: lastChapterAt ?? plan.createdAt,
  });
  await tx
    .insert(storyTags)
    .values(
      [plan.genre.slug, ...plan.extraTagSlugs].map((slug) => ({ storyId, tagId: tagId(slug) })),
    );

  const titles = [...plan.genre.chapterTitles].sort(() => rand.next() - 0.5);
  let number = 0;
  for (const [i, chapter] of published.entries()) {
    number += 1;
    const content = render(toDoc(chapter.paragraphs));
    const [row] = await tx
      .insert(chapters)
      .values({
        storyId,
        number,
        title: titles[i % titles.length] ?? null,
        authorNote: rand.chance(0.25) ? rand.pick(AUTHOR_NOTES) : null,
        wordCount: wordCounts[i] ?? 0,
        status: 'published',
        publishedAt: chapter.publishedAt,
        createdAt: chapter.publishedAt,
        updatedAt: chapter.publishedAt,
      })
      .returning({ id: chapters.id });
    if (!row) throw new Error('Chapter insert returned no id');
    await tx.insert(chapterContents).values({
      chapterId: row.id,
      docJson: content.doc,
      html: content.html,
      paragraphIds: content.paragraphIds,
      contentHash: content.contentHash,
    });
    await tx.insert(chapterRevisions).values({
      chapterId: row.id,
      docJson: content.doc,
      wordCount: wordCounts[i] ?? 0,
      createdAt: chapter.publishedAt,
    });
  }

  if (plan.scheduledChapter) {
    number += 1;
    const paragraphs = buildParagraphs(rand, plan.genre, rand.int(...plan.wordsPerChapter));
    const content = render(toDoc(paragraphs));
    const [row] = await tx
      .insert(chapters)
      .values({
        storyId,
        number,
        title: titles[number % titles.length] ?? null,
        wordCount: countWords(paragraphs.join(' ')),
        status: 'scheduled',
        scheduledAt: new Date(now.getTime() + rand.int(1, 5) * DAY_MS),
      })
      .returning({ id: chapters.id });
    if (!row) throw new Error('Chapter insert returned no id');
    await tx.insert(chapterContents).values({
      chapterId: row.id,
      docJson: content.doc,
      html: content.html,
      paragraphIds: content.paragraphIds,
      contentHash: content.contentHash,
    });
  }

  if (plan.draftChapter) {
    number += 1;
    const paragraphs = buildParagraphs(rand, plan.genre, rand.int(150, 700));
    const [row] = await tx
      .insert(chapters)
      .values({
        storyId,
        number,
        title: null,
        wordCount: countWords(paragraphs.join(' ')),
        status: 'draft',
      })
      .returning({ id: chapters.id });
    if (!row) throw new Error('Chapter insert returned no id');
    await tx.insert(chapterDrafts).values({ chapterId: row.id, docJson: toDoc(paragraphs) });
  }
  return { storyId, chapterCount: number };
}

const seedEnvSchema = dbEnvSchema.extend({ SEED_USER_PASSWORD: z.string().min(8) });

try {
  const { DATABASE_URL, SEED_USER_PASSWORD } = loadServerEnv(seedEnvSchema);
  assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: DATABASE_URL });

  const { db, pool } = createDb(DATABASE_URL, { max: 1 });
  try {
    await truncatePublicTables(db);
    const base = await seedDatabase(db, {
      hashPassword,
      password: SEED_USER_PASSWORD,
      renderContent: (doc) => render(doc),
    });
    console.log('[seed-demo] base seed:', base);

    const passwordHash = await hashPassword(SEED_USER_PASSWORD);
    const now = new Date();
    const rand = createRandom(20261005);

    const summary = await db.transaction(async (tx) => {
      const authorRows = await tx
        .insert(users)
        .values(
          DEMO_AUTHORS.map((a) => ({
            ...a,
            bio: a.bio || null,
            email: `${a.username}@novelhub.local`,
            emailVerified: true,
            role: 'author' as const,
            createdAt: new Date(now.getTime() - 300 * DAY_MS),
          })),
        )
        .returning({ id: users.id });
      await tx.insert(accounts).values(
        authorRows.map((u) => ({
          userId: u.id,
          accountId: u.id,
          providerId: 'credential',
          password: passwordHash,
        })),
      );

      const baseUsers = await tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.username, ['tac_gia_mau', 'doc_gia_mau']));
      const idOf = (username: string) => {
        const id = baseUsers.find((u) => u.username === username)?.id;
        if (!id) throw new Error(`Base seed user missing: ${username}`);
        return id;
      };

      const tagRows = await tx.select({ id: tags.id, slug: tags.slug }).from(tags);
      const tagIds = new Map(tagRows.map((t) => [t.slug, t.id]));

      // The base sample author gets a few more stories so their dashboard is not near-empty.
      const authorIds = [...authorRows.map((a) => a.id), idOf('tac_gia_mau')];
      const plans = planStories(rand, authorIds, now);
      const storyIds: string[] = [];
      let chapterCount = 0;
      for (const plan of plans) {
        const result = await insertStory(tx, rand, plan, tagIds, now);
        if (plan.visibility === 'published' && !plan.isMature && plan.publishedChapters > 0) {
          storyIds.push(result.storyId);
        }
        chapterCount += result.chapterCount;
      }

      // Library and reading history for the sample reader.
      const readerId = idOf('doc_gia_mau');
      const shelves = ['reading', 'reading', 'reading', 'plan', 'plan', 'done', 'dropped'] as const;
      const libraryStories = storyIds.slice(0, 10);
      for (const [i, storyId] of libraryStories.entries()) {
        const shelf = shelves[i % shelves.length] ?? 'reading';
        await tx.insert(libraryItems).values({
          userId: readerId,
          storyId,
          shelf,
          addedAt: new Date(now.getTime() - (i + 1) * DAY_MS),
        });
        if (shelf === 'plan') continue;
        const storyChapters = await tx
          .select({ id: chapters.id })
          .from(chapters)
          .where(and(eq(chapters.storyId, storyId), eq(chapters.status, 'published')))
          .orderBy(asc(chapters.number));
        const chapter = rand.pick(storyChapters);
        await tx.insert(readingProgress).values({
          userId: readerId,
          storyId,
          chapterId: chapter.id,
          scrollPct: rand.int(5, 95),
          updatedAt: new Date(now.getTime() - i * 3 * HOUR_MS),
        });
      }

      // A handful of open reports so the moderation queue has something to show.
      const reportTargets = storyIds.slice(12, 16);
      const reasons = ['plagiarism', 'mislabeled', 'spam', 'copyright'] as const;
      await tx.insert(reports).values(
        reportTargets.map((storyId, i) => ({
          reporterId: readerId,
          targetType: 'story',
          targetId: storyId,
          reason: reasons[i % reasons.length] ?? 'spam',
          detail: 'Báo cáo mẫu từ seed demo.',
          createdAt: new Date(now.getTime() - (i + 1) * 5 * HOUR_MS),
        })),
      );

      // Thirty days of daily readers so the rankings fill once the worker recomputes them; about a
      // quarter of the stories grow day by day, so "rising" has entries too.
      const statRows = storyIds.flatMap((storyId) => {
        const base = rand.int(3, 400);
        const growth = rand.chance(0.25) ? 1.08 : 0.99;
        return Array.from({ length: 30 }, (_, ago) => ({
          storyId,
          date: statsDate(new Date(now.getTime() - ago * DAY_MS)),
          uniqueReaders: Math.round(base * growth ** -ago * (0.7 + rand.next() * 0.6)),
        }));
      });
      await tx.insert(storyDailyStats).values(statRows);

      return {
        authors: authorRows.length,
        stories: plans.length,
        chapters: chapterCount,
        libraryItems: libraryStories.length,
        reports: reportTargets.length,
        storyDailyStats: statRows.length,
      };
    });
    console.log('[seed-demo] demo data:', summary);
    console.log('[seed-demo] next: pnpm search:reindex');
    console.log('[seed-demo] rankings fill when the worker runs (recomputed every 15 minutes)');
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error('[seed-demo] error:', describeDbError(err));
  process.exitCode = 1;
}
