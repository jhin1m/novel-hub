import { enterContest, listOpenContestsForStory, withdrawEntry } from '@novel-hub/core';
import { contestEntryParamSchema, contestOpenQuerySchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireAuth, requireVerifiedEmail } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * An author's side of themed contests: the open contests as one of their stories sees them, and
 * entering or withdrawing it. Anyone else's story is a 404. Never cached (`no-store`); the public
 * contest pages are server-rendered, not read from here.
 */
export function createContestRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/open', requireAuth, validate('query', contestOpenQuerySchema), async (c) => {
      const { story } = c.req.valid('query');
      const result = await listOpenContestsForStory(deps.db, c.var.authUser, story);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .put(
      '/:slug/entries/:publicId',
      requireVerifiedEmail,
      validate('param', contestEntryParamSchema),
      async (c) => {
        const { slug, publicId } = c.req.valid('param');
        const result = await enterContest(deps.db, c.var.authUser, slug, publicId);
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .delete(
      '/:slug/entries/:publicId',
      requireAuth,
      validate('param', contestEntryParamSchema),
      async (c) => {
        const { slug, publicId } = c.req.valid('param');
        const result = await withdrawEntry(deps.db, c.var.authUser, slug, publicId);
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    );
}
