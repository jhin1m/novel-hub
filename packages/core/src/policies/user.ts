import type { userRole, userStatus } from '@novel-hub/db';

export type UserRole = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];

/** The part of a user every permission decision needs. */
export interface PolicyUser {
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
}

export function hasAnyRole(user: PolicyUser, roles: readonly UserRole[]): boolean {
  return roles.includes(user.role);
}

/** Publishing stories, chapters and comments needs a verified email (signing in does not). */
export function isEmailVerified(user: PolicyUser): boolean {
  return user.emailVerified;
}

/**
 * A banned user cannot sign in and an old session counts as a guest.
 *
 * Invariant: ban ⇒ every session of the user is deleted. `banUser()`
 * (`moderation/user-status.ts`) does both in one transaction; the `isBanned` checks in the
 * middleware are only an extra guard, not a substitute for deleting the sessions.
 */
export function isBanned(user: Pick<PolicyUser, 'status'>): boolean {
  return user.status === 'banned';
}
