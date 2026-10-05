import type { Redis } from 'ioredis';

/**
 * Fixed-window counters, any number of keys in one atomic round trip.
 *
 * KEYS: the counters. ARGV: one `(windowMs, mode)` pair per key. `hit` increments the counter and
 * starts its window on the first hit, so a refused request still counts but never extends the
 * window; `peek` only reads. A counter left without a TTL (written by something else, or a lost
 * `PEXPIRE`) gets one again instead of blocking forever. Returns `[count, pttl]` per key; `pttl` is
 * negative for a missing key.
 */
const RATE_LIMIT_LUA = `
local out = {}
for i, key in ipairs(KEYS) do
  local window = tonumber(ARGV[i * 2 - 1])
  local count
  if ARGV[i * 2] == 'hit' then
    count = redis.call('INCR', key)
    if count == 1 then redis.call('PEXPIRE', key, window) end
  else
    count = tonumber(redis.call('GET', key) or '0')
  end
  local ttl = redis.call('PTTL', key)
  if ttl == -1 then
    redis.call('PEXPIRE', key, window)
    ttl = window
  end
  out[#out + 1] = count
  out[#out + 1] = ttl
end
return out
`;

export type CounterMode = 'hit' | 'peek';

export interface CounterOp {
  key: string;
  windowMs: number;
  mode: CounterMode;
}

export interface CounterState {
  count: number;
  pttl: number;
}

/** Own name: BullMQ defines its commands on the same shared connection. */
const COMMAND = 'nhRateLimit';

type RateLimitCommand = (numberOfKeys: number, ...args: (string | number)[]) => Promise<number[]>;

/** Defines the script on `redis` and returns a runner (the script is sent by SHA after the first call). */
export function defineCounterScript(redis: Redis): (ops: CounterOp[]) => Promise<CounterState[]> {
  redis.defineCommand(COMMAND, { lua: RATE_LIMIT_LUA });
  const run = (redis as Redis & Record<typeof COMMAND, RateLimitCommand>)[COMMAND].bind(redis);
  return async (ops) => {
    if (ops.length === 0) return [];
    const reply = await run(
      ops.length,
      ...ops.map((op) => op.key),
      ...ops.flatMap((op) => [op.windowMs, op.mode]),
    );
    return ops.map((_, i) => ({ count: Number(reply[i * 2]), pttl: Number(reply[i * 2 + 1]) }));
  };
}
