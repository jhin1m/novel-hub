import {
  getAuthorStory,
  getPreferences,
  listAuthorChapters,
  listAuthorStories,
  updatePreferences,
} from '@novel-hub/core';
import { preferencesPatchSchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** The signed-in account and its own content. Never returns internal ids. */
export function createMeRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', requireAuth, async (c) => {
      const { id, username, displayName, avatarUrl, role, status, emailVerified } = c.var.authUser;
      const preferences = await getPreferences(deps.db, id);
      return c.json(
        { user: { username, displayName, avatarUrl, role, status, emailVerified, preferences } },
        200,
      );
    })
    .patch('/preferences', requireAuth, validate('json', preferencesPatchSchema), async (c) => {
      const result = await updatePreferences(deps.db, c.var.authUser.id, c.req.valid('json'));
      if (!result.ok) return coreError(c, result.error);
      return c.json({ preferences: result.value }, 200);
    })
    .get('/stories', requireAuth, async (c) => {
      const stories = await listAuthorStories(deps.db, c.var.authUser);
      return c.json({ stories }, 200);
    })
    .get('/stories/:publicId', requireAuth, async (c) => {
      const result = await getAuthorStory(deps.db, c.var.authUser, c.req.param('publicId'));
      if (!result.ok) return coreError(c, result.error);
      return c.json({ story: result.value }, 200);
    })
    .get('/stories/:publicId/chapters', requireAuth, async (c) => {
      const result = await listAuthorChapters(deps.db, c.var.authUser, c.req.param('publicId'));
      if (!result.ok) return coreError(c, result.error);
      return c.json({ chapters: result.value }, 200);
    });
}
