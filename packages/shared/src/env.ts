/**
 * Env phía server, tách thành từng mảnh Zod. Mỗi consumer chỉ ghép mảnh mình cần,
 * ví dụ `appEnvSchema.extend(dbEnvSchema.shape)`, để `drizzle.config.ts` không đòi
 * biến auth và worker không đòi biến của web.
 *
 * Chỉ import từ subpath `@novel-hub/shared/env` (dùng `node:fs`), không re-export ở
 * entry chính để không lọt vào bundle client.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const redisUrl = z.url({ protocol: /^rediss?$/ });

// `NODE_ENV` không có default: guard seed/truncate dựa vào giá trị tường minh.
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

/** Tiền tố key của BullMQ; test và e2e đặt tiền tố riêng để không lẫn job của dev. */
export const queueEnvSchema = z.object({
  QUEUE_PREFIX: z.string().default('novelhub'),
});

export const testEnvSchema = z.object({
  TEST_DATABASE_URL: postgresUrl,
  TEST_REDIS_URL: redisUrl,
});

/** Ghép bằng `.extend(authEnvSchema.shape)` rồi bọc `requireGooglePair`. */
export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: httpUrl,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

/** SMTP để trống `SMTP_HOST` = chế độ dev in link ra log. Ghép rồi bọc `requireSmtpInProduction`. */
export const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

// Refine viết dạng hàm bọc schema đã ghép: Zod 4 không cho `.extend()` schema đã có
// refine, và `.shape` của nó thì bỏ mất refine.

interface GooglePairEnv {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
}

/** `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` phải có cả hai hoặc không có cái nào. */
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
 * Production bắt buộc có `SMTP_HOST` và `SMTP_FROM`: thiếu thì khởi động thất bại, thay
 * vì rơi về chế độ log và ghi link chứa token ra log.
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

export interface LoadServerEnvOptions {
  /** Nguồn biến để parse. Mặc định `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Nạp `.env` ở gốc repo vào `process.env` trước khi parse (không ghi đè biến đã có).
   * Mặc định `true`. Bị bỏ qua khi truyền `env`, hoặc khi không có gốc repo (production
   * chỉ ship bản build, biến lấy từ Docker/host).
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

/** Đi ngược từ `start` tới thư mục chứa `pnpm-workspace.yaml`; không thấy thì throw. */
export function findRepoRoot(start: string = process.cwd()): string {
  const root = locateRepoRoot(start);
  if (root === undefined) throw new Error('Không tìm thấy gốc repo (thiếu pnpm-workspace.yaml)');
  return root;
}

/**
 * Parse env bằng `schema`. Biến rỗng (`KEY=`) được coi như chưa đặt.
 * Lỗi thì throw `Error` chỉ liệt kê tên biến (kèm message của refine nếu có), không bao
 * giờ in giá trị; việc thoát process do entry CLI tự quyết.
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
    // Message của refine do code tự viết (không chứa input) nên in được; message của
    // Zod thì bỏ qua để chắc chắn không lộ giá trị.
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
