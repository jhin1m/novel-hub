import { deleteRating, getMyRating, listStoryRatings, upsertRating } from '@novel-hub/core';
import {
  ratingListQuerySchema,
  ratingStoryQuerySchema,
  ratingUpsertSchema,
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

/** A 5,000-character review in JSON with room for escapes. */
const BODY_LIMIT_BYTES = 64 * 1024;

/**
 * Story ratings and reviews. Reading is public (guests too) but never cached, since `isOwn` follows
 * the session; the story page loads them in the browser so its HTML stays the same for everyone.
 * Rating needs a verified email and an active account; each reader edits or deletes only their own.
 */
export function createRatingRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>) {
  // Only on the route with a body: on a bodiless DELETE the limiter rebuilds the request, which
  // fails under the dev server.
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
  });

  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', validate('query', ratingListQuerySchema), async (c) => {
      const { story, cursor } = c.req.valid('query');
      const result = await listStoryRatings(deps.db, c.var.user, { publicId: story, cursor });
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .get('/mine', requireAuth, validate('query', ratingStoryQuerySchema), async (c) => {
      const rating = await getMyRating(deps.db, c.var.authUser.id, c.req.valid('query').story);
      return c.json({ rating }, 200);
    })
    .put(
      '/',
      limitBody,
      requireVerifiedEmail,
      rateLimit(deps, 'rate'),
      validate('json', ratingUpsertSchema),
      async (c) => {
        const result = await upsertRating(deps.db, c.var.authUser, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return c.json({ rating: result.value }, 200);
      },
    )
    .delete(
      '/',
      requireAuth,
      rateLimit(deps, 'rate'),
      validate('query', ratingStoryQuerySchema),
      async (c) => {
        const result = await deleteRating(deps.db, c.var.authUser, c.req.valid('query').story);
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      },
    );
}
