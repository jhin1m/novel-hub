import { chapterFingerprints, chapters, reports } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { duplicateReportDetail } from '@novel-hub/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { StoryActor } from '../policies/story';
import { deleteChapter } from '../publishing/delete-chapter';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listChaptersNeedingFingerprint } from './backfill';
import { fingerprintChapter } from './fingerprint-chapter';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** 400 words that differ per `seed`, so chapters only match when they share a seed. */
const prose = (seed: string) =>
  Array.from({ length: 400 }, (_, i) => `${seed}${i % 7 === 0 ? 'đạo' : 'kiếm'}${i}`).join(' ');

/** A story of `author` with one published chapter of `text`; returns the chapter id and story key. */
async function publishedChapter(author: StoryActor, text: string, title = 'Kiếm Đạo') {
  const story = await makePublishedStory(db, author, 0, title);
  const number = await addChapter(db, author, story.publicId, false, text);
  return { ...story, number, chapterId: await chapterId(story.storyId, number) };
}

async function chapterId(storyId: string, number: number): Promise<string> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
  if (!row) throw new Error('chapter missing');
  return row.id;
}

const allReports = () => db.select().from(reports);

describe('fingerprintChapter', () => {
  it('files exactly one report on the later copy by another author, however often it runs', async () => {
    const original = await publishedChapter(await makeAuthor(db, 'goc'), prose('a'));
    const copy = await publishedChapter(await makeAuthor(db, 'chep'), prose('a'), 'Bản Chép');

    expect(await fingerprintChapter(db, original.chapterId)).toEqual({
      status: 'stored',
      bestJaccard: null,
    });
    const first = await fingerprintChapter(db, copy.chapterId);
    expect(first).toEqual({ status: 'reported', bestJaccard: 1, reportsFiled: 1 });
    // Repeated, concurrent and reverse-direction runs all land on the same open report.
    await fingerprintChapter(db, copy.chapterId);
    const concurrent = await Promise.all([
      fingerprintChapter(db, copy.chapterId),
      fingerprintChapter(db, copy.chapterId),
      fingerprintChapter(db, original.chapterId),
    ]);
    expect(concurrent.map((r) => r.status)).toEqual([
      'already_reported',
      'already_reported',
      'already_reported',
    ]);

    const rows = await allReports();
    expect(rows).toHaveLength(1);
    const [report] = rows;
    expect(report).toMatchObject({
      reporterId: null,
      targetType: 'chapter',
      targetId: copy.chapterId,
      reason: 'duplicate',
      status: 'open',
    });
    const detail = duplicateReportDetail.parse(JSON.parse(report?.detail ?? ''));
    expect(detail).toMatchObject({ matchedChapterId: original.chapterId, jaccard: 1 });
    expect(detail.hamming).toBeLessThanOrEqual(3);

    // Nothing is hidden: a moderator decides.
    const [still] = await db.select().from(chapters).where(eq(chapters.id, copy.chapterId));
    expect(still?.status).toBe('published');
  });

  it('files one report when a copy and its original are checked at the same time', async () => {
    const original = await publishedChapter(await makeAuthor(db, 'goc'), prose('a'));
    const copy = await publishedChapter(await makeAuthor(db, 'chep'), prose('a'), 'Bản Chép');
    const results = await Promise.all([
      fingerprintChapter(db, copy.chapterId),
      fingerprintChapter(db, original.chapterId),
      fingerprintChapter(db, copy.chapterId),
    ]);
    // Each run commits its fingerprint before looking, so at least one sees the other.
    expect(results.some((r) => r.status === 'reported')).toBe(true);
    const rows = await allReports();
    expect(rows.map((r) => r.targetId)).toEqual([copy.chapterId]);
  });

  it('reports every copy of an original, whatever order the chapters are checked in', async () => {
    const original = await publishedChapter(await makeAuthor(db, 'goc'), prose('a'));
    const words = prose('a').split(' ');
    for (let i = 100; i < 110; i++) words[i] = `khac${i}`;
    const edited = await publishedChapter(await makeAuthor(db, 'chep_sua'), words.join(' '), 'Sửa');
    const exact = await publishedChapter(await makeAuthor(db, 'chep_y'), prose('a'), 'Y Nguyên');

    await fingerprintChapter(db, exact.chapterId);
    await fingerprintChapter(db, edited.chapterId);
    await fingerprintChapter(db, original.chapterId);

    const targets = (await allReports()).map((r) => r.targetId).sort();
    expect(targets).toEqual([edited.chapterId, exact.chapterId].sort());
  });

  it('ignores the same author and unrelated text', async () => {
    const author = await makeAuthor(db, 'mot_tac_gia');
    const a = await publishedChapter(author, prose('a'));
    const b = await publishedChapter(author, prose('a'), 'Truyện Hai');
    const other = await publishedChapter(await makeAuthor(db, 'khac'), prose('z'), 'Khác');
    await fingerprintChapter(db, a.chapterId);
    expect((await fingerprintChapter(db, b.chapterId)).status).toBe('stored');
    const unrelated = await fingerprintChapter(db, other.chapterId);
    expect(unrelated.status).toBe('stored');
    expect(unrelated.bestJaccard ?? 0).toBeLessThan(0.1);
    expect(await allReports()).toEqual([]);
  });

  it('never matches a soft-deleted chapter', async () => {
    const author = await makeAuthor(db, 'goc');
    const original = await publishedChapter(author, prose('a'));
    await fingerprintChapter(db, original.chapterId);
    const deleted = await deleteChapter(db, author, original.publicId, original.number);
    expect(deleted.ok).toBe(true);

    const copy = await publishedChapter(await makeAuthor(db, 'chep'), prose('a'), 'Bản Chép');
    expect((await fingerprintChapter(db, copy.chapterId)).status).toBe('stored');
    expect((await fingerprintChapter(db, original.chapterId)).status).toBe('skipped');
    expect(await allReports()).toEqual([]);
  });

  it('skips a chapter that is not published any more, without storing a fingerprint', async () => {
    const author = await makeAuthor(db, 'goc');
    const story = await makePublishedStory(db, author, 0);
    const number = await addChapter(db, author, story.publicId, true, prose('a'));
    const draftId = await chapterId(story.storyId, number);
    expect(await fingerprintChapter(db, draftId)).toEqual({ status: 'skipped', bestJaccard: null });
    expect(await db.select().from(chapterFingerprints)).toEqual([]);
  });

  it('reuses a fingerprint computed from the current content', async () => {
    const { chapterId: id } = await publishedChapter(await makeAuthor(db, 'goc'), prose('a'));
    await fingerprintChapter(db, id);
    await db.update(chapterFingerprints).set({ simhash: 42n });
    await fingerprintChapter(db, id);
    const [kept] = await db.select().from(chapterFingerprints);
    expect(kept?.simhash).toBe(42n);

    await db.update(chapterFingerprints).set({ contentHash: 'stale' });
    await fingerprintChapter(db, id);
    const [recomputed] = await db.select().from(chapterFingerprints);
    expect(recomputed?.simhash).not.toBe(42n);
    expect(recomputed?.lshKeys).toHaveLength(16);
  });

  it('does not reopen a dismissed pair, but still reports a match with another chapter', async () => {
    const original = await publishedChapter(await makeAuthor(db, 'goc'), prose('a'));
    const copy = await publishedChapter(await makeAuthor(db, 'chep'), prose('a'), 'Bản Chép');
    await fingerprintChapter(db, original.chapterId);
    expect((await fingerprintChapter(db, copy.chapterId)).status).toBe('reported');
    await db.update(reports).set({ status: 'dismissed' });

    // A republish with the same content is checked again: the dismissed pair stays closed.
    await db.update(chapterFingerprints).set({ contentHash: 'stale' });
    expect((await fingerprintChapter(db, copy.chapterId)).status).toBe('stored');
    expect(await db.$count(reports, eq(reports.status, 'open'))).toBe(0);

    // A third author's chapter published before the copy is a different pair.
    const third = await publishedChapter(await makeAuthor(db, 'thu_ba'), prose('a'), 'Thứ Ba');
    await db
      .update(chapters)
      .set({
        publishedAt: sql`(select published_at from chapters where id = ${copy.chapterId}) - interval '1 minute'`,
      })
      .where(eq(chapters.id, third.chapterId));
    await fingerprintChapter(db, third.chapterId);
    await fingerprintChapter(db, copy.chapterId);
    const open = await db.select().from(reports).where(eq(reports.status, 'open'));
    const onCopy = open.filter((r) => r.targetId === copy.chapterId);
    expect(onCopy).toHaveLength(1);
    expect(duplicateReportDetail.parse(JSON.parse(onCopy[0]?.detail ?? '')).matchedChapterId).toBe(
      third.chapterId,
    );
  });
});

describe('listChaptersNeedingFingerprint', () => {
  it('lists published chapters with a missing or stale fingerprint, in id order', async () => {
    const author = await makeAuthor(db, 'goc');
    const story = await makePublishedStory(db, author, 0);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const number = await addChapter(db, author, story.publicId, false, prose(`s${i}`));
      ids.push(await chapterId(story.storyId, number));
    }
    const [missing, fresh, stale, deleted] = ids as [string, string, string, string];
    await fingerprintChapter(db, fresh);
    await fingerprintChapter(db, stale);
    await db
      .update(chapterFingerprints)
      .set({ contentHash: 'stale' })
      .where(eq(chapterFingerprints.chapterId, stale));
    await deleteChapter(db, author, story.publicId, 4);
    await addChapter(db, author, story.publicId, true, prose('nhap'));

    const all = await listChaptersNeedingFingerprint(db, 10);
    expect(all).toEqual([missing, stale].sort());
    expect(all).not.toContain(deleted);
    expect(await listChaptersNeedingFingerprint(db, 1)).toEqual(all.slice(0, 1));
    expect(await listChaptersNeedingFingerprint(db, 10, all[0])).toEqual(all.slice(1));
  });
});
