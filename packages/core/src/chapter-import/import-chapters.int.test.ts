import {
  chapterDrafts,
  chapterRevisions,
  chapters,
  contentEvents,
  stories,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import type { ChapterImportInput } from '@novel-hub/shared';
import { type EditorDocJson, docToText } from '@novel-hub/shared/editor';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createChapter } from '../chapters/create-chapter';
import { saveDraft } from '../chapters/drafts';
import type { StoryActor } from '../policies/story';
import { publishChapter } from '../publishing/publish-chapter';
import { scheduleChapter } from '../publishing/schedule-chapter';
import { createStory } from '../stories/create-story';
import { importChapters } from './import-chapters';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date();

type Actor = StoryActor & { createdAt: Date };

async function makeUser(username: string, ageDays = 8): Promise<Actor> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      emailVerified: true,
      createdAt: new Date(NOW.getTime() - ageDays * DAY),
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
  };
}

async function makeStory(actor: Actor): Promise<string> {
  const result = await createStory(db, actor, {
    title: 'Kiếm Đạo Độc Tôn',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.publicId;
}

/** Text of `words` words over a few lines, as the client sends it. */
function chapterText(words: number, seed = 'chữ'): string {
  const all = Array.from({ length: words }, (_, i) => `${seed}${i}`);
  const lines: string[] = [];
  for (let i = 0; i < all.length; i += 50) lines.push(all.slice(i, i + 50).join(' '));
  return lines.join('\n');
}

function input(
  mode: ChapterImportInput['mode'],
  count: number,
  extra: Partial<ChapterImportInput> = {},
): ChapterImportInput {
  return {
    mode,
    chapters: Array.from({ length: count }, (_, i) => ({
      title: `Tên ${i + 1}`,
      text: chapterText(320, `c${i}w`),
    })),
    ...extra,
  };
}

const storyChapters = (publicId: string) =>
  db
    .select({
      id: chapters.id,
      number: chapters.number,
      title: chapters.title,
      status: chapters.status,
      scheduledAt: chapters.scheduledAt,
      doc: chapterDrafts.docJson,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(chapterDrafts, eq(chapterDrafts.chapterId, chapters.id))
    .where(eq(stories.publicId, publicId))
    .orderBy(asc(chapters.number));

describe('importChapters', () => {
  it('creates numbered drafts after the last chapter, with titles and content', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    await createChapter(db, author, publicId);

    const result = await importChapters(
      db,
      author,
      publicId,
      {
        mode: 'draft',
        chapters: [
          { title: 'Mở đầu', text: 'Dòng một\n\nDòng hai' },
          { title: '', text: 'Không tên' },
          { text: 'Ngắn' },
        ],
      },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: { created: 3, firstNumber: 2, lastNumber: 4, published: 0 },
    });
    const rows = await storyChapters(publicId);
    expect(rows.map((row) => [row.number, row.title, row.status])).toEqual([
      [1, null, 'draft'],
      [2, 'Mở đầu', 'draft'],
      [3, null, 'draft'],
      [4, null, 'draft'],
    ]);
    expect(docToText(rows[1]?.doc as EditorDocJson)).toBe('Dòng một\nDòng hai');
  });

  it('drops NUL characters, which Postgres cannot store', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const result = await importChapters(
      db,
      author,
      publicId,
      { mode: 'draft', chapters: [{ title: 'Tên\u0000', text: 'Một\u0000 hai' }] },
      NOW,
    );
    expect(result.ok).toBe(true);
    const [row] = await storyChapters(publicId);
    expect(row?.title).toBe('Tên');
    expect(docToText(row?.doc as EditorDocJson)).toBe('Một hai');
  });

  it('publishes each chapter through the publish service', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const result = await importChapters(db, author, publicId, input('publish', 3), NOW);
    expect(result).toEqual({
      ok: true,
      value: { created: 3, firstNumber: 1, lastNumber: 3, published: 3 },
    });
    const rows = await storyChapters(publicId);
    expect(rows.map((row) => row.status)).toEqual(['published', 'published', 'published']);
    expect(await db.$count(chapterRevisions)).toBe(3);
    expect(await db.$count(contentEvents)).toBeGreaterThanOrEqual(3);
    const [story] = await db.select().from(stories).where(eq(stories.publicId, publicId));
    expect(story).toMatchObject({ visibility: 'published', chapterCount: 3 });
  });

  it('schedules chapters at even intervals from the start time', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const start = new Date(NOW.getTime() + DAY);
    const result = await importChapters(
      db,
      author,
      publicId,
      input('schedule', 3, { schedule: { startAt: start.toISOString(), intervalHours: 6 } }),
      NOW,
    );
    expect(result.ok && result.value.published).toBe(3);
    const rows = await storyChapters(publicId);
    expect(rows.map((row) => row.status)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(rows.map((row) => row.scheduledAt?.getTime())).toEqual([
      start.getTime(),
      start.getTime() + 6 * HOUR,
      start.getTime() + 12 * HOUR,
    ]);
  });

  it('writes nothing when any check fails before writing', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const short = input('publish', 3);
    short.chapters[1] = { title: 'Ngắn', text: chapterText(200) };
    const tooMany = input('publish', 31);
    const pastStart = input('schedule', 2, {
      schedule: { startAt: new Date(NOW.getTime() - HOUR).toISOString(), intervalHours: 1 },
    });
    const lines = (count: number) => Array.from({ length: count }, () => 'a').join('\n');
    // Each line becomes a paragraph node: 30,000 one-letter lines are over 2 MB of JSON.
    const huge: ChapterImportInput = { mode: 'draft', chapters: [{ text: lines(30_000) }] };
    // Each chapter fits in 2 MB, but together they pass the paragraph cap of an import.
    const manyLines: ChapterImportInput = {
      mode: 'draft',
      chapters: Array.from({ length: 3 }, () => ({ text: lines(17_000) })),
    };
    const empty: ChapterImportInput = { mode: 'publish', chapters: [{ text: ' \n ' }] };

    for (const bad of [short, tooMany, pastStart, huge, manyLines, empty]) {
      expect(await importChapters(db, author, publicId, bad, NOW)).toEqual({
        ok: false,
        error: 'CHAPTER_IMPORT_INVALID',
      });
    }
    expect(await db.$count(chapters)).toBe(0);
  });

  it('keeps the numbers of two parallel imports in separate runs', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const [a, b] = await Promise.all([
      importChapters(db, author, publicId, input('draft', 5), NOW),
      importChapters(db, author, publicId, input('draft', 5), NOW),
    ]);
    const firsts = [a, b].map((r) => (r.ok ? r.value.firstNumber : 0)).sort();
    expect(firsts).toEqual([1, 6]);
    const rows = await storyChapters(publicId);
    // Titles run 1..5 twice: no import got numbers inside the other's range.
    expect(rows.map((row) => row.title)).toEqual([
      ...input('draft', 5).chapters.map((c) => c.title),
      ...input('draft', 5).chapters.map((c) => c.title),
    ]);
  });

  it('stops at the first chapter that fails to publish and leaves the rest as drafts', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const result = await importChapters(db, author, publicId, input('publish', 3), NOW, {
      schedule: scheduleChapter,
      // Another tab saves chapter 2 just before it is published: a real draft conflict.
      publish: async (dbArg, actor, id, number, opts) => {
        if (number === 2) {
          const saved = await saveDraft(dbArg, actor, id, number, {
            doc: { type: 'doc', content: [{ type: 'paragraph' }] },
            baseUpdatedAt: opts.baseUpdatedAt,
          });
          expect(saved.ok).toBe(true);
        }
        return publishChapter(dbArg, actor, id, number, opts);
      },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        created: 3,
        firstNumber: 1,
        lastNumber: 3,
        published: 1,
        failedAt: 2,
        code: 'DRAFT_CONFLICT',
      },
    });
    const rows = await storyChapters(publicId);
    expect(rows.map((row) => row.status)).toEqual(['published', 'draft', 'draft']);
  });

  it('reports a thrown error as the stopping point', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const result = await importChapters(db, author, publicId, input('publish', 2), NOW, {
      schedule: scheduleChapter,
      publish: () => Promise.reject(new Error('boom')),
    });
    expect(result.ok && [result.value.published, result.value.failedAt, result.value.code]).toEqual(
      [0, 1, 'INTERNAL_ERROR'],
    );
    expect(await db.$count(chapters)).toBe(2);
  });

  it('refuses another user, a new account and a muted one', async () => {
    const author = await makeUser('tac_gia');
    const publicId = await makeStory(author);
    const other = await makeUser('nguoi_khac');
    expect(await importChapters(db, other, publicId, input('draft', 1), NOW)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    const young = { ...author, createdAt: new Date(NOW.getTime() - 6 * DAY) };
    expect(await importChapters(db, young, publicId, input('draft', 1), NOW)).toEqual({
      ok: false,
      error: 'ACCOUNT_TOO_NEW',
    });
    const muted = { ...author, status: 'muted' as const };
    expect(await importChapters(db, muted, publicId, input('draft', 1), NOW)).toEqual({
      ok: false,
      error: 'USER_MUTED',
    });
    expect(await importChapters(db, author, 'zzzzzzzz', input('draft', 1), NOW)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await db.$count(chapters)).toBe(0);
  });
});
