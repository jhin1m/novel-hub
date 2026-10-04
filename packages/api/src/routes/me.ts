import { Hono } from 'hono';
import type { AuthPort } from '../deps';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** Thông tin tài khoản của người đang đăng nhập; không bao giờ trả `id`. */
export function createMeRoutes(auth: Pick<AuthPort, 'lookupSession'>) {
  return new Hono().get('/', sessionMiddleware(auth), requireAuth, (c) => {
    const { username, displayName, avatarUrl, role, status, emailVerified } = c.var.authUser;
    return c.json({ user: { username, displayName, avatarUrl, role, status, emailVerified } }, 200);
  });
}
