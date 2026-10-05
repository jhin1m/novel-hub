import {
  type ContentJob,
  createChapter,
  createStory,
  fingerprintChapter,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { chapters, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeContentJob } from '../content-router';
import { processBackfillFingerprints } from './backfill-fingerprints';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** Publishes `count` chapters of 300 words in one new story. */
async function publishChapters(count: number): Promise<void> {
  const [user] = await db
    .insert(users)
    .values({ username: 'author', displayName: 'A', email: 'a@example.com', emailVerified: true })
    .returning();
  if (!user) throw new Error('user insert failed');
  const actor = { id: user.id, role: user.role, status: user.status, emailVerified: true };
  const story = await createStory(db, actor, {
    title: 'Truyện Bù',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const { publicId } = story.value;
  for (let n = 1; n <= count; n++) {
    const created = await createChapter(db, actor, publicId);
    if (!created.ok) throw new Error(created.error);
    const text = Array.from({ length: 300 }, (_, i) => `chữ${n}x${i}`).join(' ');
    const saved = await saveDraft(db, actor, publicId, n, {
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
      },
      baseUpdatedAt: created.value.draftUpdatedAt ?? '',
    });
    if (!saved.ok) throw new Error(saved.error);
    const done = await publishChapter(db, actor, publicId, n, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!done.ok) throw new Error(done.error);
  }
}

describe('fingerprint backfill (real Postgres)', () => {
  it('enqueues the chapters without a fingerprint, without a jobId, and they then drop out', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await publishChapters(3);
    const ids = (await db.select({ id: chapters.id }).from(chapters)).map((row) => row.id).sort();
    await fingerprintChapter(db, ids[0] as string);

    const added: ContentJob[] = [];
    const addBulk = vi.fn((jobs: ContentJob[]) => {
      added.push(...jobs);
      return Promise.resolve([]);
    });
    expect(await processBackfillFingerprints({ db, contentQueue: { addBulk } })).toBe(2);
    expect(added).toEqual(
      ids.slice(1).map((chapterId) => ({ name: 'fingerprint-chapter', data: { chapterId } })),
    );

    // The content worker runs the enqueued jobs; the next backfill finds nothing left.
    const contentDeps = { db, cdn: { purge: () => Promise.resolve() }, appUrl: '', search: null };
    for (const job of added) await routeContentJob(job, contentDeps);
    expect(await processBackfillFingerprints({ db, contentQueue: { addBulk } })).toBe(0);
    expect(addBulk).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});
