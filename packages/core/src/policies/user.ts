import type { userRole, userStatus } from '@novel-hub/db';

export type UserRole = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];

/** Phần thông tin user mà mọi quyết định quyền cần tới. */
export interface PolicyUser {
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
}

export function hasAnyRole(user: PolicyUser, roles: readonly UserRole[]): boolean {
  return roles.includes(user.role);
}

/** Đăng truyện, chương, bình luận đòi email đã xác thực (đăng nhập thì không). */
export function isEmailVerified(user: PolicyUser): boolean {
  return user.emailVerified;
}

/**
 * User bị ban không đăng nhập được và session cũ bị coi như khách.
 *
 * Bất biến: ban ⇒ xoá mọi session của user. `banUser()` (cùng công cụ mod, Giai đoạn 1)
 * phải làm cả hai trong một transaction; các kiểm tra `isBanned` ở middleware chỉ là lớp
 * chặn thêm, không thay cho việc xoá session.
 */
export function isBanned(user: Pick<PolicyUser, 'status'>): boolean {
  return user.status === 'banned';
}
