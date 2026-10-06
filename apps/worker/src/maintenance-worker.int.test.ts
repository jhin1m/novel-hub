import { createProducerConnection } from '@novel-hub/core';
import { MAINTENANCE_JOBS } from '@novel-hub/shared';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { afterAll, describe, expect, it } from 'vitest';
import { createMaintenanceQueue, registerMaintenanceSchedulers } from './maintenance-worker';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
// A prefix per run so jobs never mix with dev jobs or earlier runs.
const PREFIX = `test-maintenance-${Date.now().toString(36)}`;

const producer = createProducerConnection(TEST_REDIS_URL);
const queue = createMaintenanceQueue(producer, PREFIX);

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  producer.disconnect();
});

describe('maintenance worker (real Redis)', () => {
  it('registers each periodic job once, however often it is called', async () => {
    await registerMaintenanceSchedulers(queue);
    await registerMaintenanceSchedulers(queue);
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((s) => [s.key, s.every]).sort()).toEqual([
      [MAINTENANCE_JOBS.pruneNotifications, 86_400_000],
    ]);
  });
});
