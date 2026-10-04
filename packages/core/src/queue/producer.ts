import {
  MAIL_JOBS,
  type MailJobName,
  QUEUES,
  type SendAuthEmailPayload,
  sendAuthEmailPayload,
} from '@novel-hub/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { logRedisErrors } from '../infra/redis';
import { DEFAULT_JOB_OPTIONS } from './job-options';

export type MailQueue = Queue<SendAuthEmailPayload, void, MailJobName>;

/** Queue `mail` phía producer, kèm tuỳ chọn job mặc định và log lỗi kết nối. */
export function createMailQueue(connection: Redis, prefix: string): MailQueue {
  const queue: MailQueue = new Queue(QUEUES.mail, {
    connection,
    prefix,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  logRedisErrors(connection, '[queue:mail]', queue);
  return queue;
}

/**
 * Đẩy job gửi mail auth. Parse payload trước khi `add` để job hỏng không bao giờ vào
 * hàng đợi. Không tự đặt timeout: nơi gọi bọc `withTimeout`.
 */
export async function enqueueAuthEmail(
  queue: Pick<MailQueue, 'add'>,
  payload: SendAuthEmailPayload,
): Promise<void> {
  const data = sendAuthEmailPayload.parse(payload);
  await queue.add(MAIL_JOBS.sendAuthEmail, data);
}
