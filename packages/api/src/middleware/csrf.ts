import { csrf as honoCsrf } from 'hono/csrf';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { errorBody } from '../lib/errors';

/**
 * Chặn request ghi dạng form (urlencoded, multipart, text/plain hoặc không có
 * content-type) từ origin khác vào `/api/v1/*`. Request JSON đã được CORS preflight bảo
 * vệ. `/api/auth/*` do `trustedOrigins` của Better Auth lo.
 *
 * `hono/csrf` trả text "Forbidden"; bọc lại để lỗi theo dạng thống nhất của API. Chỉ
 * chạy phần kiểm tra trong `try` (với `next` giả), nên lỗi của handler phía sau không bị
 * bắt nhầm.
 */
export function csrf(appUrl: string) {
  const check = honoCsrf({ origin: new URL(appUrl).origin });
  return createMiddleware(async (c, next) => {
    let allowed = false;
    try {
      await check(c, () => {
        allowed = true;
        return Promise.resolve();
      });
    } catch (err) {
      if (err instanceof HTTPException && err.status === 403) {
        return c.json(errorBody('FORBIDDEN', 'Yêu cầu bị chặn vì khác nguồn gốc'), 403);
      }
      throw err;
    }
    if (allowed) await next();
  });
}
