import { createTestDb } from '@novel-hub/db/testing';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHealthRedis, pingRedis } from '../infra/redis';
import { checkHealth, pingPostgres } from './check-health';

describe('checkHealth (Postgres và Redis thật)', () => {
  const { db, pool } = createTestDb();
  const closers: Array<() => Promise<unknown>> = [() => pool.end()];

  afterAll(async () => {
    await Promise.allSettled(closers.map((close) => close()));
  });

  it('gọi ngay sau khi tạo client → ok', async () => {
    const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
    const redis = createHealthRedis(TEST_REDIS_URL);
    closers.push(() => redis.quit());
    await redis.connect();

    await expect(
      checkHealth({ pingPostgres: () => pingPostgres(db), pingRedis: () => pingRedis(redis) }),
    ).resolves.toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('Redis trỏ vào port đóng → redis down trong dưới 3s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Port 1 trên localhost không có dịch vụ nào lắng nghe.
    const redis = createHealthRedis('redis://127.0.0.1:1/0');
    closers.push(() => Promise.resolve(redis.disconnect()));
    await redis.connect().catch(() => {});

    const started = Date.now();
    const report = await checkHealth({
      pingPostgres: () => pingPostgres(db),
      pingRedis: () => pingRedis(redis),
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(report).toEqual({ status: 'unhealthy', checks: { postgres: 'up', redis: 'down' } });
    vi.restoreAllMocks();
  });
});
