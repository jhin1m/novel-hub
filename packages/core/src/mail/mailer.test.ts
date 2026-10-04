import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthEmail } from './auth-emails';
import { createMailer, mailerConfigFromEnv } from './mailer';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createMailer', () => {
  it('mode log khi NODE_ENV=production → throw', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createMailer({ mode: 'log' })).toThrow(/production/);
  });

  it('mode log ở dev → in mail ra console', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await createMailer({ mode: 'log' }).send({ to: 'a@x.vn', subject: 'S', text: 'link http://u' });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('http://u'));
  });
});

describe('mailerConfigFromEnv', () => {
  it('không có SMTP_HOST → log', () => {
    expect(mailerConfigFromEnv({ SMTP_PORT: 587 })).toEqual({ mode: 'log' });
  });

  it('có SMTP_HOST mà thiếu SMTP_FROM → throw', () => {
    expect(() => mailerConfigFromEnv({ SMTP_HOST: 'smtp.x', SMTP_PORT: 587 })).toThrow(/SMTP_FROM/);
  });

  it('đủ → smtp', () => {
    expect(
      mailerConfigFromEnv({
        SMTP_HOST: 'smtp.x',
        SMTP_PORT: 465,
        SMTP_FROM: 'a@x',
        SMTP_USER: 'u',
      }),
    ).toEqual({ mode: 'smtp', host: 'smtp.x', port: 465, from: 'a@x', user: 'u', pass: undefined });
  });
});

describe('buildAuthEmail', () => {
  it('verify và reset có tiêu đề khác nhau, nội dung chứa tên và URL', () => {
    const verify = buildAuthEmail({ kind: 'verify', displayName: 'An', url: 'http://v' });
    const reset = buildAuthEmail({ kind: 'reset', displayName: 'An', url: 'http://r' });
    expect(verify.subject).not.toBe(reset.subject);
    expect(verify.text).toContain('An');
    expect(verify.text).toContain('http://v');
    expect(reset.text).toContain('http://r');
  });
});
