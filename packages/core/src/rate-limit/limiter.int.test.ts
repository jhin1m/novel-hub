import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRateLimiter } from './limiter';
import { resetRateLimits } from './reset';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
const PREFIX = `test-rl-${Date.now().toString(36)}`;

const redis = new Redis(TEST_REDIS_URL);
let clock = new Date('2026-10-05T00:00:00Z');
const limiter = createRateLimiter({ redis, prefix: PREFIX, now: () => clock });

afterAll(async () => {
  await resetRateLimits(redis, PREFIX);
  redis.disconnect();
});

beforeEach(async () => {
  clock = new Date('2026-10-05T00:00:00Z');
  await resetRateLimits(redis, PREFIX);
});

describe('rate limiter (real Redis)', () => {
  it('allows max requests in a window, refuses the next with the time left', async () => {
    // signUp: 5 per hour per IP.
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await limiter.check('signUp', { ip: '192.0.2.1' }));
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5]?.allowed).toBe(false);
    expect(results[5]?.retryAfterSec).toBeGreaterThan(3590);
    expect(results[5]?.retryAfterSec).toBeLessThanOrEqual(3600);
    // Another IP has its own counter.
    expect((await limiter.check('signUp', { ip: '192.0.2.2' })).allowed).toBe(true);
  });

  it('lets exactly max of many concurrent requests through', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.check('signUp', { ip: '192.0.2.3' })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('opens again once the window ends', async () => {
    for (let i = 0; i < 6; i++) await limiter.check('signUp', { ip: '192.0.2.4' });
    const [key] = await redis.keys(`${PREFIX}:rl:signUp:ip:192.0.2.4`);
    expect(key).toBeDefined();
    await redis.pexpire(key ?? '', 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await limiter.check('signUp', { ip: '192.0.2.4' })).allowed).toBe(true);
  });

  it('does not extend the window of a refused key, and restores a lost TTL', async () => {
    const key = `${PREFIX}:rl:signUp:ip:192.0.2.5`;
    await limiter.check('signUp', { ip: '192.0.2.5' });
    await redis.pexpire(key, 100_000);
    for (let i = 0; i < 6; i++) await limiter.check('signUp', { ip: '192.0.2.5' });
    expect(await redis.pttl(key)).toBeLessThanOrEqual(100_000);
    await redis.persist(key);
    await limiter.check('signUp', { ip: '192.0.2.5' });
    expect(await redis.pttl(key)).toBeGreaterThan(0);
  });

  it('counts sign-in failures only when recorded; a peek never counts', async () => {
    const subject = { ip: '192.0.2.6', email: 'owner@example.com' };
    for (let i = 0; i < 3; i++) await limiter.check('signIn', subject);
    const key = (await redis.keys(`${PREFIX}:rl:signIn:ef:*`))[0];
    expect(key).toBeUndefined();

    for (let i = 0; i < 50; i++) await limiter.recordFailure('signIn', 'owner@example.com');
    // From a fresh IP the email is now refused...
    expect((await limiter.check('signIn', { ...subject, ip: '192.0.2.7' })).allowed).toBe(false);
    // ...until the owner resets the password.
    await limiter.clearFailures('signIn', ' Owner@Example.com ');
    expect((await limiter.check('signIn', { ...subject, ip: '192.0.2.7' })).allowed).toBe(true);
  });

  it('applies the stricter tier to a one-day-old account', async () => {
    const fresh = { id: 'fresh', createdAt: new Date(clock.getTime() - 86_400_000) };
    const old = { id: 'old', createdAt: new Date('2026-01-01T00:00:00Z') };
    const run = async (user: typeof fresh) => {
      let allowed = 0;
      for (let i = 0; i < 6; i++) {
        if ((await limiter.check('createStory', { user, ip: null })).allowed) allowed++;
      }
      return allowed;
    };
    expect(await run(fresh)).toBe(2);
    expect(await run(old)).toBe(5);
  });

  it('resetRateLimits deletes only the counters under its prefix', async () => {
    await redis.set(`${PREFIX}:other`, '1');
    await limiter.check('signUp', { ip: '192.0.2.8' });
    expect(await resetRateLimits(redis, PREFIX)).toBe(1);
    expect(await redis.get(`${PREFIX}:other`)).toBe('1');
    await redis.del(`${PREFIX}:other`);
  });
});
