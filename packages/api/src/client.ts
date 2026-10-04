/**
 * Entry an toàn cho browser: chỉ có `hc` và type. Không import value nào từ `./app`
 * hay `@novel-hub/core`, nếu không bundle client sẽ kéo theo `pg`/`ioredis`.
 */
import { type ClientRequestOptions, hc } from 'hono/client';
import type { AppType } from './app';

export type { AppType };
export type ApiClient = ReturnType<typeof hc<AppType>>;

/** `hc<AppType>` đã gắn sẵn type; suy ra type một lần ở đây để editor không chậm. */
export const hcWithType = (...args: Parameters<typeof hc>): ApiClient => hc<AppType>(...args);

/**
 * Client có type đầy đủ. `baseUrl` rỗng = cùng origin (dùng ở browser); khi đó `$url()`
 * không dựng được URL tuyệt đối, cần thì truyền `location.origin`.
 */
export function createApiClient(baseUrl = '', options?: ClientRequestOptions): ApiClient {
  return hcWithType(baseUrl, options);
}
