import { createHash } from 'node:crypto';
import {
  type Limit,
  NEW_ACCOUNT_DAYS,
  RATE_LIMITS,
  type RateLimitAction,
  type RateLimitRule,
} from '@novel-hub/shared';
import type { Redis } from 'ioredis';
import { withTimeout } from '../lib/with-timeout';
import { type CounterOp, defineCounterScript } from './lua';

export interface RateLimitSubject {
  user?: { id: string; createdAt: Date } | null;
  /** From `clientIp`; `null` when unknown, then all such requests share one IP bucket. */
  ip: string | null;
  /** As typed by the client; only ever stored hashed. */
  email?: string | undefined;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the refusing window ends (0 when allowed). */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(action: RateLimitAction, subject: RateLimitSubject): Promise<RateLimitDecision>;
  /** Counts a failed sign-in towards the email's global limit. Never throws. */
  recordFailure(action: 'signIn', email: string): Promise<void>;
  /** Forgets the email's failed sign-ins (the owner proved the mailbox). Never throws. */
  clearFailures(action: 'signIn', email: string): Promise<void>;
}

export interface CreateRateLimiterOptions {
  redis: Redis;
  /** App key prefix (`QUEUE_PREFIX`); keys live under `{prefix}:rl:`. */
  prefix: string;
  /** Multiplies every `max` (tests only; production requires 1). */
  factor?: number;
  /** Per call; past it the rule's `onStoreError` decides (ms). */
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 500;
/** How long a fail-closed action is refused while Redis is unreachable. */
const STORE_ERROR_RETRY_SEC = 60;
const DAY_MS = 86_400_000;
const UNKNOWN_IP = 'unknown';

export function rateLimitKeyPrefix(prefix: string): string {
  return `${prefix}:rl`;
}

/** Keys never hold the raw address: the same email in any case or padding is one counter. */
function emailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

interface Check extends CounterOp {
  max: number;
}

export function createRateLimiter({
  redis,
  prefix,
  factor = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
}: CreateRateLimiterOptions): RateLimiter {
  const run = defineCounterScript(redis);
  const base = rateLimitKeyPrefix(prefix);
  const key = (action: RateLimitAction, dim: string, id: string) =>
    `${base}:${action}:${dim}:${id}`;
  const op = (k: string, limit: Limit, mode: Check['mode']): Check => ({
    key: k,
    windowMs: limit.windowSec * 1000,
    max: limit.max * factor,
    mode,
  });

  // Logged once per outage, like `logRedisErrors`: every request would log it otherwise.
  let failing = false;
  const reportStoreError = (err: unknown) => {
    if (failing) return;
    failing = true;
    const reason = err instanceof Error ? err.message || err.name : String(err);
    console.error('[rate-limit] store unavailable:', reason);
  };
  const call = async <T>(p: Promise<T>): Promise<T> => {
    const value = await withTimeout(p, timeoutMs, 'rate limit');
    failing = false;
    return value;
  };

  const buildChecks = (action: RateLimitAction, rule: RateLimitRule, s: RateLimitSubject) => {
    const checks: Check[] = [];
    const email = s.email?.trim() ? emailKey(s.email) : null;
    if (rule.user && s.user) {
      const isNew = now().getTime() - s.user.createdAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS;
      const limit = isNew ? rule.user.newAccount : rule.user.normal;
      checks.push(op(key(action, 'u', s.user.id), limit, 'hit'));
    }
    // An unknown address shares one bucket rather than skipping the limit: a deployment that
    // loses the client IP throttles too hard instead of not at all.
    const ip = s.ip ?? UNKNOWN_IP;
    if (rule.ip) checks.push(op(key(action, 'ip', ip), rule.ip, 'hit'));
    if (rule.emailIp && email) {
      checks.push(op(key(action, 'eip', `${email}:${ip}`), rule.emailIp, 'hit'));
    }
    if (rule.emailGlobal && email) {
      // Failures are counted after the response; here they are only compared.
      const mode = rule.emailGlobal.countOn === 'failure' ? 'peek' : 'hit';
      checks.push(op(key(action, 'ef', email), rule.emailGlobal, mode));
    }
    return checks;
  };

  return {
    async check(action, subject) {
      const rule = RATE_LIMITS[action];
      const checks = buildChecks(action, rule, subject);
      let states;
      try {
        states = await call(run(checks));
      } catch (err) {
        reportStoreError(err);
        return rule.onStoreError === 'open'
          ? { allowed: true, retryAfterSec: 0 }
          : { allowed: false, retryAfterSec: STORE_ERROR_RETRY_SEC };
      }
      let refusedPttl = -1;
      checks.forEach((c, i) => {
        const state = states[i];
        if (!state) return;
        // A hit includes this request; a peek must leave room for one more failure.
        const over = c.mode === 'hit' ? state.count > c.max : state.count >= c.max;
        if (over) refusedPttl = Math.max(refusedPttl, state.pttl, 0);
      });
      if (refusedPttl < 0) return { allowed: true, retryAfterSec: 0 };
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(refusedPttl / 1000)) };
    },

    async recordFailure(action, email) {
      const limit = RATE_LIMITS[action].emailGlobal;
      if (!limit || !email.trim()) return;
      try {
        await call(run([op(key(action, 'ef', emailKey(email)), limit, 'hit')]));
      } catch (err) {
        reportStoreError(err);
      }
    },

    async clearFailures(action, email) {
      if (!email.trim()) return;
      try {
        await call(redis.del(key(action, 'ef', emailKey(email))));
      } catch (err) {
        reportStoreError(err);
      }
    },
  };
}
