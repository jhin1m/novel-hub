/**
 * Hook của Better Auth: cổng Zod cho mọi field user đi qua Better Auth và lớp chặn user
 * bị ban. Lỗi ném dạng `APIError` để Better Auth trả `{ code, message }` với status đúng.
 */
import { generateUsername, isBanned, isUsernameTaken } from '@novel-hub/core';
import { type Db, users } from '@novel-hub/db';
import { DISPLAY_NAME_MAX_LENGTH, displayNameSchema, usernameSchema } from '@novel-hub/shared';
import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { eq } from 'drizzle-orm';

export type AuthErrorCode =
  | 'USERNAME_TAKEN'
  | 'USERNAME_INVALID'
  | 'USERNAME_IMMUTABLE'
  | 'IMAGE_NOT_ALLOWED'
  | 'DISPLAY_NAME_INVALID'
  | 'ACCOUNT_BANNED';

const MESSAGES: Record<AuthErrorCode, string> = {
  USERNAME_TAKEN: 'Username đã có người dùng',
  USERNAME_INVALID: 'Username không hợp lệ',
  USERNAME_IMMUTABLE: 'Không đổi được username',
  IMAGE_NOT_ALLOWED: 'Không đặt ảnh đại diện qua endpoint này',
  DISPLAY_NAME_INVALID: 'Tên hiển thị không hợp lệ',
  ACCOUNT_BANNED: 'Tài khoản đã bị khoá',
};

function authError(status: 'BAD_REQUEST' | 'FORBIDDEN', code: AuthErrorCode): APIError {
  return new APIError(status, { code, message: MESSAGES[code] });
}

type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type UserHooks = NonNullable<DatabaseHooks['user']>;
type UserCreateBefore = NonNullable<NonNullable<UserHooks['create']>['before']>;
type UserUpdateBefore = NonNullable<NonNullable<UserHooks['update']>['before']>;
type SessionCreateBefore = NonNullable<
  NonNullable<NonNullable<DatabaseHooks['session']>['create']>['before']
>;

const USERNAME_ATTEMPTS = 5;
const EMAIL_SIGN_UP_PATH = '/sign-up/email';

async function generateUniqueUsername(db: Db, email: string): Promise<string> {
  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
    const candidate = generateUsername(email);
    if (!(await isUsernameTaken(db, candidate))) return candidate;
  }
  throw authError('BAD_REQUEST', 'USERNAME_TAKEN');
}

/**
 * Tên từ hồ sơ OAuth không do user gõ vào form nên không từ chối: cắt cho vừa, rỗng thì
 * lấy username.
 */
function normalizeProviderName(name: unknown, fallback: string): string {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, DISPLAY_NAME_MAX_LENGTH) : '';
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Trước khi tạo user (đăng ký email hoặc lần đầu đăng nhập Google):
 * - `name`: form đăng ký phải hợp lệ; hồ sơ OAuth thì được chuẩn hoá.
 * - `username`: có gửi thì kiểm định dạng và trùng; không gửi thì tự sinh, luôn kèm hậu tố.
 * - `image`: luôn bỏ (kể cả ảnh Google); avatar chỉ đến từ route upload.
 *
 * Hai request cùng username đồng thời vẫn có thể lọt qua bước kiểm trùng; khi đó unique
 * constraint chặn và Better Auth trả lỗi chung `FAILED_TO_CREATE_USER`.
 */
export function createUserCreateBefore(db: Db): UserCreateBefore {
  return async (user, ctx) => {
    const raw: unknown = user.username;
    let username: string;
    if (raw === undefined || raw === null) {
      username = await generateUniqueUsername(db, user.email);
    } else {
      const parsed = usernameSchema.safeParse(raw);
      if (!parsed.success) throw authError('BAD_REQUEST', 'USERNAME_INVALID');
      if (await isUsernameTaken(db, parsed.data)) throw authError('BAD_REQUEST', 'USERNAME_TAKEN');
      username = parsed.data;
    }

    let name: string;
    if (ctx?.path === EMAIL_SIGN_UP_PATH) {
      const parsed = displayNameSchema.safeParse(user.name);
      if (!parsed.success) throw authError('BAD_REQUEST', 'DISPLAY_NAME_INVALID');
      name = parsed.data;
    } else {
      name = normalizeProviderName(user.name, username);
    }

    return { data: { ...user, name, username, image: null } };
  };
}

/**
 * Trước mọi lần cập nhật user. Better Auth luôn truyền key `name`/`image` (có thể là
 * `undefined`), nên kiểm theo giá trị. Cũng chạy cho cập nhật nội bộ (ví dụ
 * `emailVerified` khi xác thực), chỉ chặn đúng các field cấm.
 */
export const userUpdateBefore: UserUpdateBefore = (data) => {
  if (data.username !== undefined) throw authError('BAD_REQUEST', 'USERNAME_IMMUTABLE');
  if (data.image !== undefined) throw authError('BAD_REQUEST', 'IMAGE_NOT_ALLOWED');
  if (data.name === undefined) return Promise.resolve();
  const parsed = displayNameSchema.safeParse(data.name);
  if (!parsed.success) throw authError('BAD_REQUEST', 'DISPLAY_NAME_INVALID');
  return Promise.resolve({ data: { ...data, name: parsed.data } });
};

/** Không tạo session cho user bị ban (đăng nhập email, OAuth callback, xác thực email). */
export function createSessionCreateBefore(db: Db): SessionCreateBefore {
  return async (session) => {
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (row && isBanned(row)) throw authError('FORBIDDEN', 'ACCOUNT_BANNED');
  };
}

/**
 * `hooks.before`: session của user bị ban không gọi được endpoint `/api/auth/*` nào,
 * trừ đăng xuất. Chỉ tra session khi request có cookie.
 *
 * `disableRefresh`: hook này không gửi được cookie về browser; nếu nó gia hạn session
 * trong DB thì endpoint chính thấy session còn mới, cũng không gửi cookie, và cookie ở
 * browser hết hạn dù user vẫn đang dùng.
 */
export const bannedGuard = createAuthMiddleware(async (ctx) => {
  if (ctx.path === '/sign-out' || !ctx.headers?.has('cookie')) return;
  const session = await getSessionFromCtx(ctx, { disableRefresh: true });
  const status: unknown = session?.user.status;
  if (status === 'banned') throw authError('FORBIDDEN', 'ACCOUNT_BANNED');
});
