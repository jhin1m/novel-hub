/**
 * Server-side connections shared by the Hono API and server functions. Import only from server
 * routes, server functions or other server code, never from components.
 *
 * - Connections (Postgres pool, Redis) are created once and cached on `globalThis`, so dev HMR does
 *   not open new ones.
 * - A failed start (bad env) clears the cache so the next request retries.
 * - Optional subsystems (S3 storage, search) parse their env separately: a missing set disables the
 *   feature (its endpoints answer 503) instead of taking down everything else.
 */
import {
  type MailQueue,
  type RateLimiter,
  type SearchCtx,
  type StoragePort,
  type ViewCounter,
  createHealthRedis,
  createMailQueue,
  createClientIpResolver,
  createProducerConnection,
  createRateLimiter,
  createS3Storage,
  createSearchCtx,
  createViewCounter,
  s3ConfigFromEnv,
  withTimeout,
} from '@novel-hub/core';
import { type Db, createDb } from '@novel-hub/db';
import {
  appEnvSchema,
  authEnvSchema,
  dbEnvSchema,
  loadOptionalEnv,
  assertMeiliSearchKeyIsNotMaster,
  loadServerEnv,
  meiliWebEnvSchema,
  queueEnvSchema,
  rateLimitEnvSchema,
  redisEnvSchema,
  requireGooglePair,
  requireUnitRateLimitFactorInProduction,
  s3EnvSchema,
} from '@novel-hub/shared/env';
import type { z } from 'zod';

// The web app sends no mail (the worker does), so it needs no SMTP variables.
const serverEnvSchema = requireUnitRateLimitFactorInProduction(
  requireGooglePair(
    appEnvSchema
      .extend(dbEnvSchema.shape)
      .extend(redisEnvSchema.shape)
      .extend(queueEnvSchema.shape)
      .extend(authEnvSchema.shape)
      .extend(rateLimitEnvSchema.shape),
  ),
);

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export interface Infra {
  env: ServerEnv;
  db: Db;
  healthRedis: ReturnType<typeof createHealthRedis>;
  /** Producer connection (no offline queue: commands fail fast while Redis is down). */
  producerRedis: ReturnType<typeof createProducerConnection>;
  mailQueue: MailQueue;
  /** Counts chapter reads on `producerRedis`. */
  viewCounter: ViewCounter;
  /** Rate limits on `producerRedis`. */
  rateLimit: RateLimiter;
  /** The client address, trusting `CF-Connecting-IP` only with `TRUST_CF_IP`. */
  clientIp: (request: Request) => string | null;
  /** `null` when `S3_*` is not configured (dev only; production refuses to start). */
  storage: StoragePort | null;
  /** Search-only Meilisearch client; `null` when `MEILI_SEARCH_KEY` is not set (dev only). */
  search: SearchCtx | null;
  close: () => Promise<void>;
}

/** How long to wait for Redis at startup, and for the pool/queue to close at shutdown (ms). */
const REDIS_CONNECT_WAIT_MS = 2_000;
/** Past this a rate limit check falls back to the rule's `onStoreError` (ms). */
const RATE_LIMIT_TIMEOUT_MS = 500;
const POOL_CLOSE_WAIT_MS = 5_000;
const QUEUE_CLOSE_WAIT_MS = 2_000;

const globalState = globalThis as typeof globalThis & {
  __novelHubInfra?: Promise<Infra>;
  __novelHubSignalsRegistered?: boolean;
};

async function createInfra(): Promise<Infra> {
  const env = loadServerEnv(serverEnvSchema);
  // `loadServerEnv` has loaded `.env` into `process.env` by now.
  const s3Env = loadOptionalEnv(s3EnvSchema, process.env, 's3');
  const storage = s3Env ? createS3Storage(s3ConfigFromEnv(s3Env)) : null;
  // The web only ever holds the search-only key; writes go through the worker's master key.
  const meiliEnv = loadOptionalEnv(meiliWebEnvSchema, process.env, 'meili');
  if (meiliEnv) {
    assertMeiliSearchKeyIsNotMaster(meiliEnv, process.env.MEILI_MASTER_KEY, env.NODE_ENV);
  }
  const search = meiliEnv
    ? createSearchCtx({
        url: meiliEnv.MEILI_URL,
        apiKey: meiliEnv.MEILI_SEARCH_KEY,
        prefix: env.QUEUE_PREFIX,
      })
    : null;
  const { db, pool } = createDb(env.DATABASE_URL);
  const healthRedis = createHealthRedis(env.REDIS_URL);
  // Wait for the connection so the first health check does not report a false outage. A dead
  // Redis at startup does not block the API: ioredis keeps retrying and health reports
  // `redis: down` until it connects.
  await withTimeout(healthRedis.connect(), REDIS_CONNECT_WAIT_MS, 'redis connect').catch(() => {});
  // Create the queue up front so its connection is ready before the first request sends mail.
  const producerRedis = createProducerConnection(env.REDIS_URL);
  const mailQueue = createMailQueue(producerRedis, env.QUEUE_PREFIX);
  // Same prefix as the worker that flushes the counters.
  const viewCounter = createViewCounter(producerRedis, env.QUEUE_PREFIX);
  const rateLimit = createRateLimiter({
    redis: producerRedis,
    prefix: env.QUEUE_PREFIX,
    factor: env.RATE_LIMIT_FACTOR,
    timeoutMs: RATE_LIMIT_TIMEOUT_MS,
  });
  const clientIp = createClientIpResolver({ trustCf: env.TRUST_CF_IP });
  const close = async () => {
    // With Redis down `Queue.close` may wait forever, so bound it.
    await withTimeout(mailQueue.close(), QUEUE_CLOSE_WAIT_MS, 'queue close').catch(() => {});
    // `disconnect`, not `quit`: `quit` needs a live connection; with Redis down it fails and
    // ioredis keeps reconnecting, which keeps the process alive.
    producerRedis.disconnect();
    healthRedis.disconnect();
    await withTimeout(pool.end(), POOL_CLOSE_WAIT_MS, 'pool end').catch(() => {});
  };
  return {
    env,
    db,
    healthRedis,
    producerRedis,
    mailQueue,
    viewCounter,
    rateLimit,
    clientIp,
    storage,
    search,
    close,
  };
}

export function getInfra(): Promise<Infra> {
  globalState.__novelHubInfra ??= createInfra().catch((err: unknown) => {
    globalState.__novelHubInfra = undefined;
    throw err;
  });
  registerCloseOnSignal();
  return globalState.__novelHubInfra;
}

/** Closes the pool and Redis on SIGINT/SIGTERM. Registered once per process. */
function registerCloseOnSignal(): void {
  if (globalState.__novelHubSignalsRegistered) return;
  globalState.__novelHubSignalsRegistered = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      // If other listeners remain (Nitro/srvx, Vite) they close the server and the process exits
      // once idle. Otherwise this listener replaced the default behaviour and must exit itself.
      const othersHandle = process.listenerCount(signal) > 0;
      const infra = globalState.__novelHubInfra;
      globalState.__novelHubInfra = undefined;
      void (infra ?? Promise.reject(new Error('not initialised')))
        .then((i) => i.close())
        .catch(() => {})
        .finally(() => {
          if (!othersHandle) process.exit(signal === 'SIGINT' ? 130 : 143);
        });
    });
  }
}
