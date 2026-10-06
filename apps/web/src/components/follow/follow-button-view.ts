/**
 * What a follow button shows. `pending` is the neutral, disabled button the server renders for
 * everyone (the page is cached publicly) and the browser keeps until the account and its follow
 * state are known.
 */
export type FollowButtonView = 'hidden' | 'pending' | 'guest' | 'on' | 'off';

export function followButtonView(s: {
  /** `useMe()` has not answered (always so on the server) or failed. */
  meUnknown: boolean;
  signedIn: boolean;
  /** The reader is whoever cannot follow the target (its author). */
  isOwner: boolean;
  followingPending: boolean;
  following: boolean | undefined;
}): FollowButtonView {
  if (s.isOwner) return 'hidden';
  if (s.meUnknown || (s.signedIn && s.followingPending)) return 'pending';
  if (!s.signedIn) return 'guest';
  return s.following === true ? 'on' : 'off';
}
