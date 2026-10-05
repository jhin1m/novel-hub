import { loadServerEnv } from '@novel-hub/shared/env';
import { describe, expect, it } from 'vitest';
import { workerEnvSchema } from './env';

const base = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  REDIS_URL: 'redis://localhost:6379/0',
  DATABASE_URL: 'postgres://novelhub:secret@localhost:5432/novel_hub',
};

function load(env: NodeJS.ProcessEnv) {
  return loadServerEnv(workerEnvSchema, { env, loadFile: false });
}

describe('workerEnvSchema', () => {
  it('dev needs no auth or SMTP variables; QUEUE_PREFIX has a default', () => {
    expect(load(base)).toEqual({ ...base, QUEUE_PREFIX: 'novelhub', SMTP_PORT: 587 });
  });

  it('requires DATABASE_URL', () => {
    expect(() => load({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL \(thiếu\)/);
  });

  it('production thiếu SMTP → lỗi', () => {
    expect(() => load({ ...base, NODE_ENV: 'production' })).toThrow(
      /SMTP_HOST \(bắt buộc khi production\)/,
    );
  });

  it('production đủ SMTP → hợp lệ', () => {
    const env = { ...base, NODE_ENV: 'production', SMTP_HOST: 'smtp.x', SMTP_FROM: 'a@x' };
    expect(load(env)).toMatchObject(env);
  });
});
