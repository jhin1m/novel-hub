import { getAuthorStory, listAuthorStories } from '@novel-hub/core';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** The signed-in account and its own content. Never returns internal ids. */
export function createMeRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', requireAuth, (c) => {
      const { username, displayName, avatarUrl, role, status, emailVerified } = c.var.authUser;
      return c.json(
        { user: { username, displayName, avatarUrl, role, status, emailVerified } },
        200,
      );
    })
    .get('/stories', requireAuth, async (c) => {
      const stories = await listAuthorStories(deps.db, c.var.authUser);
      return c.json({ stories }, 200);
    })
    .get('/stories/:publicId', requireAuth, async (c) => {
      const result = await getAuthorStory(deps.db, c.var.authUser, c.req.param('publicId'));
      if (!result.ok) return coreError(c, result.error);
      return c.json({ story: result.value }, 200);
    });
}
