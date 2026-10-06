import { describe, expect, it } from 'vitest';
import { followButtonView } from './follow-button-view';

const base = {
  meUnknown: false,
  signedIn: true,
  isOwner: false,
  followingPending: false,
  following: false,
};

describe('followButtonView', () => {
  it('is the neutral button while the account is unknown, as on the server', () => {
    expect(followButtonView({ ...base, meUnknown: true, signedIn: false })).toBe('pending');
    expect(followButtonView({ ...base, followingPending: true, following: undefined })).toBe(
      'pending',
    );
  });

  it('sends guests to sign in and hides the button from the owner', () => {
    expect(followButtonView({ ...base, signedIn: false })).toBe('guest');
    expect(followButtonView({ ...base, isOwner: true })).toBe('hidden');
  });

  it('toggles on the follow state', () => {
    expect(followButtonView(base)).toBe('off');
    expect(followButtonView({ ...base, following: true })).toBe('on');
  });
});
