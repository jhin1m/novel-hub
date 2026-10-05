import { createReport } from '@novel-hub/core';
import { reportCreateSchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { rateLimit } from '../middleware/rate-limit';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * Readers report a story, a chapter or an account. Signing in is enough (no verified email);
 * the rate limit keeps it from being used as a flood. Targets are named by public keys only.
 */
export function createReportRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .post(
      '/',
      requireAuth,
      rateLimit(deps, 'report'),
      validate('json', reportCreateSchema),
      async (c) => {
        const result = await createReport(deps.db, c.var.authUser, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return result.value.created
          ? c.json({ created: true as const }, 201)
          : c.json({ created: false as const }, 200);
      },
    );
}
