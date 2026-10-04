/**
 * Client `hc` có type cho `/api/v1/*`, dùng ở browser (kèm TanStack Query) cho dữ liệu
 * cá nhân, không cache.
 *
 * SSR không tự gọi HTTP vào chính mình: loader lấy dữ liệu qua `createServerFn` → `core`.
 * File này chỉ được import từ `@novel-hub/api/client` (ESLint chặn các entry khác) để
 * bundle client không kéo theo `pg`/`ioredis`.
 */
export { type ApiClient, createApiClient } from '@novel-hub/api/client';
