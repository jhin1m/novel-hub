import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('trả giá trị khi promise xong trước hạn', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'x')).resolves.toBe(42);
  });

  it('giữ nguyên lỗi gốc khi promise reject trước hạn', async () => {
    const err = new Error('gốc');
    await expect(withTimeout(Promise.reject(err), 100, 'x')).rejects.toBe(err);
  });

  it('reject TimeoutError khi quá hạn', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 2_000, 'postgres');
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });

  it('xoá timer sau khi xong', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 2_000, 'x');
    expect(vi.getTimerCount()).toBe(0);
  });
});
