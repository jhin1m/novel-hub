import {
  createChapter,
  createContentQueue,
  createProducerConnection,
  createStory,
  createWorkerConnection,
  recordContentChanges,
  saveDraft,
  scheduleChapter,
} from '@novel-hub/core';
import { chapters, contentEvents, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { PUBLISHING_JOBS } from '@novel-hub/shared';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import type { Worker } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPublishingQueue,
  createPublishingWorker,
  registerPublishingSchedulers,
} from './publishing-worker';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
// A prefix per run so jobs never mix with dev jobs or earlier runs.
const PREFIX = `test-publishing-${Date.now().toString(36)}`;

const { db, pool } = createTestDb();
const producer = createProducerConnection(TEST_REDIS_URL);
const contentQueue = createContentQueue(producer, PREFIX);
const publishingQueue = createPublishingQueue(producer, PREFIX);
const workerRedis = createWorkerConnection(TEST_REDIS_URL);
let worker: Worker | undefined;

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

afterAll(async () => {
  await worker?.close();
  await publishingQueue.obliterate({ force: true });
  await contentQueue.obliterate({ force: true });
  await publishingQueue.close();
  await contentQueue.close();
  producer.disconnect();
  workerRedis.disconnect();
  await pool.end();
});

/** Starts the worker once and resolves when a job of `name` completes. */
function nextCompleted(name: string): Promise<void> {
  worker ??= createPublishingWorker(workerRedis, PREFIX, { db, contentQueue });
  const current = worker;
  return new Promise((resolve, reject) => {
    const onCompleted = (job: { name: string }) => {
      if (job.name !== name) return;
      current.off('completed', onCompleted);
      current.off('failed', onFailed);
      resolve();
    };
    const onFailed = (_job: unknown, err: Error) => reject(err);
    current.on('completed', onCompleted);
    current.on('failed', onFailed);
  });
}

async function scheduledChapter(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ username: 'author', displayName: 'A', email: 'a@example.com', emailVerified: true })
    .returning();
  if (!user) throw new Error('user insert failed');
  const actor = { id: user.id, role: user.role, status: user.status, emailVerified: true };
  const story = await createStory(db, actor, {
    title: 'Truyện Hẹn Giờ',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const { publicId } = story.value;
  const created = await createChapter(db, actor, publicId);
  if (!created.ok) throw new Error(created.error);
  const text = Array.from({ length: 300 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, actor, publicId, 1, {
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { pid: 'k7m2xq9p' }, content: [{ type: 'text', text }] },
      ],
    },
    baseUpdatedAt: created.value.draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  const scheduled = await scheduleChapter(db, actor, publicId, 1, {
    baseUpdatedAt: saved.value.updatedAt,
    scheduledAt: new Date(Date.now() + 3_600_000),
  });
  if (!scheduled.ok) throw new Error(scheduled.error);
  // Pretend the publish time has passed.
  await pool.query(`update chapters set scheduled_at = now() - interval '1 minute'`);
  return publicId;
}

describe('publishing worker (real Redis and Postgres)', () => {
  it('registers each periodic job once, however often it is called', async () => {
    await registerPublishingSchedulers(publishingQueue);
    await registerPublishingSchedulers(publishingQueue);
    const schedulers = await publishingQueue.getJobSchedulers();
    expect(schedulers.map((s) => [s.key, s.every]).sort()).toEqual([
      [PUBLISHING_JOBS.drainContentEvents, 5_000],
      [PUBLISHING_JOBS.sweepScheduledChapters, 60_000],
    ]);
    await publishingQueue.removeJobScheduler(PUBLISHING_JOBS.drainContentEvents);
    await publishingQueue.removeJobScheduler(PUBLISHING_JOBS.sweepScheduledChapters);
  });

  it('a sweep job publishes due chapters and a drain job empties the outbox', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await scheduledChapter();

    const swept = nextCompleted(PUBLISHING_JOBS.sweepScheduledChapters);
    await publishingQueue.add(PUBLISHING_JOBS.sweepScheduledChapters, null);
    await swept;
    const [chapter] = await db.select().from(chapters);
    expect(chapter?.status).toBe('published');
    const pending = await db.select().from(contentEvents);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((e) => e.processedAt === null)).toBe(true);

    await recordContentChanges(db, [
      { entity: 'user', action: 'updated', userId: chapter?.storyId ?? '' },
    ]);
    const drained = nextCompleted(PUBLISHING_JOBS.drainContentEvents);
    await publishingQueue.add(PUBLISHING_JOBS.drainContentEvents, null);
    await drained;
    const left = await db.select().from(contentEvents);
    expect(left.length).toBe(pending.length + 1);
    expect(left.every((e) => e.processedAt !== null)).toBe(true);
    expect(info).toHaveBeenCalledWith('[publishing] published 1 scheduled chapters');
    info.mockRestore();
  });
});
