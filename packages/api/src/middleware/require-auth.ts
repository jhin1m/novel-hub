import { type CurrentUser, type UserRole, hasAnyRole, isEmailVerified } from '@novel-hub/core';
import { createMiddleware } from 'hono/factory';
import { errorBody } from '../lib/errors';
import type { SessionEnv } from './session';

/** Sau các middleware dưới đây, handler đọc `c.var.authUser` (chắc chắn có user). */
export interface AuthedEnv {
  Variables: SessionEnv['Variables'] & { authUser: CurrentUser };
}

interface Denial {
  code: 'FORBIDDEN' | 'EMAIL_NOT_VERIFIED';
  message: string;
}

/**
 * Chưa đăng nhập → 401 `UNAUTHENTICATED`; `check` trả lý do từ chối → 403. Quyết định
 * quyền nằm ở `core/policies`, middleware chỉ dịch kết quả thành HTTP.
 */
function guard(check?: (user: CurrentUser) => Denial | undefined) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json(errorBody('UNAUTHENTICATED', 'Cần đăng nhập'), 401);
    const denial = check?.(user);
    if (denial) return c.json(errorBody(denial.code, denial.message), 403);
    c.set('authUser', user);
    await next();
  });
}

export const requireAuth = guard();

export function requireRole(...roles: UserRole[]) {
  return guard((user) =>
    hasAnyRole(user, roles) ? undefined : { code: 'FORBIDDEN', message: 'Không có quyền' },
  );
}

/** Đăng truyện, chương, bình luận: email phải đã xác thực. */
export const requireVerifiedEmail = guard((user) =>
  isEmailVerified(user)
    ? undefined
    : { code: 'EMAIL_NOT_VERIFIED', message: 'Cần xác thực email trước' },
);
