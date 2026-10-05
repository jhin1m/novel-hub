/**
 * Typed `hc` client for `/api/v1/*`, used in the browser (with TanStack Query) for
 * personal, uncached data.
 *
 * SSR does not make HTTP calls to itself: loaders fetch data via `createServerFn` → `core`.
 * This file may only import from `@novel-hub/api/client` (ESLint blocks other entries) so
 * the client bundle does not pull in `pg`/`ioredis`.
 */
export {
  type ApiClient,
  type ClientResponse,
  type SuccessBody,
  createApiClient,
} from '@novel-hub/api/client';
