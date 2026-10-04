import type { MailMessage } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { routeJob } from '../router';
import { processSendAuthEmail } from './send-auth-email';

const base = { to: 'an@example.com', displayName: 'An' };

function stubMailer() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe('processSendAuthEmail', () => {
  it.each(['verify', 'reset'] as const)(
    'kind %s → gửi đúng người nhận, nội dung chứa URL',
    async (kind) => {
      const mailer = stubMailer();
      const url = `http://localhost:3000/${kind}?token=abc`;
      await processSendAuthEmail({ ...base, kind, url }, { mailer });
      expect(mailer.send).toHaveBeenCalledOnce();
      const [msg] = mailer.send.mock.calls[0] as [MailMessage];
      expect(msg.to).toBe(base.to);
      expect(msg.text).toContain(url);
    },
  );

  it('payload sai → UnrecoverableError, không gọi mailer, message không chứa payload', async () => {
    const mailer = stubMailer();
    const err: unknown = await processSendAuthEmail(
      { ...base, kind: 'verify', url: 'token-bi-mat' },
      { mailer },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect((err as Error).message).not.toContain('token-bi-mat');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('mailer lỗi → ném lỗi thường để BullMQ retry', async () => {
    const mailer = { send: vi.fn().mockRejectedValue(new Error('smtp down')) };
    const err: unknown = await processSendAuthEmail(
      { ...base, kind: 'reset', url: 'http://x/r' },
      { mailer },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnrecoverableError);
  });
});

describe('routeJob', () => {
  it('send-auth-email → processor gửi mail', async () => {
    const mailer = stubMailer();
    await routeJob(
      { name: 'send-auth-email', data: { ...base, kind: 'verify', url: 'http://x/v' } },
      { mailer },
    );
    expect(mailer.send).toHaveBeenCalledOnce();
  });

  it('tên job lạ → UnrecoverableError', async () => {
    const mailer = stubMailer();
    await expect(routeJob({ name: 'la-hoac', data: {} }, { mailer })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
