/**
 * Browser-safe entry: only `hc` and types. Do not import any value from `./app`
 * or `@novel-hub/core`, otherwise the client bundle pulls in `pg`/`ioredis`.
 */
import { type ClientRequestOptions, type ClientResponse, hc } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import type { AppType } from './app';

export type { AppType, ClientResponse };

/** Body type of the 2xx branches of an `hc` response union (error branches dropped). */
export type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S> ? (S extends SuccessStatusCode ? T : never) : never;
export type ApiClient = ReturnType<typeof hc<AppType>>;

/** `hc<AppType>` with its type bound; the type is inferred once here so the editor stays fast. */
export const hcWithType = (...args: Parameters<typeof hc>): ApiClient => hc<AppType>(...args);

/**
 * Fully typed client. An empty `baseUrl` = same origin (used in the browser); then `$url()`
 * cannot build absolute URLs; pass `location.origin` if needed.
 */
export function createApiClient(baseUrl = '', options?: ClientRequestOptions): ApiClient {
  return hcWithType(baseUrl, options);
}
