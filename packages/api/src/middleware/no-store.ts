import { createMiddleware } from 'hono/factory';

/**
 * `Cache-Control: no-store` cho mọi response đi qua, kể cả 404 và lỗi, để Cloudflare
 * không cache dữ liệu cá nhân. Route nào muốn cache công khai thì tự ghi đè sau này.
 */
export const noStore = createMiddleware(async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});
