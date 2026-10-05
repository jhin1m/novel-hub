import {
  type AuthMailMessage,
  type AuthMailPort,
  markEmailVerified,
  revokeUnprovenAccess,
  withTimeout,
} from '@novel-hub/core';
import { type Db, accounts, describeDbError, sessions, users, verifications } from '@novel-hub/db';
import { CLIENT_IP_HEADER } from '@novel-hub/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  bannedGuard,
  createSessionCreateBefore,
  createUserCreateBefore,
  createUserUpdateAfter,
  userUpdateBefore,
} from './hooks';

export interface AuthEnv {
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
}

export interface CreateAuthOptions {
  db: Db;
  env: AuthEnv;
  /** Cổng gửi mail auth; được gọi kiểu fire-and-forget, không chặn request. */
  sendAuthEmail: AuthMailPort;
  /** Quá thời gian này thì ghi log lỗi gửi mail (ms). Mặc định 15000. */
  mailTimeoutMs?: number;
  /**
   * Runs after a password was reset through the emailed link (the owner proved the mailbox); the
   * web clears the email's failed sign-in count here. Errors are only logged.
   */
  onPasswordReset?: (email: string) => Promise<void>;
}

const DEFAULT_MAIL_TIMEOUT_MS = 15_000;

/** Lỗi DB trong log của Better Auth kèm câu SQL và params (có thể là hash mật khẩu). */
function sanitizeLogArg(arg: unknown): unknown {
  return arg instanceof Error ? describeDbError(arg) : arg;
}

/**
 * Better Auth trên các bảng của `@novel-hub/db`, mount ở `/api/auth/*`.
 * Lỗi của `/api/auth/*` theo dạng của Better Auth (`{ code, message }`), nằm ngoài
 * contract `/api/v1`; web gọi qua `better-auth/react`.
 */
export function createAuth({
  db,
  env,
  sendAuthEmail,
  mailTimeoutMs,
  onPasswordReset,
}: CreateAuthOptions) {
  const timeoutMs = mailTimeoutMs ?? DEFAULT_MAIL_TIMEOUT_MS;

  // Better Auth chờ callback gửi mail xong mới trả response, nên không await ở đây:
  // mail chậm hay lỗi chỉ ghi log, đăng ký và quên mật khẩu vẫn trả về ngay.
  const sendInBackground = (msg: AuthMailMessage): Promise<void> => {
    void withTimeout(
      Promise.resolve().then(() => sendAuthEmail(msg)),
      timeoutMs,
      'gửi mail auth',
    ).catch((err: unknown) => {
      console.error(`[auth] gửi mail ${msg.kind} lỗi:`, describeDbError(err));
    });
    return Promise.resolve();
  };

  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined;

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      log: (level, message, ...args: unknown[]) => {
        const write =
          level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
        write(`[auth] ${message}`, ...args.map(sanitizeLogArg));
      },
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
    }),
    advanced: {
      // id do Postgres sinh bằng `uuidv7()`.
      database: { generateId: false },
      // Better Auth tự tắt kiểm tra Origin khi NODE_ENV=test; bật tường minh để test
      // chạy giống production.
      disableOriginCheck: false,
      // Set by the API from the address the rate limits use; the client's `X-Forwarded-For` is
      // never read.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    // The Redis rate limits run in the API in front of this handler (one limiter for the whole
    // app); Better Auth's own in-memory limiter stays off.
    rateLimit: { enabled: false },
    session: {
      // Tắt cache cookie để ban có hiệu lực ngay ở request kế tiếp.
      cookieCache: { enabled: false },
    },
    user: {
      // Chỉ đổi tên cột: body HTTP và object session vẫn dùng `name`/`image`.
      fields: { name: 'displayName', image: 'avatarUrl' },
      additionalFields: {
        username: { type: 'string', required: false, input: true },
        // `input: false`: client không tự đặt được (chống leo thang quyền).
        role: {
          type: ['reader', 'author', 'mod', 'admin'],
          required: true,
          input: false,
          defaultValue: 'reader',
        },
        status: {
          type: ['active', 'muted', 'banned'],
          required: true,
          input: false,
          defaultValue: 'active',
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Cho đăng nhập khi chưa xác thực; thao tác ghi chặn bằng `requireVerifiedEmail`.
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: ({ user, url }) =>
        sendInBackground({ kind: 'reset', to: user.email, displayName: user.name, url }),
      revokeSessionsOnPasswordReset: true,
      // Đặt lại mật khẩu qua link trong mail chứng minh sở hữu email: chủ thật lấy lại
      // được tài khoản người khác đăng ký trước bằng email của mình.
      onPasswordReset: async ({ user }) => {
        await markEmailVerified(db, user.id);
        await onPasswordReset?.(user.email).catch((err: unknown) => {
          console.error('[auth] onPasswordReset failed:', describeDbError(err));
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Chỉ chạy ở lần xác thực đầu và trước khi tự đăng nhập: người bấm link nhận session
      // mới, session và mật khẩu đặt trước khi chứng minh sở hữu email bị xoá.
      beforeEmailVerification: (user) => revokeUnprovenAccess(db, user.id),
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        sendInBackground({ kind: 'verify', to: user.email, displayName: user.name, url }),
    },
    // Mặc định `accountLinking.requireLocalEmailVerified: true`: Google không tự liên kết
    // vào tài khoản email chưa xác thực.
    socialProviders: google ? { google } : {},
    databaseHooks: {
      user: {
        create: { before: createUserCreateBefore(db) },
        update: { before: userUpdateBefore, after: createUserUpdateAfter(db) },
      },
      session: { create: { before: createSessionCreateBefore(db) } },
    },
    hooks: { before: bannedGuard },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
export type SessionUser = AuthSession['user'];
