import { createMailer, createWorkerConnection, mailerConfigFromEnv } from '@novel-hub/core';
import { loadServerEnv } from '@novel-hub/shared/env';
import { workerEnvSchema } from './env';
import { createMailWorker } from './mail-worker';
import { registerShutdown } from './shutdown';

/** Thời gian chờ job đang chạy xong khi tắt (ms). */
const SHUTDOWN_TIMEOUT_MS = 30_000;

function main(): void {
  // Env sai (gồm production thiếu SMTP) hoặc mailer không tạo được thì không khởi động.
  const env = loadServerEnv(workerEnvSchema);
  const mailer = createMailer(mailerConfigFromEnv(env));
  const connection = createWorkerConnection(env.REDIS_URL);
  const worker = createMailWorker(connection, env.QUEUE_PREFIX, { mailer });

  registerShutdown([() => worker.close(), () => Promise.resolve(connection.disconnect())], {
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    exit: (code) => process.exit(code),
  });
  process.on('unhandledRejection', (reason) => {
    console.error(
      '[worker] unhandledRejection:',
      reason instanceof Error ? reason.message : reason,
    );
  });
}

try {
  main();
} catch (err) {
  console.error('[worker] không khởi động được:', err instanceof Error ? err.message : err);
  process.exit(1);
}
