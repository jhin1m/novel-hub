/** Lỗi khi một thao tác chạy quá thời gian cho phép. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: quá ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Chờ `p` tối đa `ms`; quá hạn thì reject bằng `TimeoutError`. Không huỷ được `p`
 * (promise không hỗ trợ huỷ), chỉ ngừng chờ nó.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
