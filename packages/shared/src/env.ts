/**
 * Server-side env, split into Zod pieces. Each consumer composes only the pieces it needs,
 * e.g. `appEnvSchema.extend(dbEnvSchema.shape)`, so `drizzle.config.ts` does not require
 * auth variables and the worker does not require web variables.
 *
 * Import only from the `@novel-hub/shared/env` subpath (uses `node:fs`); not re-exported in
 * the main entry so it does not leak into the client bundle.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const redisUrl = z.url({ protocol: /^rediss?$/ });

// `NODE_ENV` has no default: the seed/truncate guard relies on an explicit value.
export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: httpUrl,
});

export const dbEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
});

export const redisEnvSchema = z.object({
  REDIS_URL: redisUrl,
});

/**
 * Prefix of the app's Redis keys (BullMQ queues, rate limits, view counters, search index names);
 * tests and e2e use their own prefix so they do not mix with dev data.
 */
export const queueEnvSchema = z.object({
  QUEUE_PREFIX: z.string().default('novelhub'),
});

export const testEnvSchema = z.object({
  TEST_DATABASE_URL: postgresUrl,
  TEST_REDIS_URL: redisUrl,
});

/**
 * Rate limiting (web only). Compose, then wrap with `requireUnitRateLimitFactorInProduction`.
 * - `TRUST_CF_IP`: take the client IP from `CF-Connecting-IP`. Only safe when the origin accepts
 *   connections from Cloudflare alone; otherwise anyone can set the header.
 * - `RATE_LIMIT_FACTOR`: multiplies every limit, for tests that sign up many users from one IP.
 */
export const rateLimitEnvSchema = z.object({
  TRUST_CF_IP: z.stringbool().default(false),
  RATE_LIMIT_FACTOR: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Compose with `.extend(authEnvSchema.shape)`, then wrap with `requireGooglePair`. */
export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: httpUrl,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

/** Empty `SMTP_HOST` = dev mode that prints links to the log. Compose, then wrap with `requireSmtpInProduction`. */
export const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

/**
 * S3-compatible storage (self-hosted MinIO) for covers. The five variables without a default form
 * the "complete set"; parse it with `loadOptionalEnv` so a missing set only disables uploads.
 */
export const s3EnvSchema = z.object({
  S3_ENDPOINT: httpUrl,
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_URL: httpUrl,
  S3_REGION: z.string().min(1).default('us-east-1'),
  // Not `z.coerce.boolean()`: it turns the string "false" into `true`.
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type S3Env = z.infer<typeof s3EnvSchema>;

/**
 * Cloudflare cache purge (worker only). Both variables form the set; parse it with
 * `loadOptionalEnv`, so production refuses to start without it and dev purges nothing.
 */
export const cdnEnvSchema = z.object({
  CF_ZONE_ID: z.string().regex(/^[0-9a-f]{32}$/i),
  CF_API_TOKEN: z.string().min(1),
});

export type CdnEnv = z.infer<typeof cdnEnvSchema>;

/**
 * Meilisearch for the web app: a search-only key, so a leaked web key only reads what is public
 * anyway. Parse it with `loadOptionalEnv`; without it `/api/v1/search` answers 503.
 */
export const meiliWebEnvSchema = z.object({
  MEILI_URL: httpUrl,
  MEILI_SEARCH_KEY: z.string().min(1),
});

/** Meilisearch for the worker and the reindex command, which write to the indexes. */
export const meiliWorkerEnvSchema = z.object({
  MEILI_URL: httpUrl,
  MEILI_MASTER_KEY: z.string().min(1),
});

/** Meilisearch refuses to start in production with a master key under 16 bytes; fail first here. */
export function assertMeiliMasterKeyStrength(
  cfg: { MEILI_MASTER_KEY: string },
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && Buffer.byteLength(cfg.MEILI_MASTER_KEY) < 16) {
    throw new Error('Invalid environment: MEILI_MASTER_KEY must be at least 16 bytes');
  }
}

/**
 * Production refuses a web search key equal to the master key (a copy-paste slip that would put
 * write access in the web process).
 */
export function assertMeiliSearchKeyIsNotMaster(
  cfg: { MEILI_SEARCH_KEY: string },
  masterKey: string | undefined,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && cfg.MEILI_SEARCH_KEY === masterKey) {
    throw new Error(
      'Invalid environment: MEILI_SEARCH_KEY must be a search-only key, not MEILI_MASTER_KEY',
    );
  }
}

// Refines are written as functions wrapping the composed schema: Zod 4 does not allow `.extend()` on a schema that already has
// a refine, and its `.shape` drops the refine.

interface GooglePairEnv {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
}

/** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be both present or both absent. */
export function requireGooglePair<S extends z.ZodType<GooglePairEnv>>(schema: S): S {
  return schema.superRefine((env, ctx) => {
    if ((env.GOOGLE_CLIENT_ID === undefined) === (env.GOOGLE_CLIENT_SECRET === undefined)) return;
    const missing =
      env.GOOGLE_CLIENT_ID === undefined ? 'GOOGLE_CLIENT_ID' : 'GOOGLE_CLIENT_SECRET';
    ctx.addIssue({ code: 'custom', path: [missing], message: 'cần đủ cặp GOOGLE_*' });
  });
}

interface SmtpProductionEnv {
  NODE_ENV: string;
  SMTP_HOST?: string | undefined;
  SMTP_FROM?: string | undefined;
}

/**
 * Production requires `SMTP_HOST` and `SMTP_FROM`: if missing, startup fails instead
 * of falling back to log mode and writing token-bearing links to the log.
 */
export function requireSmtpInProduction<S extends z.ZodType<SmtpProductionEnv>>(schema: S): S {
  return schema.superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['SMTP_HOST', 'SMTP_FROM'] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'bắt buộc khi production' });
      }
    }
  });
}

interface RateLimitFactorEnv {
  NODE_ENV: string;
  RATE_LIMIT_FACTOR: number;
}

/** Production refuses a loosened rate limit: `RATE_LIMIT_FACTOR` exists for tests only. */
export function requireUnitRateLimitFactorInProduction<S extends z.ZodType<RateLimitFactorEnv>>(
  schema: S,
): S {
  return schema.superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.RATE_LIMIT_FACTOR !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_FACTOR'],
        message: 'must be 1 in production',
      });
    }
  });
}

export interface LoadServerEnvOptions {
  /** Variable source to parse. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Load the repo-root `.env` into `process.env` before parsing (does not override existing variables).
   * Defaults to `true`. Ignored when `env` is passed, or when there is no repo root (production
   * ships only the build; variables come from Docker/host).
   */
  loadFile?: boolean;
}

function locateRepoRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Walk up from `start` to the directory containing `pnpm-workspace.yaml`; throws if not found. */
export function findRepoRoot(start: string = process.cwd()): string {
  const root = locateRepoRoot(start);
  if (root === undefined) throw new Error('Không tìm thấy gốc repo (thiếu pnpm-workspace.yaml)');
  return root;
}

/**
 * Parse env with `schema`. An empty variable (`KEY=`) is treated as unset.
 * On failure throws an `Error` listing only variable names (plus the refine message if any), never
 * printing values; exiting the process is up to the CLI entry.
 */
export function loadServerEnv<S extends z.ZodType>(
  schema: S,
  opts: LoadServerEnvOptions = {},
): z.infer<S> {
  if (opts.env === undefined && opts.loadFile !== false) {
    const root = locateRepoRoot(process.cwd());
    const file = root === undefined ? undefined : join(root, '.env');
    if (file !== undefined && existsSync(file)) process.loadEnvFile(file);
  }

  const source = opts.env ?? process.env;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') env[key] = value;
  }

  const result = schema.safeParse(env);
  if (result.success) return result.data;

  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '(gốc)';
    if (problems.has(key)) continue;
    // Refine messages are written by our code (they contain no input) so they are safe to print; Zod's
    // messages are skipped to make sure no value leaks.
    const reason =
      issue.code === 'custom'
        ? issue.message
        : issue.path.length === 1 && !(key in env)
          ? 'thiếu'
          : 'không hợp lệ';
    problems.set(key, reason);
  }
  const list = [...problems].map(([key, reason]) => `${key} (${reason})`).join(', ');
  throw new Error(`Biến môi trường không hợp lệ: ${list}`);
}

/**
 * Parses the env of an optional subsystem (storage, CDN purge, search) separately from the shared
 * env, so a missing or half-filled set never takes down the pool, Redis or auth. In production a
 * bad set is a startup error; elsewhere it logs a warning (variable names only) and returns
 * `null`, and the subsystem's endpoints answer 503.
 */
export function loadOptionalEnv<S extends z.ZodType>(
  schema: S,
  env: NodeJS.ProcessEnv,
  name: string,
): z.infer<S> | null {
  try {
    return loadServerEnv(schema, { env });
  } catch (err) {
    if (env.NODE_ENV === 'production') throw err;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[env] ${name} disabled: ${reason}`);
    return null;
  }
}
