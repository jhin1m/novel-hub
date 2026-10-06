/**
 * Builds the Hono app for `/api/*` on top of the shared server infra. Import only from server
 * routes (`routes/api/*`) or other server code, never from components.
 *
 * The Hono app is cached per module, so editing API code in dev still reloads it, while the
 * connections in `infra.ts` survive HMR. A failed start clears the cache so the next request
 * retries.
 */
import { type App, createApp, errorBody } from '@novel-hub/api';
import { createAuth, lookupSession } from '@novel-hub/auth';
import {
  type AuthMailPort,
  checkHealth,
  enqueueAuthEmail,
  pingPostgres,
  pingRedis,
} from '@novel-hub/core';
import { getInfra } from './infra';

/** Mail jobs that take longer than this to enqueue are dropped and only logged (ms). */
const ENQUEUE_TIMEOUT_MS = 1_000;

let appPromise: Promise<App> | undefined;

function buildApp(): Promise<App> {
  const promise = getInfra().then(
    ({
      env,
      db,
      healthRedis,
      mailQueue,
      storage,
      viewCounter,
      rankings,
      search,
      rateLimit,
      clientIp,
    }) => {
      // Mail goes through the queue and the worker sends it. `createAuth` calls this port
      // fire-and-forget with a timeout and logs failures, so a dead Redis never hangs a request.
      const sendAuthEmail: AuthMailPort = async (msg) => {
        await enqueueAuthEmail(mailQueue, msg);
        console.info(`[mail] queued ${msg.kind} mail; the worker will send it`);
      };
      const auth = createAuth({
        db,
        env,
        sendAuthEmail,
        mailTimeoutMs: ENQUEUE_TIMEOUT_MS,
        // The owner proved the mailbox: lift the lock others' wrong guesses put on it.
        onPasswordReset: (email) => rateLimit.clearFailures('signIn', email),
      });
      return createApp({
        appUrl: env.APP_URL,
        auth: { handler: auth.handler, lookupSession: (headers) => lookupSession(auth, headers) },
        checkHealth: () =>
          checkHealth({
            pingPostgres: () => pingPostgres(db),
            pingRedis: () => pingRedis(healthRedis),
          }),
        db,
        storage,
        viewCounter,
        rankings,
        search,
        rateLimit,
        clientIp,
      });
    },
  );
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
 * Hands the request to Hono. When dependencies cannot be built (bad env) it answers 503 in the
 * API error shape; details only go to the log.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  let app: App;
  try {
    app = await getApiApp();
  } catch (err) {
    console.error(
      '[api] could not initialise dependencies:',
      err instanceof Error ? err.message : err,
    );
    return Response.json(errorBody('SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời không sẵn sàng'), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return app.fetch(request);
}
