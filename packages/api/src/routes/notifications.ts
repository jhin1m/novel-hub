import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from '@novel-hub/core';
import { markNotificationsReadSchema, notificationListQuerySchema } from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { validate } from '../lib/validate';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * The signed-in reader's in-app notifications. Scoped to the session's own rows, never cached
 * (`no-store`, set by the app). The list and the unread count share one visibility rule in core.
 */
export function createNotificationRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .get('/', requireAuth, validate('query', notificationListQuerySchema), async (c) => {
      const page = await listNotifications(deps.db, c.var.authUser.id, c.req.valid('query').cursor);
      return c.json(page, 200);
    })
    .get('/unread-count', requireAuth, async (c) => {
      const count = await countUnreadNotifications(deps.db, c.var.authUser.id);
      return c.json({ count }, 200);
    })
    .post('/read', requireAuth, validate('json', markNotificationsReadSchema), async (c) => {
      const updated = await markNotificationsRead(deps.db, c.var.authUser.id, c.req.valid('json'));
      return c.json({ updated }, 200);
    });
}
