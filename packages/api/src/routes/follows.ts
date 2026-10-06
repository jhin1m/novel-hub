import {
  followAuthor,
  followStory,
  getFollowStatus,
  unfollowAuthor,
  unfollowStory,
} from '@novel-hub/core';
import {
  followAuthorParamSchema,
  followStatusQuerySchema,
  publicIdParamSchema,
} from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { rateLimit } from '../middleware/rate-limit';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * Following stories and authors. Only signing in is needed (a muted account still follows). Every
 * route reads and writes the session's own rows; who follows whom is never listed. Never cached
 * (`no-store`, set by the app).
 */
export function createFollowRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/status', requireAuth, validate('query', followStatusQuerySchema), async (c) => {
      const { story, author } = c.req.valid('query');
      const status = await getFollowStatus(deps.db, c.var.authUser.id, {
        storyPublicId: story,
        username: author,
      });
      return c.json(status, 200);
    })
    .put(
      '/stories/:publicId',
      requireAuth,
      rateLimit(deps, 'follow'),
      validate('param', publicIdParamSchema),
      async (c) => {
        const result = await followStory(deps.db, c.var.authUser, c.req.valid('param').publicId);
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      },
    )
    .delete(
      '/stories/:publicId',
      requireAuth,
      rateLimit(deps, 'follow'),
      validate('param', publicIdParamSchema),
      async (c) => {
        await unfollowStory(deps.db, c.var.authUser, c.req.valid('param').publicId);
        return c.body(null, 204);
      },
    )
    .put(
      '/authors/:username',
      requireAuth,
      rateLimit(deps, 'follow'),
      validate('param', followAuthorParamSchema),
      async (c) => {
        const result = await followAuthor(deps.db, c.var.authUser, c.req.valid('param').username);
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      },
    )
    .delete(
      '/authors/:username',
      requireAuth,
      rateLimit(deps, 'follow'),
      validate('param', followAuthorParamSchema),
      async (c) => {
        await unfollowAuthor(deps.db, c.var.authUser, c.req.valid('param').username);
        return c.body(null, 204);
      },
    );
}
