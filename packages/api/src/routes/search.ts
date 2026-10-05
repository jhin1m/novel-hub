import { getPreferences, searchCatalog } from '@novel-hub/core';
import { searchQuerySchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { sessionMiddleware } from '../middleware/session';

const unavailable = () => errorBody('SEARCH_UNAVAILABLE', 'Search is temporarily unavailable');

/**
 * Story and author search (any visitor). 18+ stories only when the signed-in reader's own
 * preferences allow it. Uncached (`no-store`), since the result depends on the account.
 */
export function createSearchRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'search'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', validate('query', searchQuerySchema), async (c) => {
      const { search } = deps;
      if (!search) return c.json(unavailable(), 503);
      const { user } = c.var;
      const includeMature = user ? (await getPreferences(deps.db, user.id)).showMature : false;
      try {
        const result = await searchCatalog(deps.db, search, c.req.valid('query'), {
          includeMature,
        });
        return c.json(result, 200);
      } catch (error) {
        console.error(
          '[api] search failed:',
          error instanceof Error ? `${error.name}: ${error.message}` : error,
        );
        return c.json(unavailable(), 503);
      }
    });
}
