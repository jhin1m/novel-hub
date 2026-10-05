import type { PolicyUser } from '../policies/user';

/**
 * User của request hiện tại, đã qua kiểm tra session (không bị ban). `id` chỉ dùng nội
 * bộ, không bao giờ trả ra API hay UI.
 */
export interface CurrentUser extends PolicyUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  /** Picks the stricter rate limit tier for new accounts. */
  createdAt: Date;
}
