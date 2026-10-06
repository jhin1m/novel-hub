import type { PolicyUser } from './user';

/**
 * Posting public community content (comments, reviews): a verified email and an `active` account.
 * A muted account keeps reading and following but cannot post; a banned one has no session at all.
 */
export function canPostCommunityContent(user: PolicyUser): boolean {
  return user.emailVerified && user.status === 'active';
}
