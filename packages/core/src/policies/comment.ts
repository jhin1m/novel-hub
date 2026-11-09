import type { PolicyUser } from './user';

/**
 * Pinning and unpinning top-level comments of a chapter or of the story's discussion: only the
 * story's author, while their account is `active` (a muted author keeps reading but does not shape
 * what readers see first).
 */
export function canPinComment(
  user: Pick<PolicyUser, 'status'> & { id: string },
  story: { authorId: string },
): boolean {
  return user.status === 'active' && user.id === story.authorId;
}
