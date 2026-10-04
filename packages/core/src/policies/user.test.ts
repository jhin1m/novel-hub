import { describe, expect, it } from 'vitest';
import { type PolicyUser, hasAnyRole, isBanned, isEmailVerified } from './user';

const reader: PolicyUser = { role: 'reader', status: 'active', emailVerified: false };

describe('policies/user', () => {
  it('hasAnyRole', () => {
    expect(hasAnyRole(reader, ['mod', 'admin'])).toBe(false);
    expect(hasAnyRole({ ...reader, role: 'mod' }, ['mod', 'admin'])).toBe(true);
    expect(hasAnyRole(reader, [])).toBe(false);
  });

  it('isEmailVerified', () => {
    expect(isEmailVerified(reader)).toBe(false);
    expect(isEmailVerified({ ...reader, emailVerified: true })).toBe(true);
  });

  it('isBanned chỉ đúng với status banned', () => {
    expect(isBanned(reader)).toBe(false);
    expect(isBanned({ status: 'muted' })).toBe(false);
    expect(isBanned({ status: 'banned' })).toBe(true);
  });
});
