import { Hono } from 'hono';
import type { ApiDeps } from './deps';
import { handleError, handleNotFound } from './lib/errors';
import { csrf } from './middleware/csrf';
import { noStore } from './middleware/no-store';
import { createHealthRoutes } from './routes/health';
import { createMeRoutes } from './routes/me';
import { createReadingRoutes } from './routes/reading';
import { createSearchRoutes } from './routes/search';
import { createStoryRoutes } from './routes/stories';
import { createTagRoutes } from './routes/tags';

/** Stable `/api/v1/*` contract. Written as a chain so `hc` can infer types. */
function createV1Routes(deps: ApiDeps) {
  return new Hono()
    .use(csrf(deps.appUrl))
    .route('/health', createHealthRoutes(deps))
    .route('/me', createMeRoutes(deps))
    .route('/reading', createReadingRoutes(deps))
    .route('/search', createSearchRoutes(deps))
    .route('/stories', createStoryRoutes(deps))
    .route('/tags', createTagRoutes(deps));
}

export function createApp(deps: ApiDeps) {
  return (
    new Hono()
      .basePath('/api')
      .use(noStore)
      // Better Auth: sign-up, sign-in, OAuth, sessions. Errors use Better Auth's shape
      // (`{ code, message }`), outside the `/api/v1` contract.
      .on(['GET', 'POST'], '/auth/*', (c) => deps.auth.handler(c.req.raw))
      .route('/v1', createV1Routes(deps))
      .onError(handleError)
      .notFound(handleNotFound)
  );
}

export type App = ReturnType<typeof createApp>;
export type AppType = App;
