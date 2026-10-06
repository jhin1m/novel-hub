import {
  createComment,
  deleteComment,
  listChapterComments,
  listCommentReplies,
} from '@novel-hub/core';
import {
  commentCreateSchema,
  commentIdParamSchema,
  commentListQuerySchema,
  commentRepliesQuerySchema,
} from '@novel-hub/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { rateLimit } from '../middleware/rate-limit';
import { requireAuth, requireVerifiedEmail } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** A 2,000-character comment in JSON with room for escapes. */
const BODY_LIMIT_BYTES = 32 * 1024;

/**
 * Chapter comments. Reading is public (guests too) but never cached, since `isOwn` follows the
 * session; the reading page loads them in the browser so its HTML stays the same for everyone.
 * Posting needs a verified email and an active account; deleting is the writer's own.
 */
export function createCommentRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>) {
  // Only on the route with a body: on a bodiless DELETE the limiter rebuilds the request, which
  // fails under the dev server.
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
  });

  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', validate('query', commentListQuerySchema), async (c) => {
      const { story, chapter, cursor } = c.req.valid('query');
      const result = await listChapterComments(deps.db, c.var.user, {
        publicId: story,
        number: chapter,
        cursor,
      });
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post(
      '/',
      limitBody,
      requireVerifiedEmail,
      rateLimit(deps, 'comment'),
      validate('json', commentCreateSchema),
      async (c) => {
        const result = await createComment(deps.db, c.var.authUser, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return c.json({ comment: result.value }, 201);
      },
    )
    .get(
      '/:id/replies',
      validate('param', commentIdParamSchema),
      validate('query', commentRepliesQuerySchema),
      async (c) => {
        const result = await listCommentReplies(deps.db, c.var.user, {
          commentId: c.req.valid('param').id,
          cursor: c.req.valid('query').cursor,
        });
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .delete('/:id', requireAuth, validate('param', commentIdParamSchema), async (c) => {
      const result = await deleteComment(deps.db, c.var.authUser, c.req.valid('param').id);
      if (!result.ok) return coreError(c, result.error);
      return c.body(null, 204);
    });
}
