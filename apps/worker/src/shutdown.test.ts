import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerShutdown } from './shutdown';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(closables: Array<() => Promise<unknown>>, timeoutMs = 1_000) {
  const handlers = new Map<string, () => void>();
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    handlers.set(String(event), listener as () => void);
    return process;
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const exit = vi.fn();
  const shutdown = registerShutdown(closables, { timeoutMs, exit });
  return { handlers, exit, shutdown };
}

describe('registerShutdown', () => {
  it('đăng ký SIGINT và SIGTERM', () => {
    const { handlers } = setup([]);
    expect([...handlers.keys()]).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('đóng mọi closable theo thứ tự rồi exit(0)', async () => {
    const order: string[] = [];
    const { exit, shutdown } = setup([
      () => Promise.resolve(order.push('worker')),
      () => Promise.resolve(order.push('redis')),
    ]);
    await shutdown('SIGTERM');
    expect(order).toEqual(['worker', 'redis']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('closable lỗi → exit(1)', async () => {
    const { exit, shutdown } = setup([() => Promise.reject(new Error('hỏng'))]);
    await shutdown('SIGINT');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('quá timeout → exit(1)', async () => {
    vi.useFakeTimers();
    const { exit, shutdown } = setup([() => new Promise(() => {})], 30_000);
    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('tín hiệu trùng ngay sau tín hiệu đầu (tsx watch chuyển tiếp) → bỏ qua, vẫn đóng sạch', async () => {
    let release: () => void = () => {};
    const closing = new Promise<void>((resolve) => (release = resolve));
    const { exit, handlers } = setup([() => closing]);
    handlers.get('SIGINT')?.();
    handlers.get('SIGINT')?.();
    await Promise.resolve();
    expect(exit).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(0));
  });

  it('tín hiệu lần hai sau 1s trong lúc đang đóng → exit(1) ngay', async () => {
    vi.useFakeTimers();
    const { exit, handlers } = setup([() => new Promise(() => {})], 30_000);
    handlers.get('SIGINT')?.();
    await vi.advanceTimersByTimeAsync(1_000);
    handlers.get('SIGINT')?.();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
