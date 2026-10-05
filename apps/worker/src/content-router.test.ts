import type { Db } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { routeContentJob } from './content-router';
import { routePublishingJob } from './publishing-worker';

const db = {} as Db;

describe('job routers', () => {
  it('never retries a job name without a processor', async () => {
    await expect(
      routeContentJob({ name: 'purge-everything', data: {} }, { db }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      routePublishingJob(
        { name: 'unknown' },
        { db, contentQueue: { addBulk: () => Promise.resolve([]) } },
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
