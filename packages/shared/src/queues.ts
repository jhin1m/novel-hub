/**
 * Hợp đồng hàng đợi dùng chung giữa producer (web) và worker: tên queue, tên job và
 * schema payload. Hai phía đều parse payload bằng Zod.
 */
import { z } from 'zod';

export const QUEUES = {
  mail: 'mail',
} as const;

export const MAIL_JOBS = {
  sendAuthEmail: 'send-auth-email',
} as const;

export type MailJobName = (typeof MAIL_JOBS)[keyof typeof MAIL_JOBS];

/** Mail xác thực email (`verify`) hoặc đặt lại mật khẩu (`reset`). `url` chứa token. */
export const sendAuthEmailPayload = z.object({
  kind: z.enum(['verify', 'reset']),
  to: z.email(),
  displayName: z.string(),
  url: z.url(),
});

export type SendAuthEmailPayload = z.infer<typeof sendAuthEmailPayload>;
