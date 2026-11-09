import { getNominationStatus, nominateStory } from '@novel-hub/core';
import { nominationCreateSchema, nominationStatusQuerySchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { rateLimit } from '../middleware/rate-limit';
import { requireAuth, requireVerifiedEmail } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** `{ "publicId": "…" }` with room to spare. */
const BODY_LIMIT_BYTES = 1024;

/**
 * Free weekly nominations of the signed-in reader. Never cached; the public weekly board is a
 * server-rendered page, not part of this API.
 */
export function createNominationRoutes(
  deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>,
) {
  // Only on the route with a body (see `ratings.ts`).
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
  });

  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/status', requireAuth, validate('query', nominationStatusQuerySchema), async (c) => {
      const result = await getNominationStatus(deps.db, c.var.authUser, c.req.valid('query').story);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post(
      '/',
      limitBody,
      requireVerifiedEmail,
      rateLimit(deps, 'nominate'),
      validate('json', nominationCreateSchema),
      async (c) => {
        const result = await nominateStory(deps.db, c.var.authUser, c.req.valid('json').publicId);
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 201);
      },
    );
}
