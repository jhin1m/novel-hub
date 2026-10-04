import { type CurrentUser, isBanned } from '@novel-hub/core';
import { APIError } from 'better-auth/api';
import type { Auth } from './auth';

export interface SessionLookup {
  /** `null`: không có phiên, phiên hết hạn hoặc user bị ban. */
  user: CurrentUser | null;
  /**
   * Header `Set-Cookie` Better Auth muốn gửi về (gia hạn hoặc xoá cookie phiên). Nơi gọi
   * phải chuyển vào response, nếu không cookie ở browser hết hạn dù session trong DB đã
   * được gia hạn.
   */
  setCookies: string[];
}

/** Đọc user từ cookie phiên (`bannedGuard` làm user bị ban ném 403 `ACCOUNT_BANNED`). */
export async function lookupSession(
  auth: Pick<Auth, 'api'>,
  headers: Headers,
): Promise<SessionLookup> {
  let result: Awaited<ReturnType<typeof getSessionWithHeaders>>;
  try {
    result = await getSessionWithHeaders(auth, headers);
  } catch (err) {
    if (err instanceof APIError && err.body?.code === 'ACCOUNT_BANNED') {
      return { user: null, setCookies: [] };
    }
    throw err;
  }
  const setCookies = result.headers.getSetCookie();
  const session = result.response;
  if (!session || isBanned(session.user)) return { user: null, setCookies };
  const { user } = session;
  // Cột `username` NOT NULL; Better Auth khai báo `required: false` chỉ để hook tự sinh.
  if (!user.username) throw new Error('User trong session thiếu username');
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarUrl: user.image ?? null,
      role: user.role,
      status: user.status,
    },
    setCookies,
  };
}

function getSessionWithHeaders(auth: Pick<Auth, 'api'>, headers: Headers) {
  return auth.api.getSession({ headers, returnHeaders: true });
}
