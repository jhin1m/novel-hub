import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  appEnvSchema,
  cdnEnvSchema,
  authEnvSchema,
  dbEnvSchema,
  findRepoRoot,
  loadOptionalEnv,
  loadServerEnv,
  queueEnvSchema,
  redisEnvSchema,
  requireGooglePair,
  requireSmtpInProduction,
  s3EnvSchema,
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
  it('returns the parsed object when all variables are present', () => {
    expect(load(appDb, { ...validApp, DATABASE_URL: SECRET_URL, OTHER: 'x' })).toEqual({
      ...validApp,
      DATABASE_URL: SECRET_URL,
    });
  });

  it('missing DATABASE_URL → throws, message has the variable name', () => {
    const err = errorOf(() => load(appDb, validApp));
    expect(err.message).toContain('DATABASE_URL (thiếu)');
  });

  it('error message contains no variable values', () => {
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

  it('missing NODE_ENV → error, no default applied', () => {
    const err = errorOf(() => load(appEnvSchema, { APP_URL: validApp.APP_URL }));
    expect(err.message).toContain('NODE_ENV (thiếu)');
  });

  it('an empty variable is treated as missing', () => {
    const err = errorOf(() => load(dbEnvSchema, { DATABASE_URL: '' }));
    expect(err.message).toContain('DATABASE_URL (thiếu)');
  });

  it('composed schema: a missing variable in any piece is an error', () => {
    expect(errorOf(() => load(appDb, { ...validApp })).message).toContain('DATABASE_URL');
    expect(
      errorOf(() => load(appDb, { NODE_ENV: 'test', DATABASE_URL: SECRET_URL })).message,
    ).toContain('APP_URL');
  });

  it('dbEnvSchema alone only needs DATABASE_URL', () => {
    expect(load(dbEnvSchema, { DATABASE_URL: SECRET_URL })).toEqual({ DATABASE_URL: SECRET_URL });
  });

  it('testEnvSchema needs both the test DB and Redis', () => {
    const err = errorOf(() => load(testEnvSchema, { TEST_DATABASE_URL: SECRET_URL }));
    expect(err.message).toContain('TEST_REDIS_URL (thiếu)');
  });

  it('loadFile: false → does not read the .env file', () => {
    const spy = vi.spyOn(process, 'loadEnvFile');
    load(dbEnvSchema, { DATABASE_URL: SECRET_URL });
    expect(spy).not.toHaveBeenCalled();
  });

  it('passing env → does not read the .env file even without loadFile', () => {
    const spy = vi.spyOn(process, 'loadEnvFile');
    loadServerEnv(dbEnvSchema, { env: { DATABASE_URL: SECRET_URL } });
    expect(spy).not.toHaveBeenCalled();
  });

  it('URL with the wrong protocol → invalid', () => {
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

  it('refine errors keep the code-written message, with or without a path', () => {
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

  it('no Google → valid', () => {
    expect(load(schema, base)).toEqual(base);
  });

  it('full Google pair → valid', () => {
    const env = { ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
    expect(load(schema, env)).toEqual(env);
  });

  it('only GOOGLE_CLIENT_ID → error, value not printed', () => {
    const err = errorOf(() => load(schema, { ...base, GOOGLE_CLIENT_ID: 'id-bi-mat' }));
    expect(err.message).toContain('GOOGLE_CLIENT_SECRET (cần đủ cặp GOOGLE_*)');
    expect(err.message).not.toContain('id-bi-mat');
  });

  it('only GOOGLE_CLIENT_SECRET → error', () => {
    const err = errorOf(() => load(schema, { ...base, GOOGLE_CLIENT_SECRET: 'x' }));
    expect(err.message).toContain('GOOGLE_CLIENT_ID (cần đủ cặp GOOGLE_*)');
  });

  it('secret shorter than 32 characters → error', () => {
    const err = errorOf(() => load(schema, { ...base, BETTER_AUTH_SECRET: 'ngan' }));
    expect(err.message).toContain('BETTER_AUTH_SECRET (không hợp lệ)');
  });
});

describe('smtpEnvSchema + requireSmtpInProduction', () => {
  const schema = requireSmtpInProduction(appEnvSchema.extend(smtpEnvSchema.shape));

  it('dev without SMTP → valid, default port 587', () => {
    expect(load(schema, validApp)).toEqual({ ...validApp, SMTP_PORT: 587 });
  });

  it('production missing SMTP_HOST/SMTP_FROM → error', () => {
    const err = errorOf(() => load(schema, { ...validApp, NODE_ENV: 'production' }));
    expect(err.message).toContain('SMTP_HOST (bắt buộc khi production)');
    expect(err.message).toContain('SMTP_FROM (bắt buộc khi production)');
  });

  it('production with full SMTP → valid, SMTP_PORT coerced to a number', () => {
    const env = { ...validApp, NODE_ENV: 'production', SMTP_HOST: 'smtp.x', SMTP_FROM: 'a@x' };
    expect(load(schema, { ...env, SMTP_PORT: '465' })).toEqual({ ...env, SMTP_PORT: 465 });
  });
});

describe('queueEnvSchema', () => {
  it('missing QUEUE_PREFIX → defaults to novelhub; when set it is kept', () => {
    expect(load(queueEnvSchema, {})).toEqual({ QUEUE_PREFIX: 'novelhub' });
    expect(load(queueEnvSchema, { QUEUE_PREFIX: 'e2e' })).toEqual({ QUEUE_PREFIX: 'e2e' });
  });
});

describe('loadServerEnv loads the .env file', () => {
  const FROM_FILE = 'NOVEL_HUB_TEST_FROM_FILE';
  const PRESET = 'NOVEL_HUB_TEST_PRESET';
  const schema = z.object({ [FROM_FILE]: z.string(), [PRESET]: z.string() });

  afterEach(() => {
    // `process.loadEnvFile` writes straight into process.env, so clean up manually.
    for (const key of [FROM_FILE, PRESET]) delete process.env[key];
  });

  it('reads .env at the repo root, does not override variables already set', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-hub-envfile-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(join(root, '.env'), `${FROM_FILE}=from-file\n${PRESET}=from-file\n`);
    const nested = join(root, 'apps', 'web');
    mkdirSync(nested, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(nested);
    process.env[PRESET] = 'preset';

    expect(loadServerEnv(schema)).toEqual({ [FROM_FILE]: 'from-file', [PRESET]: 'preset' });
  });

  it('no repo root → skips the file, parses process.env as usual', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'novel-hub-noroot-')));
    const spy = vi.spyOn(process, 'loadEnvFile');
    process.env[FROM_FILE] = 'a';
    process.env[PRESET] = 'b';

    expect(loadServerEnv(schema)).toEqual({ [FROM_FILE]: 'a', [PRESET]: 'b' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('findRepoRoot', () => {
  it('walks up to the directory containing pnpm-workspace.yaml', () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-hub-root-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const nested = join(root, 'packages', 'a', 'src');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('throws when not found', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'novel-hub-none-'));
    expect(() => findRepoRoot(lonely)).toThrow(/pnpm-workspace\.yaml/);
  });
});

describe('s3EnvSchema', () => {
  const full = {
    S3_ENDPOINT: 'https://s3.example.com',
    S3_BUCKET: 'novel-hub-dev',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret-value',
    S3_PUBLIC_URL: 'https://s3.example.com/novel-hub-dev',
  };

  it('applies the region and path-style defaults', () => {
    expect(load(s3EnvSchema, full)).toEqual({
      ...full,
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('parses S3_FORCE_PATH_STYLE=false as false', () => {
    expect(load(s3EnvSchema, { ...full, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(
      false,
    );
    expect(
      errorOf(() => load(s3EnvSchema, { ...full, S3_FORCE_PATH_STYLE: 'yes' })).message,
    ).toContain('S3_FORCE_PATH_STYLE');
  });

  it('fails when any of the five required variables is missing', () => {
    for (const key of Object.keys(full)) {
      const env: Record<string, string> = { ...full };
      delete env[key];
      expect(errorOf(() => load(s3EnvSchema, env)).message).toContain(`${key} (thiếu)`);
    }
  });
});

describe('loadOptionalEnv', () => {
  const half = { NODE_ENV: 'development', S3_ENDPOINT: 'https://s3.example.com' };

  it('returns null and warns in development when the set is incomplete', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadOptionalEnv(s3EnvSchema, half, 's3')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('S3_BUCKET'));
  });

  it('throws in production when the set is incomplete', () => {
    expect(() => loadOptionalEnv(s3EnvSchema, { ...half, NODE_ENV: 'production' }, 's3')).toThrow(
      /S3_BUCKET/,
    );
  });

  it('returns the parsed config when the set is complete', () => {
    const env = {
      NODE_ENV: 'production',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      S3_PUBLIC_URL: 'https://cdn.example.com',
    };
    expect(loadOptionalEnv(s3EnvSchema, env, 's3')).toMatchObject({ S3_BUCKET: 'b' });
  });

  it('never prints secret values in the warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadOptionalEnv(s3EnvSchema, { ...half, S3_SECRET_ACCESS_KEY: 'very-secret' }, 's3');
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('very-secret');
  });
});

describe('cdnEnvSchema via loadOptionalEnv', () => {
  const zone = '0123456789abcdef0123456789abcdef';

  it('throws in production when the set is missing or half filled', () => {
    expect(() => loadOptionalEnv(cdnEnvSchema, { NODE_ENV: 'production' }, 'cdn')).toThrow(
      /CF_ZONE_ID.*CF_API_TOKEN/,
    );
    expect(() =>
      loadOptionalEnv(cdnEnvSchema, { NODE_ENV: 'production', CF_ZONE_ID: zone }, 'cdn'),
    ).toThrow(/CF_API_TOKEN/);
  });

  it('returns null with a warning in development when missing or half filled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadOptionalEnv(cdnEnvSchema, { NODE_ENV: 'development' }, 'cdn')).toBeNull();
    expect(
      loadOptionalEnv(cdnEnvSchema, { NODE_ENV: 'development', CF_API_TOKEN: 'secret' }, 'cdn'),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1]?.[0])).not.toContain('secret');
  });

  it('returns the pair when both are set, and rejects a malformed zone id', () => {
    const env = { NODE_ENV: 'production', CF_ZONE_ID: zone, CF_API_TOKEN: 't' };
    expect(loadOptionalEnv(cdnEnvSchema, env, 'cdn')).toEqual({
      CF_ZONE_ID: zone,
      CF_API_TOKEN: 't',
    });
    expect(() =>
      loadOptionalEnv(cdnEnvSchema, { ...env, CF_ZONE_ID: 'example.com' }, 'cdn'),
    ).toThrow(/CF_ZONE_ID/);
  });
});
