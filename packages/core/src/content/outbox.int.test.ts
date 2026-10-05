import { contentEvents } from '@novel-hub/db';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { asc, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentChange, ContentJob } from './hooks';
import { drainContentEvents, recordContentChanges } from './outbox';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

const STORY = '01920000-0000-7000-8000-000000000001';
const change = (n: number): ContentChange => ({
  entity: 'chapter',
  action: 'published',
  storyId: STORY,
  chapterId: STORY,
  chapterNumber: n,
});
/** Stands in for the real mapping with exactly one job per change. */
const oneJobEach = (c: ContentChange): ContentJob[] => [
  { name: 'purge-urls', data: { n: c.entity === 'chapter' ? c.chapterNumber : 0 } },
];

async function rows() {
  return db.select().from(contentEvents).orderBy(asc(contentEvents.id));
}

describe('recordContentChanges', () => {
  it('writes inside the caller transaction and disappears with a rollback', async () => {
    await recordContentChanges(db, []);
    await expect(
      db.transaction(async (tx) => {
        await recordContentChanges(tx, [change(1)]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows()).toEqual([]);
    await db.transaction((tx) => recordContentChanges(tx, [change(1), change(2)]));
    expect((await rows()).map((r) => r.payload)).toEqual([change(1), change(2)]);
  });

  it('refuses invalid changes at the source', async () => {
    await expect(
      recordContentChanges(db, [{ ...change(1), chapterId: 'x' } as ContentChange]),
    ).rejects.toThrow();
  });
});

describe('drainContentEvents', () => {
  it('keeps events pending when the queue refuses them, then delivers on the next tick', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordContentChanges(db, [change(1), change(2)]);
    const addBulk = vi.fn().mockRejectedValueOnce(new Error('Redis down')).mockResolvedValue([]);
    const deps = { db, contentQueue: { addBulk }, mapChange: oneJobEach };

    expect(await drainContentEvents(deps)).toEqual({ enqueued: 0, failed: 2 });
    expect((await rows()).map((r) => [r.processedAt, r.attempts])).toEqual([
      [null, 1],
      [null, 1],
    ]);
    expect(error.mock.calls.flat().join(' ')).toContain('Redis down');

    expect(await drainContentEvents(deps)).toEqual({ enqueued: 2, failed: 0 });
    expect(addBulk).toHaveBeenLastCalledWith([
      { name: 'purge-urls', data: { n: 1 } },
      { name: 'purge-urls', data: { n: 2 } },
    ]);
    expect((await rows()).every((r) => r.processedAt !== null)).toBe(true);
    expect(await drainContentEvents(deps)).toEqual({ enqueued: 0, failed: 0 });
    expect(addBulk).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('never enqueues an event twice when two drains run together', async () => {
    await recordContentChanges(
      db,
      Array.from({ length: 30 }, (_, i) => change(i + 1)),
    );
    const seen: number[] = [];
    const addBulk = vi.fn(async (jobs: ContentJob[]) => {
      // Slow enough that both drains are inside their transaction at the same time.
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const job of jobs) seen.push((job.data as { n: number }).n);
      return [];
    });
    const deps = { db, contentQueue: { addBulk }, mapChange: oneJobEach, batchSize: 10 };
    const results = await Promise.all([drainContentEvents(deps), drainContentEvents(deps)]);
    expect(results.reduce((sum, r) => sum + r.enqueued, 0)).toBe(30);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('keeps an event whose mapping throws pending without blocking the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordContentChanges(db, [change(1), change(2)]);
    const addBulk = vi.fn().mockResolvedValue([]);
    const mapChange = (c: ContentChange) => {
      if (c.entity === 'chapter' && c.chapterNumber === 1) throw new Error('bad mapping');
      return oneJobEach(c);
    };
    expect(await drainContentEvents({ db, contentQueue: { addBulk }, mapChange })).toEqual({
      enqueued: 1,
      failed: 0,
    });
    expect((await rows()).map((r) => [r.processedAt === null, r.attempts])).toEqual([
      [true, 1],
      [false, 0],
    ]);
    error.mockRestore();
  });

  it('marks malformed payloads processed without enqueuing them', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.insert(contentEvents).values({ payload: { entity: 'unknown', secret: 'x' } });
    const addBulk = vi.fn().mockResolvedValue([]);
    expect(await drainContentEvents({ db, contentQueue: { addBulk } })).toEqual({
      enqueued: 0,
      failed: 0,
    });
    expect(addBulk).not.toHaveBeenCalled();
    expect((await rows())[0]?.processedAt).not.toBeNull();
    const logged = error.mock.calls.flat().join(' ');
    expect(logged).toContain('malformed');
    expect(logged).not.toContain('secret');
    error.mockRestore();
  });

  it('needs no queue call for changes without jobs and prunes old processed events', async () => {
    await recordContentChanges(db, [change(1)]);
    await db.insert(contentEvents).values([
      { payload: change(2), processedAt: sql`now() - interval '8 days'` },
      { payload: change(3), processedAt: sql`now() - interval '6 days'` },
    ]);
    const addBulk = vi.fn().mockResolvedValue([]);
    const noJobs = () => [];
    expect(await drainContentEvents({ db, contentQueue: { addBulk }, mapChange: noJobs })).toEqual({
      enqueued: 1,
      failed: 0,
    });
    expect(addBulk).not.toHaveBeenCalled();
    const left = (await rows()).map((r) => (r.payload as { chapterNumber: number }).chapterNumber);
    expect(left.sort()).toEqual([1, 3]);
  });

  it('by default turns every change into a purge job and a search sync', async () => {
    await recordContentChanges(db, [change(1)]);
    const addBulk = vi.fn().mockResolvedValue([]);
    await drainContentEvents({ db, contentQueue: { addBulk } });
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'purge-urls', data: change(1) }),
      expect.objectContaining({ name: 'search-sync', data: { kind: 'story', storyId: STORY } }),
    ]);
  });
});
