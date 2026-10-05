import type { RateLimitAction } from '@novel-hub/shared';
import { createMiddleware } from 'hono/factory';
import type { ApiDeps } from '../deps';
import { errorBody } from '../lib/errors';
import type { AuthedEnv } from './require-auth';

export type RateLimitPort = Pick<ApiDeps, 'rateLimit' | 'clientIp'>;

export const RATE_LIMITED_MESSAGE = 'Too many requests, try again later';

/**
 * Limits `action` per user and IP. Goes after `requireAuth`/`requireVerifiedEmail`, so a signed-out
 * request gets its 401 without being counted. Over the limit → 429 `RATE_LIMITED` with
 * `Retry-After` (s). Without a limiter (`rateLimit: null`) every request passes.
 */
export function rateLimit(port: RateLimitPort, action: RateLimitAction) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    if (!port.rateLimit) return next();
    const { id, createdAt } = c.var.authUser;
    const decision = await port.rateLimit.check(action, {
      user: { id, createdAt },
      ip: port.clientIp(c.req.raw),
    });
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSec));
      return c.json(errorBody('RATE_LIMITED', RATE_LIMITED_MESSAGE), 429);
    }
    await next();
  });
}
