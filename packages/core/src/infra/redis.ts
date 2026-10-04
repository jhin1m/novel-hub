import { Redis } from 'ioredis';

/** Timeout cho kết nối và từng lệnh của Redis health (ms). */
const HEALTH_TIMEOUT_MS = 2_000;

/**
 * Kết nối Redis riêng cho health check. Tắt offline queue nên khi Redis chết, lệnh bị
 * từ chối ngay thay vì xếp hàng chờ; vì thế phải `await redis.connect()` trước lần
 * dùng đầu tiên (`lazyConnect`), nếu không lệnh đầu tiên luôn lỗi.
 * ioredis vẫn tự kết nối lại khi Redis sống lại.
 */
export function createHealthRedis(url: string): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: HEALTH_TIMEOUT_MS,
    connectTimeout: HEALTH_TIMEOUT_MS,
  });
  // Không có listener thì ioredis in "Unhandled error event" mỗi lần thử kết nối lại.
  logRedisErrors(redis, '[redis]');
  return redis;
}

/**
 * Kết nối cho BullMQ `Worker`. Worker dùng lệnh blocking nên bắt buộc
 * `maxRetriesPerRequest: null` (BullMQ throw nếu thiếu).
 */
export function createWorkerConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Kết nối cho BullMQ `Queue` phía web. Tắt offline queue để khi Redis chết, `add` bị
 * từ chối ngay thay vì xếp hàng chờ. Riêng lúc khởi tạo mà Redis đã chết thì `Queue`
 * vẫn chờ `ready` vô hạn, nên nơi gọi luôn bọc `withTimeout`.
 */
export function createProducerConnection(url: string): Redis {
  return new Redis(url, { enableOfflineQueue: false });
}

interface ErrorSource {
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
}

/**
 * Ghi log lỗi phát ra từ `source`. Khi `redis` chưa sẵn sàng (đang mất kết nối) thì mỗi
 * lần mất kết nối chỉ ghi lỗi đầu tiên, vì ioredis thử nối lại liên tục và lần nào cũng
 * phát lỗi; khi kết nối đang tốt thì lỗi nào cũng ghi. `source` mặc định là chính
 * `redis`; với `Queue`/`Worker` của BullMQ thì truyền chúng vào, vì chúng phát lại lỗi
 * của kết nối (và cả lỗi riêng của chúng), không có listener `error` thì process crash.
 */
export function logRedisErrors(redis: Redis, label: string, source: ErrorSource = redis): void {
  let reported = false;
  source.on('error', (err) => {
    // Lỗi kết nối của Node (AggregateError) có `message` rỗng, chỉ có `code`.
    const reason = err.message || err.code || err.name;
    if (redis.status === 'ready') {
      console.error(`${label} lỗi:`, reason);
      return;
    }
    if (reported) return;
    reported = true;
    console.error(`${label} lỗi kết nối:`, reason);
  });
  redis.on('ready', () => {
    reported = false;
  });
}

/** `PING` phải trả `PONG`; ngược lại throw. */
export async function pingRedis(redis: Pick<Redis, 'ping'>): Promise<void> {
  // Type của ioredis ghi là luôn `'PONG'`, nhưng vẫn kiểm ở runtime.
  const reply: string = await redis.ping();
  if (reply !== 'PONG') throw new Error(`Redis PING trả "${reply}"`);
}
