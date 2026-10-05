import { applyModerationAction, listReports } from '@novel-hub/core';
import { moderationActionSchema, reportListQuerySchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireRole } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * The moderation queue and one-click actions. Two permission layers: the role here, and
 * `canModerate`/`canModerateUser` in core (which also refuses a muted moderator).
 */
export function createModerationRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .use(requireRole('mod', 'admin'))
    .get('/reports', validate('query', reportListQuerySchema), async (c) => {
      const result = await listReports(deps.db, c.var.authUser, c.req.valid('query'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post('/actions', validate('json', moderationActionSchema), async (c) => {
      const result = await applyModerationAction(deps.db, c.var.authUser, c.req.valid('json'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    });
}
