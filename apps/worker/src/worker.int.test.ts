import {
  type MailMessage,
  createMailQueue,
  createProducerConnection,
  createWorkerConnection,
  enqueueAuthEmail,
} from '@novel-hub/core';
import { MAIL_JOBS, type SendAuthEmailPayload } from '@novel-hub/shared';
import { loadServerEnv, testEnvSchema } from '@novel-hub/shared/env';
import type { Worker } from 'bullmq';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createMailWorker } from './mail-worker';

const { TEST_REDIS_URL } = loadServerEnv(testEnvSchema.pick({ TEST_REDIS_URL: true }));
// Tiền tố riêng mỗi lần chạy để không đụng job của dev hay của lần chạy trước.
const PREFIX = `test-worker-${Date.now().toString(36)}`;

const payload: SendAuthEmailPayload = {
  kind: 'verify',
  to: 'an@example.com',
  displayName: 'An',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc',
};

describe('worker queue mail (Redis thật)', () => {
  const producerRedis = createProducerConnection(TEST_REDIS_URL);
  const queue = createMailQueue(producerRedis, PREFIX);
  const workerRedis = createWorkerConnection(TEST_REDIS_URL);
  let worker: Worker | undefined;

  /** Khởi động worker với mailer stub; trả về spy của `send`. */
  function startWorker(send: (msg: MailMessage) => Promise<void>) {
    const sent = vi.fn(send);
    worker = createMailWorker(workerRedis, PREFIX, { mailer: { send: sent } });
    return sent;
  }

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    producerRedis.disconnect();
    workerRedis.disconnect();
  });

  it('enqueue → worker gửi mail qua mailer với đúng người nhận và URL', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    let deliver: (msg: MailMessage) => void = () => {};
    const delivered = new Promise<MailMessage>((resolve) => (deliver = resolve));
    startWorker((msg) => {
      deliver(msg);
      return Promise.resolve();
    });

    await enqueueAuthEmail(queue, payload);
    const msg = await delivered;
    expect(msg.to).toBe(payload.to);
    expect(msg.text).toContain(payload.url);
  });

  it('mailer lỗi lần đầu → job retry, lần hai thành công', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const failedLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));
    let calls = 0;
    const sent = startWorker(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('smtp tạm lỗi'));
      finish();
      return Promise.resolve();
    });

    // Rút ngắn backoff để test nhanh; số lần thử vẫn lấy từ tuỳ chọn mặc định.
    await queue.add(MAIL_JOBS.sendAuthEmail, payload, { backoff: { type: 'fixed', delay: 50 } });
    await done;
    expect(sent).toHaveBeenCalledTimes(2);
    // Log lỗi không chứa payload (URL có token).
    const logged = failedLog.mock.calls.flat().join(' ');
    expect(logged).toContain('smtp tạm lỗi');
    expect(logged).not.toContain('token=abc');
  });
});
