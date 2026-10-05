import { getShelf, listLibrary, removeFromLibrary, setShelf } from '@novel-hub/core';
import { libraryListQuery, publicIdParamSchema, setShelfInput } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * The signed-in reader's library (shelves). Every route reads and writes the session's own rows
 * only, so there is no user parameter to tamper with. Never cached (`no-store`, set by the app).
 */
export function createLibraryRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', requireAuth, validate('query', libraryListQuery), async (c) => {
      const result = await listLibrary(deps.db, c.var.authUser.id, c.req.valid('query'));
      return c.json(result, 200);
    })
    .get('/:publicId', requireAuth, validate('param', publicIdParamSchema), async (c) => {
      const shelf = await getShelf(deps.db, c.var.authUser.id, c.req.valid('param').publicId);
      return c.json({ shelf }, 200);
    })
    .put(
      '/:publicId',
      requireAuth,
      validate('param', publicIdParamSchema),
      validate('json', setShelfInput),
      async (c) => {
        const result = await setShelf(
          deps.db,
          c.var.authUser.id,
          c.req.valid('param').publicId,
          c.req.valid('json').shelf,
        );
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .delete('/:publicId', requireAuth, validate('param', publicIdParamSchema), async (c) => {
      await removeFromLibrary(deps.db, c.var.authUser.id, c.req.valid('param').publicId);
      return c.body(null, 204);
    });
}
