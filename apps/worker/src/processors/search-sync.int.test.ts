import {
  type CdnPurger,
  type ContentJob,
  type StoryDoc,
  createSearchCtx,
  createStory,
  drainContentEvents,
  recordContentChanges,
} from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { CONTENT_JOBS } from '@novel-hub/shared';
import { loadServerEnv, meiliWorkerEnvSchema } from '@novel-hub/shared/env';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { routeContentJob } from '../content-router';
import { createSearchWriter } from './search-sync';

const { db, pool } = createTestDb();
const meili = loadServerEnv(meiliWorkerEnvSchema);
const ctx = createSearchCtx({
  url: meili.MEILI_URL,
  apiKey: meili.MEILI_MASTER_KEY,
  prefix: `test_${Math.random().toString(36).slice(2, 10)}`,
});
const cdn: CdnPurger = { purge: () => Promise.resolve() };
const deps = { db, cdn, appUrl: 'http://localhost:3000', search: createSearchWriter(ctx) };

afterAll(async () => {
  await ctx.client.deleteIndexIfExists(ctx.names.stories);
  await ctx.client.deleteIndexIfExists(ctx.names.authors);
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

describe('search-sync job (outbox → queue → processor, real Meilisearch)', () => {
  it('applies two changes to the same story recorded back to back', async () => {
    const [user] = await db
      .insert(users)
      .values({ username: 'tac_gia', displayName: 'T', email: 't@example.com' })
      .returning();
    if (!user) throw new Error('user insert failed');
    const actor = { id: user.id, role: user.role, status: user.status, emailVerified: true };
    const created = await createStory(db, actor, {
      title: 'Tên Một',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    if (!created.ok) throw new Error(created.error);
    const { publicId } = created.value;
    const { rows } = await pool.query<{ id: string }>(
      'select id from stories where public_id = $1',
      [publicId],
    );
    const storyId = rows[0]?.id;
    if (!storyId) throw new Error('story missing');

    // Two edits, each committed with its outbox event, before the worker drains anything.
    for (const title of ['Tên Hai', 'Tên Ba']) {
      await pool.query(`update stories set title = $1, visibility = 'published' where id = $2`, [
        title,
        storyId,
      ]);
      await recordContentChanges(db, [{ entity: 'story', action: 'updated', storyId }]);
    }

    const queued: ContentJob[] = [];
    await drainContentEvents({
      db,
      contentQueue: {
        addBulk: (jobs) => {
          queued.push(...(jobs as ContentJob[]));
          return Promise.resolve([]);
        },
      },
    });
    const syncs = queued.filter((job) => job.name === CONTENT_JOBS.searchSync);
    expect(syncs).toHaveLength(2);
    for (const job of queued) await routeContentJob(job, deps);

    const doc = await ctx.client.index<StoryDoc>(ctx.names.stories).getDocument(publicId);
    expect(doc.title).toBe('Tên Ba');
    const author = await ctx.client.index(ctx.names.authors).getDocument('tac_gia');
    expect(author).toMatchObject({ username: 'tac_gia', storyCount: 1 });
  });
});
