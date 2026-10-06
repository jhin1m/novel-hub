import { describe, expect, it } from 'vitest';
import { canPostCommunityContent } from './community';
import type { PolicyUser } from './user';

const user = (emailVerified: boolean, status: PolicyUser['status']): PolicyUser => ({
  role: 'reader',
  status,
  emailVerified,
});

describe('canPostCommunityContent', () => {
  it('needs a verified email and an active account', () => {
    expect(canPostCommunityContent(user(true, 'active'))).toBe(true);
    expect(canPostCommunityContent(user(false, 'active'))).toBe(false);
    expect(canPostCommunityContent(user(true, 'muted'))).toBe(false);
    expect(canPostCommunityContent(user(false, 'muted'))).toBe(false);
    expect(canPostCommunityContent(user(true, 'banned'))).toBe(false);
  });
});
