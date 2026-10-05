import type {
  CurrentUser,
  Db,
  HealthReport,
  RateLimiter,
  SearchCtx,
  StoragePort,
  ViewCounter,
} from '@novel-hub/core';

/** The auth part the API needs; the mount point builds it from Better Auth (`createAuth`, `getCurrentUser`). */
export interface AuthPort {
  /** Handles every `/api/auth/*` request. */
  handler: (request: Request) => Promise<Response>;
  /**
   * User of the session cookie (no session or banned → `null`) plus the
   * `Set-Cookie` headers to send back (session renewal).
   */
  lookupSession: (headers: Headers) => Promise<{ user: CurrentUser | null; setCookies: string[] }>;
}

/** Server-side dependencies the app needs; the mount point (apps/web) builds and passes them in. */
export interface ApiDeps {
  checkHealth: () => Promise<HealthReport>;
  auth: AuthPort;
  /** Web origin, used for the CSRF check on `/api/v1/*`. */
  appUrl: string;
  db: Db;
  /** `null` when S3 is not configured (dev): cover uploads answer 503 `STORAGE_UNAVAILABLE`. */
  storage: StoragePort | null;
  /** Counts chapter reads in Redis; `null` when unavailable (reads are then not counted). */
  viewCounter: ViewCounter | null;
  /** Search-only Meilisearch client; `null` when not configured (dev): search answers 503. */
  search: SearchCtx | null;
  /** Redis rate limits of writes and auth actions; `null` turns them off (tests that do not need them). */
  rateLimit: RateLimiter | null;
  /** The client address (`clientIp` of core, bound to the deployment's proxy trust). */
  clientIp: (request: Request) => string | null;
}
