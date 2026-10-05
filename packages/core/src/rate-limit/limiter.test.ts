import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './limiter';

const NOW = new Date('2026-10-05T00:00:00Z');
const DAY_MS = 86_400_000;

interface Call {
  keys: string[];
  args: (string | number)[];
}

/** Stands in for the Lua script: records each call and answers with `answer(call)`. */
function fakeRedis(answer: (call: Call) => Promise<number[]>) {
  const calls: Call[] = [];
  const del = vi.fn(() => Promise.resolve(1));
  const redis = {
    defineCommand: vi.fn(),
    nhRateLimit: (n: number, ...rest: (string | number)[]) => {
      const call = { keys: rest.slice(0, n).map(String), args: rest.slice(n) };
      calls.push(call);
      return answer(call);
    },
    del,
  };
  return { redis: redis as unknown as Redis, calls, del };
}

/** Every key at `count`, `pttl` ms left. */
const all =
  (count: number, pttl = 30_000) =>
  (call: Call) =>
    Promise.resolve(call.keys.flatMap(() => [count, pttl]));

const user = (ageDays: number) => ({
  id: 'user-1',
  createdAt: new Date(NOW.getTime() - ageDays * DAY_MS),
});

function limiter(redis: Redis, factor = 1) {
  return createRateLimiter({ redis, prefix: 'p', factor, timeoutMs: 50, now: () => NOW });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRateLimiter.check', () => {
  it('counts the user and the IP in one round trip', async () => {
    const { redis, calls } = fakeRedis(all(1));
    const decision = await limiter(redis).check('createStory', { user: user(30), ip: '1.2.3.4' });
    expect(decision).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keys).toEqual(['p:rl:createStory:u:user-1', 'p:rl:createStory:ip:1.2.3.4']);
    expect(calls[0]?.args).toEqual([DAY_MS, 'hit', DAY_MS, 'hit']);
  });

  it('gives accounts younger than three days the stricter tier', async () => {
    // createStory: 5 a day normally, 2 for new accounts.
    const { redis } = fakeRedis(all(3));
    const rl = limiter(redis);
    expect((await rl.check('createStory', { user: user(1), ip: null })).allowed).toBe(false);
    expect((await rl.check('createStory', { user: user(3), ip: null })).allowed).toBe(true);
  });

  it('refuses the whole request when any one key is over, with the longest wait', async () => {
    const { redis } = fakeRedis(() => Promise.resolve([1, 10_000, 21, 125_400]));
    const decision = await limiter(redis).check('createStory', { user: user(30), ip: '1.2.3.4' });
    expect(decision).toEqual({ allowed: false, retryAfterSec: 126 });
  });

  it('waits at least one second', async () => {
    const { redis } = fakeRedis(all(99, 5));
    expect((await limiter(redis).check('signUp', { ip: '1.2.3.4' })).retryAfterSec).toBe(1);
  });

  it('multiplies every max by the factor', async () => {
    const { redis } = fakeRedis(all(6));
    expect((await limiter(redis).check('signUp', { ip: '1.2.3.4' })).allowed).toBe(false);
    expect((await limiter(redis, 50).check('signUp', { ip: '1.2.3.4' })).allowed).toBe(true);
  });

  it('keys the email only as a hash, case and padding ignored', async () => {
    const { redis, calls } = fakeRedis(all(1));
    const rl = limiter(redis);
    await rl.check('forgotPassword', { ip: '1.2.3.4', email: ' Reader@Example.com ' });
    await rl.check('forgotPassword', { ip: '1.2.3.4', email: 'reader@example.com' });
    const [first, second] = calls;
    expect(first?.keys).toEqual(second?.keys);
    expect(first?.keys.join(' ')).not.toContain('example');
    expect(first?.keys.map((k) => k.split(':')[3])).toEqual(['ip', 'eip', 'ef']);
  });

  it('only peeks at failed sign-ins and refuses once they reach the max', async () => {
    const { redis, calls } = fakeRedis((call) =>
      Promise.resolve(call.keys.flatMap((k) => (k.includes(':ef:') ? [50, 9_000] : [1, 9_000]))),
    );
    const decision = await limiter(redis).check('signIn', { ip: '1.2.3.4', email: 'a@b.c' });
    expect(calls[0]?.args).toEqual([900_000, 'hit', 900_000, 'hit', 3_600_000, 'peek']);
    expect(decision).toEqual({ allowed: false, retryAfterSec: 9 });
  });

  it('puts requests without an address in one shared IP bucket instead of skipping it', async () => {
    const { redis, calls } = fakeRedis(all(6));
    expect((await limiter(redis).check('signUp', { ip: null })).allowed).toBe(false);
    expect(calls[0]?.keys).toEqual(['p:rl:signUp:ip:unknown']);
  });
});

describe('createRateLimiter when Redis fails', () => {
  it('lets open actions through and refuses closed ones for a minute, logging once', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { redis } = fakeRedis(() => Promise.reject(new Error('connection is closed')));
    const rl = limiter(redis);
    expect(await rl.check('signIn', { ip: '1.2.3.4' })).toEqual({
      allowed: true,
      retryAfterSec: 0,
    });
    expect(await rl.check('signUp', { ip: '1.2.3.4' })).toEqual({
      allowed: false,
      retryAfterSec: 60,
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('treats a slow Redis like a dead one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { redis } = fakeRedis(() => new Promise<number[]>(() => {}));
    const decision = await limiter(redis).check('forgotPassword', { ip: '1.2.3.4' });
    expect(decision.allowed).toBe(false);
  });

  it('logs again after Redis came back and failed anew', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let up = false;
    const { redis } = fakeRedis((call) => (up ? all(1)(call) : Promise.reject(new Error('down'))));
    const rl = limiter(redis);
    await rl.check('signUp', { ip: '1.2.3.4' });
    up = true;
    await rl.check('signUp', { ip: '1.2.3.4' });
    up = false;
    await rl.check('signUp', { ip: '1.2.3.4' });
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('never throws from recordFailure or clearFailures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { redis, del } = fakeRedis(() => Promise.reject(new Error('down')));
    del.mockRejectedValue(new Error('down'));
    const rl = limiter(redis);
    await expect(rl.recordFailure('signIn', 'a@b.c')).resolves.toBeUndefined();
    await expect(rl.clearFailures('signIn', 'a@b.c')).resolves.toBeUndefined();
  });
});
