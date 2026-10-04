import type { CurrentUser, HealthReport } from '@novel-hub/core';

/** Phần auth mà API cần; nơi mount dựng từ Better Auth (`createAuth`, `getCurrentUser`). */
export interface AuthPort {
  /** Xử lý mọi request `/api/auth/*`. */
  handler: (request: Request) => Promise<Response>;
  /**
   * User của cookie phiên (không có phiên hoặc bị ban → `null`) kèm các header
   * `Set-Cookie` cần gửi về (gia hạn phiên).
   */
  lookupSession: (headers: Headers) => Promise<{ user: CurrentUser | null; setCookies: string[] }>;
}

/** Phụ thuộc server-side mà app cần; nơi mount (apps/web) dựng và truyền vào. */
export interface ApiDeps {
  checkHealth: () => Promise<HealthReport>;
  auth: AuthPort;
  /** Origin của web, dùng cho kiểm tra CSRF của `/api/v1/*`. */
  appUrl: string;
}
