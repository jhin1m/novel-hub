import { getStoryStats } from '@novel-hub/core';
import { publicIdParamSchema, statsDate } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * The author dashboard: reads, readers, drop-off and new follows of one of the session's own
 * stories over the last 30 days. Anyone else's story is a 404. Never cached (`no-store`).
 */
export function createAuthorStatsRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/:publicId', requireAuth, validate('param', publicIdParamSchema), async (c) => {
      const { publicId } = c.req.valid('param');
      const result = await getStoryStats(deps.db, c.var.authUser, publicId, statsDate(new Date()));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    });
}
