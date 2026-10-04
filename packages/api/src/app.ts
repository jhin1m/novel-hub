import { Hono } from 'hono';
import type { ApiDeps } from './deps';
import { handleError, handleNotFound } from './lib/errors';
import { csrf } from './middleware/csrf';
import { noStore } from './middleware/no-store';
import { createHealthRoutes } from './routes/health';
import { createMeRoutes } from './routes/me';

/** Contract ổn định `/api/v1/*`. Viết dạng chain để `hc` suy ra type. */
function createV1Routes(deps: ApiDeps) {
  return new Hono()
    .use(csrf(deps.appUrl))
    .route('/health', createHealthRoutes(deps))
    .route('/me', createMeRoutes(deps.auth));
}

export function createApp(deps: ApiDeps) {
  return (
    new Hono()
      .basePath('/api')
      .use(noStore)
      // Better Auth: đăng ký, đăng nhập, OAuth, phiên. Lỗi theo dạng của Better Auth
      // (`{ code, message }`), nằm ngoài contract `/api/v1`.
      .on(['GET', 'POST'], '/auth/*', (c) => deps.auth.handler(c.req.raw))
      .route('/v1', createV1Routes(deps))
      .onError(handleError)
      .notFound(handleNotFound)
  );
}

export type App = ReturnType<typeof createApp>;
export type AppType = App;
