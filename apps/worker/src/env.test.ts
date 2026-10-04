import { loadServerEnv } from '@novel-hub/shared/env';
import { describe, expect, it } from 'vitest';
import { workerEnvSchema } from './env';

const base = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  REDIS_URL: 'redis://localhost:6379/0',
};

function load(env: NodeJS.ProcessEnv) {
  return loadServerEnv(workerEnvSchema, { env, loadFile: false });
}

describe('workerEnvSchema', () => {
  it('dev không cần biến DB, auth hay SMTP; QUEUE_PREFIX có mặc định', () => {
    expect(load(base)).toEqual({ ...base, QUEUE_PREFIX: 'novelhub', SMTP_PORT: 587 });
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
