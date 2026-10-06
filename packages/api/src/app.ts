import { Hono } from 'hono';
import type { ApiDeps } from './deps';
import { handleError, handleNotFound } from './lib/errors';
import { authRateLimit } from './middleware/auth-rate-limit';
import { csrf } from './middleware/csrf';
import { noStore } from './middleware/no-store';
import { createAuthorStatsRoutes } from './routes/author-stats';
import { createCommentRoutes } from './routes/comments';
import { createFollowRoutes } from './routes/follows';
import { createHealthRoutes } from './routes/health';
import { createLibraryRoutes } from './routes/library';
import { createMeRoutes } from './routes/me';
import { createModerationRoutes } from './routes/moderation';
import { createNotificationRoutes } from './routes/notifications';
import { createRatingRoutes } from './routes/ratings';
import { createReadingRoutes } from './routes/reading';
import { createReportRoutes } from './routes/reports';
import { createSearchRoutes } from './routes/search';
import { createStoryRoutes } from './routes/stories';
import { createTagRoutes } from './routes/tags';

/** Stable `/api/v1/*` contract. Written as a chain so `hc` can infer types. */
function createV1Routes(deps: ApiDeps) {
  return new Hono()
    .use(csrf(deps.appUrl))
    .route('/author-stats', createAuthorStatsRoutes(deps))
    .route('/comments', createCommentRoutes(deps))
    .route('/follows', createFollowRoutes(deps))
    .route('/health', createHealthRoutes(deps))
    .route('/library', createLibraryRoutes(deps))
    .route('/me', createMeRoutes(deps))
    .route('/moderation', createModerationRoutes(deps))
    .route('/notifications', createNotificationRoutes(deps))
    .route('/ratings', createRatingRoutes(deps))
    .route('/reading', createReadingRoutes(deps))
    .route('/reports', createReportRoutes(deps))
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
      .on(['GET', 'POST'], '/auth/*', authRateLimit(deps), (c) => deps.auth.handler(c.req.raw))
      .route('/v1', createV1Routes(deps))
      .onError(handleError)
      .notFound(handleNotFound)
  );
}

export type App = ReturnType<typeof createApp>;
export type AppType = App;
