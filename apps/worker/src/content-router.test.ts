import type { CdnPurger, Db } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { routeContentJob } from './content-router';
import { routePublishingJob } from './publishing-worker';

const db = {} as Db;
const cdn: CdnPurger = { purge: () => Promise.resolve() };
const contentDeps = { db, cdn, appUrl: 'http://localhost:3000', search: null };

describe('job routers', () => {
  it('never retries a job name without a processor', async () => {
    await expect(
      routeContentJob({ name: 'purge-everything', data: {} }, contentDeps),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      routePublishingJob(
        { name: 'unknown' },
        {
          db,
          contentQueue: { addBulk: () => Promise.resolve([]) },
          statsRedis: {} as Redis,
          queuePrefix: 'test',
        },
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('never retries a purge job whose payload is not a content change', async () => {
    const purge = vi.fn<CdnPurger['purge']>();
    await expect(
      routeContentJob(
        { name: 'purge-urls', data: { entity: 'story', storyId: 'x' } },
        { ...contentDeps, cdn: { purge } },
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(purge).not.toHaveBeenCalled();
  });
});
