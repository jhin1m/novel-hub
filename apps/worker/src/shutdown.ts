export type Closable = () => Promise<unknown>;

/**
 * Tín hiệu đến trong khoảng này sau tín hiệu đầu được coi là trùng, không phải người dùng
 * bấm lần hai: Ctrl+C gửi SIGINT cho cả nhóm process, rồi `tsx watch` chuyển tiếp thêm
 * một SIGINT cho process con (ms).
 */
const DUPLICATE_SIGNAL_WINDOW_MS = 1_000;

export interface ShutdownOptions {
  /** Quá thời gian này mà chưa đóng xong thì `exit(1)` (ms). */
  timeoutMs: number;
  exit: (code: number) => void;
}

/**
 * Khi nhận SIGINT/SIGTERM: đóng lần lượt `closables` (worker trước để chờ job đang chạy
 * xong, kết nối sau) rồi `exit(0)`. Lỗi hoặc quá `timeoutMs` thì `exit(1)`; nhận tín hiệu
 * lần hai (sau `DUPLICATE_SIGNAL_WINDOW_MS`) thì `exit(1)` ngay. Trả về hàm shutdown để
 * gọi trực tiếp.
 */
export function registerShutdown(
  closables: Closable[],
  { timeoutMs, exit }: ShutdownOptions,
): (signal: NodeJS.Signals) => Promise<void> {
  let startedAt: number | undefined;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (startedAt !== undefined) {
      if (Date.now() - startedAt >= DUPLICATE_SIGNAL_WINDOW_MS) exit(1);
      return;
    }
    startedAt = Date.now();
    console.info(`[worker] nhận ${signal}, đang đóng...`);
    const timer = setTimeout(() => {
      console.error(`[worker] đóng quá ${timeoutMs}ms, thoát cưỡng bức`);
      exit(1);
    }, timeoutMs);
    try {
      for (const close of closables) await close();
      exit(0);
    } catch (err) {
      console.error('[worker] lỗi khi đóng:', err instanceof Error ? err.message : err);
      exit(1);
    } finally {
      clearTimeout(timer);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
  return shutdown;
}
