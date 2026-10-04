import type { CurrentUser } from '@novel-hub/core';
import { createMiddleware } from 'hono/factory';
import type { AuthPort } from '../deps';

export interface SessionEnv {
  Variables: { user: CurrentUser | null };
}

/**
 * Đọc user từ cookie phiên; khách và user bị ban = `null`. Chỉ gắn vào route cần user
 * (route công khai như health không tra DB phiên). Cookie gia hạn phiên được chuyển vào
 * response, nếu không cookie ở browser hết hạn dù user vẫn đang dùng.
 */
export function sessionMiddleware(auth: Pick<AuthPort, 'lookupSession'>) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const { user, setCookies } = await auth.lookupSession(c.req.raw.headers);
    c.set('user', user);
    await next();
    for (const cookie of setCookies) c.res.headers.append('Set-Cookie', cookie);
  });
}
