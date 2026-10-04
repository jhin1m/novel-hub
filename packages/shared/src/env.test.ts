import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  appEnvSchema,
  authEnvSchema,
  dbEnvSchema,
  findRepoRoot,
  loadServerEnv,
  queueEnvSchema,
  redisEnvSchema,
  requireGooglePair,
  requireSmtpInProduction,
  smtpEnvSchema,
  testEnvSchema,
} from './env';

const SECRET_URL = 'postgres://user:super-secret-pw@localhost:5432/novel_hub';

const validApp = { NODE_ENV: 'development', APP_URL: 'http://localhost:3000' };
const appDb = appEnvSchema.extend(dbEnvSchema.shape);

function load<S extends Parameters<typeof loadServerEnv>[0]>(schema: S, env: NodeJS.ProcessEnv) {
  return loadServerEnv(schema, { env, loadFile: false });
}

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    if (err instanceof Error) return err;
  }
  throw new Error('Không throw');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadServerEnv', () => {
  it('trả object đã parse khi đủ biến', () => {
    expect(load(appDb, { ...validApp, DATABASE_URL: SECRET_URL, OTHER: 'x' })).toEqual({
      ...validApp,
      DATABASE_URL: SECRET_URL,
    });
  });

  it('thiếu DATABASE_URL → throw, message có tên biến', () => {
    const err = errorOf(() => load(appDb, validApp));
    expect(err.message).toContain('DATABASE_URL (thiếu)');
  });

  it('message lỗi không chứa giá trị của biến nào', () => {
    const err = errorOf(() =>
      load(appDb.extend(redisEnvSchema.shape), {
        NODE_ENV: 'staging-secret-value',
        APP_URL: 'not-a-url-secret',
        DATABASE_URL: SECRET_URL,
        REDIS_URL: 'redis-secret-value',
      }),
    );
    expect(err.message).toContain('NODE_ENV (không hợp lệ)');
    expect(err.message).toContain('APP_URL (không hợp lệ)');
    expect(err.message).toContain('REDIS_URL (không hợp lệ)');
    for (const value of [
      'staging-secret-value',
      'not-a-url-secret',
      'super-secret-pw',
      'redis-secret-value',
    ]) {
      expect(err.message).not.toContain(value);
    }
  });

  it('thiếu NODE_ENV → lỗi, không tự lấy mặc định', () => {
    const err = errorOf(() => load(appEnvSchema, { APP_URL: validApp.APP_URL }));
    expect(err.message).toContain('NODE_ENV (thiếu)');
  });

  it('biến rỗng được coi như thiếu', () => {
    const err = errorOf(() => load(dbEnvSchema, { DATABASE_URL: '' }));
    expect(err.message).toContain('DATABASE_URL (thiếu)');
  });

  it('schema ghép: thiếu một biến của mảnh nào cũng lỗi', () => {
    expect(errorOf(() => load(appDb, { ...validApp })).message).toContain('DATABASE_URL');
    expect(
      errorOf(() => load(appDb, { NODE_ENV: 'test', DATABASE_URL: SECRET_URL })).message,
    ).toContain('APP_URL');
  });

  it('dbEnvSchema riêng chỉ cần DATABASE_URL', () => {
    expect(load(dbEnvSchema, { DATABASE_URL: SECRET_URL })).toEqual({ DATABASE_URL: SECRET_URL });
  });

  it('testEnvSchema cần cả DB và Redis test', () => {
    const err = errorOf(() => load(testEnvSchema, { TEST_DATABASE_URL: SECRET_URL }));
    expect(err.message).toContain('TEST_REDIS_URL (thiếu)');
  });

  it('loadFile: false → không đọc file .env', () => {
    const spy = vi.spyOn(process, 'loadEnvFile');
    load(dbEnvSchema, { DATABASE_URL: SECRET_URL });
    expect(spy).not.toHaveBeenCalled();
  });

  it('truyền env → không đọc file .env dù không đặt loadFile', () => {
    const spy = vi.spyOn(process, 'loadEnvFile');
    loadServerEnv(dbEnvSchema, { env: { DATABASE_URL: SECRET_URL } });
    expect(spy).not.toHaveBeenCalled();
  });

  it('URL sai giao thức → không hợp lệ', () => {
    expect(
      errorOf(() => load(dbEnvSchema, { DATABASE_URL: 'javascript:alert(1)' })).message,
    ).toContain('DATABASE_URL (không hợp lệ)');
    expect(
      errorOf(() => load(redisEnvSchema, { REDIS_URL: 'http://localhost:6379' })).message,
    ).toContain('REDIS_URL (không hợp lệ)');
    expect(load(redisEnvSchema, { REDIS_URL: 'rediss://cache:6380/0' })).toEqual({
      REDIS_URL: 'rediss://cache:6380/0',
    });
  });

  it('lỗi refine giữ message do code viết, có hoặc không có path', () => {
    const withPath = dbEnvSchema.superRefine((_, ctx) => {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'bắt buộc khi production' });
    });
    expect(errorOf(() => load(withPath, { DATABASE_URL: SECRET_URL })).message).toContain(
      'SMTP_HOST (bắt buộc khi production)',
    );

    const noPath = dbEnvSchema.refine(() => false, { message: 'cần đủ cặp GOOGLE_*' });
    expect(errorOf(() => load(noPath, { DATABASE_URL: SECRET_URL })).message).toContain(
      '(gốc) (cần đủ cặp GOOGLE_*)',
    );
  });
});

describe('authEnvSchema + requireGooglePair', () => {
  const schema = requireGooglePair(authEnvSchema);
  const base = { BETTER_AUTH_SECRET: 's'.repeat(32), BETTER_AUTH_URL: 'http://localhost:3000' };

  it('không có Google → hợp lệ', () => {
    expect(load(schema, base)).toEqual(base);
  });

  it('đủ cặp Google → hợp lệ', () => {
    const env = { ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
    expect(load(schema, env)).toEqual(env);
  });

  it('chỉ có GOOGLE_CLIENT_ID → lỗi, không in giá trị', () => {
    const err = errorOf(() => load(schema, { ...base, GOOGLE_CLIENT_ID: 'id-bi-mat' }));
    expect(err.message).toContain('GOOGLE_CLIENT_SECRET (cần đủ cặp GOOGLE_*)');
    expect(err.message).not.toContain('id-bi-mat');
  });

  it('chỉ có GOOGLE_CLIENT_SECRET → lỗi', () => {
    const err = errorOf(() => load(schema, { ...base, GOOGLE_CLIENT_SECRET: 'x' }));
    expect(err.message).toContain('GOOGLE_CLIENT_ID (cần đủ cặp GOOGLE_*)');
  });

  it('secret ngắn hơn 32 ký tự → lỗi', () => {
    const err = errorOf(() => load(schema, { ...base, BETTER_AUTH_SECRET: 'ngan' }));
    expect(err.message).toContain('BETTER_AUTH_SECRET (không hợp lệ)');
  });
});

describe('smtpEnvSchema + requireSmtpInProduction', () => {
  const schema = requireSmtpInProduction(appEnvSchema.extend(smtpEnvSchema.shape));

  it('dev không có SMTP → hợp lệ, cổng mặc định 587', () => {
    expect(load(schema, validApp)).toEqual({ ...validApp, SMTP_PORT: 587 });
  });

  it('production thiếu SMTP_HOST/SMTP_FROM → lỗi', () => {
    const err = errorOf(() => load(schema, { ...validApp, NODE_ENV: 'production' }));
    expect(err.message).toContain('SMTP_HOST (bắt buộc khi production)');
    expect(err.message).toContain('SMTP_FROM (bắt buộc khi production)');
  });

  it('production đủ SMTP → hợp lệ, SMTP_PORT ép kiểu số', () => {
    const env = { ...validApp, NODE_ENV: 'production', SMTP_HOST: 'smtp.x', SMTP_FROM: 'a@x' };
    expect(load(schema, { ...env, SMTP_PORT: '465' })).toEqual({ ...env, SMTP_PORT: 465 });
  });
});

describe('queueEnvSchema', () => {
  it('thiếu QUEUE_PREFIX → mặc định novelhub; có thì giữ nguyên', () => {
    expect(load(queueEnvSchema, {})).toEqual({ QUEUE_PREFIX: 'novelhub' });
    expect(load(queueEnvSchema, { QUEUE_PREFIX: 'e2e' })).toEqual({ QUEUE_PREFIX: 'e2e' });
  });
});

describe('loadServerEnv nạp file .env', () => {
  const FROM_FILE = 'NOVEL_HUB_TEST_FROM_FILE';
  const PRESET = 'NOVEL_HUB_TEST_PRESET';
  const schema = z.object({ [FROM_FILE]: z.string(), [PRESET]: z.string() });

  afterEach(() => {
    // `process.loadEnvFile` ghi thẳng vào process.env nên phải dọn tay.
    for (const key of [FROM_FILE, PRESET]) delete process.env[key];
  });

  it('đọc .env ở gốc repo, không ghi đè biến đã đặt', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-hub-envfile-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(join(root, '.env'), `${FROM_FILE}=from-file\n${PRESET}=from-file\n`);
    const nested = join(root, 'apps', 'web');
    mkdirSync(nested, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(nested);
    process.env[PRESET] = 'preset';

    expect(loadServerEnv(schema)).toEqual({ [FROM_FILE]: 'from-file', [PRESET]: 'preset' });
  });

  it('không có gốc repo → bỏ qua file, parse process.env bình thường', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'novel-hub-noroot-')));
    const spy = vi.spyOn(process, 'loadEnvFile');
    process.env[FROM_FILE] = 'a';
    process.env[PRESET] = 'b';

    expect(loadServerEnv(schema)).toEqual({ [FROM_FILE]: 'a', [PRESET]: 'b' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('findRepoRoot', () => {
  it('đi ngược lên tới thư mục chứa pnpm-workspace.yaml', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-hub-root-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const nested = join(root, 'packages', 'a', 'src');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('không tìm thấy thì throw', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'novel-hub-none-'));
    expect(() => findRepoRoot(lonely)).toThrow(/pnpm-workspace\.yaml/);
  });
});
