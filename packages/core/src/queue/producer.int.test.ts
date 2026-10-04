import { afterAll, describe, expect, it, vi } from 'vitest';
import { createProducerConnection } from '../infra/redis';
import { withTimeout } from '../lib/with-timeout';
import { createMailQueue, enqueueAuthEmail } from './producer';

describe('createMailQueue khi Redis không chạy', () => {
  const closers: Array<() => unknown> = [];

  afterAll(async () => {
    for (const close of closers) await close();
  });

  it('queue tạo khi port đóng → enqueue bọc withTimeout reject trong dưới 1.5s', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Port 1 trên localhost không có dịch vụ nào lắng nghe.
    const connection = createProducerConnection('redis://127.0.0.1:1/0');
    const queue = createMailQueue(connection, 'test-producer');
    closers.push(() => connection.disconnect());

    const started = Date.now();
    await expect(
      withTimeout(
        enqueueAuthEmail(queue, {
          kind: 'verify',
          to: 'an@example.com',
          displayName: 'An',
          url: 'http://localhost:3000/x?token=abc',
        }),
        1_000,
        'enqueue',
      ),
    ).rejects.toThrow(/enqueue/);
    expect(Date.now() - started).toBeLessThan(1_500);
    // Lỗi kết nối được log (không crash vì thiếu listener `error` trên Queue).
    expect(error).toHaveBeenCalledWith('[queue:mail] lỗi kết nối:', expect.any(String));
    error.mockRestore();
  });
});
