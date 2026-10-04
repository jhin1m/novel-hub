import { type Mailer, buildAuthEmail } from '@novel-hub/core';
import { sendAuthEmailPayload } from '@novel-hub/shared';
import { UnrecoverableError } from 'bullmq';

export interface SendAuthEmailDeps {
  mailer: Mailer;
}

/**
 * Gửi mail xác thực hoặc đặt lại mật khẩu. Payload sai thì không thử lại
 * (`UnrecoverableError`); lỗi của mailer thì ném ra để BullMQ retry.
 * Message lỗi không chứa payload vì URL có token.
 */
export async function processSendAuthEmail(data: unknown, { mailer }: SendAuthEmailDeps) {
  const parsed = sendAuthEmailPayload.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('payload send-auth-email không hợp lệ');
  const msg = parsed.data;
  await mailer.send({ to: msg.to, ...buildAuthEmail(msg) });
}
