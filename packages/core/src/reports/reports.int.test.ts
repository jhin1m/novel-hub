import { chapters, reports, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { reportListQuerySchema } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DUPLICATE_REASON } from '../dedupe/fingerprint-chapter';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { createReport } from './create-report';
import { listReports } from './list-reports';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function chapterId(storyId: string, number: number): Promise<string> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
  if (!row) throw new Error('chapter missing');
  return row.id;
}

async function setup() {
  const author = await makeAuthor(db, 'author');
  const story = await makePublishedStory(db, author, 2);
  const reader = await makeUser(db, 'reader_one');
  const mod = await makeUser(db, 'mod_one', 'mod');
  return { author, story, reader, mod };
}

describe('createReport', () => {
  it('files one open report per reader and target', async () => {
    const { story, reader } = await setup();
    const targets = [
      { type: 'story', storyPublicId: story.publicId },
      { type: 'chapter', storyPublicId: story.publicId, number: 2 },
      { type: 'user', username: 'author' },
    ] as const;
    for (const target of targets) {
      const input = { target, reason: 'spam' as const, detail: 'bản sao' };
      expect(await createReport(db, reader, input)).toEqual({ ok: true, value: { created: true } });
      expect(await createReport(db, reader, input)).toEqual({
        ok: true,
        value: { created: false },
      });
    }
    const rows = await db.select().from(reports);
    expect(rows.map((r) => r.targetType).sort()).toEqual(['chapter', 'story', 'user']);
    expect(rows.every((r) => r.status === 'open' && r.reporterId === reader.id)).toBe(true);

    // Once the first one is closed, the reader may report the target again.
    await db.update(reports).set({ status: 'dismissed' });
    const again = await createReport(db, reader, { target: targets[0], reason: 'plagiarism' });
    expect(again).toEqual({ ok: true, value: { created: true } });
  });

  it('makes one row out of concurrent identical submits', async () => {
    const { story, reader } = await setup();
    const input = {
      target: { type: 'story', storyPublicId: story.publicId },
      reason: 'spam',
    } as const;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createReport(db, reader, input)),
    );
    expect(results.filter((r) => r.ok && r.value.created)).toHaveLength(1);
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it('does not find targets nobody can see', async () => {
    const { author, story, reader } = await setup();
    await addChapter(db, author, story.publicId, true);
    await db
      .update(chapters)
      .set({ status: 'hidden_by_mod' })
      .where(eq(chapters.id, await chapterId(story.storyId, 1)));
    const notFound = { ok: false, error: 'NOT_FOUND' };
    const report = (target: Parameters<typeof createReport>[2]['target']) =>
      createReport(db, reader, { target, reason: 'spam' });

    expect(await report({ type: 'chapter', storyPublicId: story.publicId, number: 1 })).toEqual(
      notFound,
    );
    expect(await report({ type: 'chapter', storyPublicId: story.publicId, number: 3 })).toEqual(
      notFound,
    );
    expect(await report({ type: 'chapter', storyPublicId: story.publicId, number: 9 })).toEqual(
      notFound,
    );
    expect(await report({ type: 'story', storyPublicId: 'zzzzzzzz' })).toEqual(notFound);
    expect(await report({ type: 'user', username: 'nobody_here' })).toEqual(notFound);

    await db.update(users).set({ status: 'banned' }).where(eq(users.username, 'author'));
    expect(await report({ type: 'user', username: 'author' })).toEqual(notFound);
    expect(await report({ type: 'story', storyPublicId: story.publicId })).toEqual(notFound);
    await db.update(users).set({ status: 'active' }).where(eq(users.username, 'author'));

    await db.update(stories).set({ visibility: 'draft' }).where(eq(stories.id, story.storyId));
    expect(await report({ type: 'story', storyPublicId: story.publicId })).toEqual(notFound);
    expect(await db.select().from(reports)).toEqual([]);
  });
});

describe('listReports', () => {
  it('is for active moderators only', async () => {
    const { reader, mod } = await setup();
    const query = reportListQuerySchema.parse({});
    expect(await listReports(db, reader, query)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await listReports(db, { ...mod, status: 'muted' }, query)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('translates every target to public keys and leaks no internal id but reportId', async () => {
    const { story, reader, mod } = await setup();
    const other = await makeAuthor(db, 'copier');
    const copy = await makePublishedStory(db, other, 1, 'Bản Chép');
    const original = await chapterId(story.storyId, 1);
    const copied = await chapterId(copy.storyId, 1);

    await createReport(db, reader, {
      target: { type: 'chapter', storyPublicId: story.publicId, number: 2 },
      reason: 'prohibited',
      detail: 'Nội dung cấm',
    });
    await createReport(db, reader, {
      target: { type: 'user', username: 'copier' },
      reason: 'spam',
    });
    await createReport(db, reader, {
      target: { type: 'story', storyPublicId: story.publicId },
      reason: 'mislabeled',
    });
    await db.insert(reports).values([
      {
        reporterId: null,
        targetType: 'chapter',
        targetId: copied,
        reason: DUPLICATE_REASON,
        detail: JSON.stringify({ matchedChapterId: original, jaccard: 0.913, hamming: 3 }),
      },
      {
        reporterId: null,
        targetType: 'chapter',
        targetId: await chapterId(story.storyId, 2),
        reason: DUPLICATE_REASON,
        detail: '{not json',
      },
    ]);

    const result = await listReports(db, mod, reportListQuerySchema.parse({}));
    if (!result.ok) throw new Error(result.error);
    const { items, totalPages } = result.value;
    expect(totalPages).toBe(1);
    expect(items).toHaveLength(5);

    const storyContext = {
      publicId: story.publicId,
      slug: story.slug,
      title: 'Kiếm Đạo Độc Tôn',
      visibility: 'published',
      author: { username: 'author', displayName: 'Lâm Phong', role: 'author', status: 'active' },
    };
    const byReason = new Map(items.map((item) => [item.reason, item]));
    expect(byReason.get('prohibited')).toMatchObject({
      status: 'open',
      detail: 'Nội dung cấm',
      reporter: { username: 'reader_one' },
      handledBy: null,
      openOnTarget: 2,
      target: {
        type: 'chapter',
        story: storyContext,
        chapter: { number: 2, title: null, status: 'published', deleted: false },
      },
      duplicateOf: null,
    });
    expect(byReason.get('mislabeled')?.target).toEqual({ type: 'story', story: storyContext });
    expect(byReason.get('spam')?.target).toEqual({
      type: 'user',
      user: { username: 'copier', displayName: 'Lâm Phong', role: 'author', status: 'active' },
    });

    const duplicates = items.filter((item) => item.reason === 'duplicate');
    const translated = duplicates.find((item) => item.duplicateOf !== null);
    expect(translated).toMatchObject({
      reporter: null,
      detail: null,
      target: { type: 'chapter', story: { publicId: copy.publicId }, chapter: { number: 1 } },
      duplicateOf: {
        story: storyContext,
        chapter: { number: 1, status: 'published' },
        similarityPct: 91,
      },
    });
    // A malformed detail only drops the matched chapter.
    expect(duplicates.filter((item) => item.duplicateOf === null)).toHaveLength(1);

    const ids = new Set(items.map((item) => item.reportId));
    const leaked = (JSON.stringify(result.value).match(UUID) ?? []).filter((id) => !ids.has(id));
    expect(leaked).toEqual([]);
  });

  it('filters by status and reason and pages', async () => {
    const { story, reader, mod } = await setup();
    await createReport(db, reader, {
      target: { type: 'story', storyPublicId: story.publicId },
      reason: 'spam',
    });
    await createReport(db, reader, {
      target: { type: 'user', username: 'author' },
      reason: 'spam',
    });
    await db
      .update(reports)
      .set({ status: 'resolved', handledBy: mod.id })
      .where(eq(reports.targetType, 'user'));

    const list = async (raw: Record<string, unknown>) => {
      const result = await listReports(db, mod, reportListQuerySchema.parse(raw));
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    expect((await list({})).items.map((i) => i.target.type)).toEqual(['story']);
    expect((await list({ status: 'resolved' })).items).toMatchObject([
      { target: { type: 'user' }, handledBy: { username: 'mod_one' }, openOnTarget: 0 },
    ]);
    expect((await list({ reason: 'copyright' })).items).toEqual([]);
    expect(await list({ page: '5' })).toEqual({ items: [], page: 5, totalPages: 1 });
  });
});
