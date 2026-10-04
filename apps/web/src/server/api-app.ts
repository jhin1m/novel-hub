/**
 * Dựng Hono app cho `/api/*` cùng các phụ thuộc server. Chỉ import từ server route
 * (`routes/api/*`) hoặc code server khác, không bao giờ từ component.
 *
 * - Kết nối (pool Postgres, Redis) dựng một lần và cache trên `globalThis`, nên HMR
 *   lúc dev không mở thêm kết nối.
 * - Hono app cache theo module, nên sửa code API lúc dev vẫn được nạp lại.
 * - Khởi tạo lỗi (env sai) thì xoá cache để request sau thử lại.
 */
import { type App, createApp, errorBody } from '@novel-hub/api';
import { createAuth, lookupSession } from '@novel-hub/auth';
import {
  type AuthMailPort,
  type MailQueue,
  checkHealth,
  createHealthRedis,
  createMailQueue,
  createProducerConnection,
  enqueueAuthEmail,
  pingPostgres,
  pingRedis,
  withTimeout,
} from '@novel-hub/core';
import { type Db, createDb } from '@novel-hub/db';
import {
  appEnvSchema,
  authEnvSchema,
  dbEnvSchema,
  loadServerEnv,
  queueEnvSchema,
  redisEnvSchema,
  requireGooglePair,
} from '@novel-hub/shared/env';
import type { z } from 'zod';

// Web không gửi mail (worker gửi) nên không cần biến SMTP.
const serverEnvSchema = requireGooglePair(
  appEnvSchema
    .extend(dbEnvSchema.shape)
    .extend(redisEnvSchema.shape)
    .extend(queueEnvSchema.shape)
    .extend(authEnvSchema.shape),
);

type ServerEnv = z.infer<typeof serverEnvSchema>;

interface Infra {
  env: ServerEnv;
  db: Db;
  healthRedis: ReturnType<typeof createHealthRedis>;
  mailQueue: MailQueue;
  close: () => Promise<void>;
}

/** Thời gian chờ kết nối Redis lúc khởi tạo, và chờ đóng pool/queue lúc tắt (ms). */
const REDIS_CONNECT_WAIT_MS = 2_000;
const POOL_CLOSE_WAIT_MS = 5_000;
const QUEUE_CLOSE_WAIT_MS = 2_000;
/** Đẩy job mail quá thời gian này thì bỏ, chỉ ghi log (ms). */
const ENQUEUE_TIMEOUT_MS = 1_000;

const globalState = globalThis as typeof globalThis & {
  __novelHubInfra?: Promise<Infra>;
  __novelHubSignalsRegistered?: boolean;
};

async function createInfra(): Promise<Infra> {
  const env = loadServerEnv(serverEnvSchema);
  const { db, pool } = createDb(env.DATABASE_URL);
  const healthRedis = createHealthRedis(env.REDIS_URL);
  // Chờ kết nối để health đầu tiên không báo down oan. Redis chết lúc khởi động thì
  // không chặn cả API: ioredis tự thử lại, health báo `redis: down` tới khi nối được.
  await withTimeout(healthRedis.connect(), REDIS_CONNECT_WAIT_MS, 'redis connect').catch(() => {});
  // Tạo queue ngay lúc dựng deps để kết nối sẵn sàng trước request đầu tiên cần gửi mail.
  const queueRedis = createProducerConnection(env.REDIS_URL);
  const mailQueue = createMailQueue(queueRedis, env.QUEUE_PREFIX);
  const close = async () => {
    // Redis chết thì `Queue.close` có thể chờ mãi nên giới hạn thời gian.
    await withTimeout(mailQueue.close(), QUEUE_CLOSE_WAIT_MS, 'queue close').catch(() => {});
    // `disconnect` thay vì `quit`: `quit` cần kết nối sống, Redis chết thì nó lỗi và
    // ioredis cứ thử nối lại, giữ process không thoát được.
    queueRedis.disconnect();
    healthRedis.disconnect();
    await withTimeout(pool.end(), POOL_CLOSE_WAIT_MS, 'pool end').catch(() => {});
  };
  return { env, db, healthRedis, mailQueue, close };
}

function getInfra(): Promise<Infra> {
  globalState.__novelHubInfra ??= createInfra().catch((err: unknown) => {
    globalState.__novelHubInfra = undefined;
    throw err;
  });
  registerCloseOnSignal();
  return globalState.__novelHubInfra;
}

/** Đóng pool và Redis khi process nhận SIGINT/SIGTERM. Chỉ đăng ký một lần mỗi process. */
function registerCloseOnSignal(): void {
  if (globalState.__novelHubSignalsRegistered) return;
  globalState.__novelHubSignalsRegistered = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      // Còn listener khác (Nitro/srvx, Vite) thì chúng lo việc đóng server; process tự
      // thoát khi không còn gì chạy. Nếu không, listener này đã thay hành vi mặc định
      // nên phải tự thoát.
      const othersHandle = process.listenerCount(signal) > 0;
      const infra = globalState.__novelHubInfra;
      globalState.__novelHubInfra = undefined;
      void (infra ?? Promise.reject(new Error('chưa khởi tạo')))
        .then((i) => i.close())
        .catch(() => {})
        .finally(() => {
          if (!othersHandle) process.exit(signal === 'SIGINT' ? 130 : 143);
        });
    });
  }
}

let appPromise: Promise<App> | undefined;

function buildApp(): Promise<App> {
  const promise = getInfra().then(({ env, db, healthRedis, mailQueue }) => {
    // Mail đi qua hàng đợi, worker gửi thật. `createAuth` gọi cổng này kiểu
    // fire-and-forget, bọc timeout và log lỗi, nên Redis chết không làm treo request.
    const sendAuthEmail: AuthMailPort = async (msg) => {
      await enqueueAuthEmail(mailQueue, msg);
      console.info(`[mail] đã xếp hàng mail ${msg.kind}; worker sẽ gửi`);
    };
    const auth = createAuth({ db, env, sendAuthEmail, mailTimeoutMs: ENQUEUE_TIMEOUT_MS });
    return createApp({
      appUrl: env.APP_URL,
      auth: { handler: auth.handler, lookupSession: (headers) => lookupSession(auth, headers) },
      checkHealth: () =>
        checkHealth({
          pingPostgres: () => pingPostgres(db),
          pingRedis: () => pingRedis(healthRedis),
        }),
    });
  });
  promise.catch(() => {
    if (appPromise === promise) appPromise = undefined;
  });
  return promise;
}

export function getApiApp(): Promise<App> {
  appPromise ??= buildApp();
  return appPromise;
}

/**
 * Chuyển request vào Hono. Không dựng được phụ thuộc (env sai) thì trả 503 cùng dạng lỗi
 * của API, chi tiết chỉ ghi log.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  let app: App;
  try {
    app = await getApiApp();
  } catch (err) {
    console.error('[api] không khởi tạo được phụ thuộc:', err instanceof Error ? err.message : err);
    return Response.json(errorBody('SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời không sẵn sàng'), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return app.fetch(request);
}
