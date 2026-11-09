import { describe, expect, it } from 'vitest';
import { canUseTrustedFeature, isAccountOlderThan } from './account-age';
import type { PolicyUser } from './user';

const now = new Date('2026-10-07T12:00:00Z');
const HOUR_MS = 3_600_000;
const ageHours = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);

const user = (
  createdAt: Date,
  status: PolicyUser['status'] = 'active',
  emailVerified = true,
): PolicyUser & { createdAt: Date } => ({ role: 'reader', status, emailVerified, createdAt });

describe('isAccountOlderThan', () => {
  it('counts full days', () => {
    expect(isAccountOlderThan({ createdAt: ageHours(7 * 24) }, 7, now)).toBe(true);
    expect(isAccountOlderThan({ createdAt: ageHours(7 * 24 - 1) }, 7, now)).toBe(false);
  });
});

describe('canUseTrustedFeature', () => {
  it('needs an account at least 7 days old', () => {
    expect(canUseTrustedFeature(user(ageHours(6 * 24 + 23)), now)).toBe('ACCOUNT_TOO_NEW');
    expect(canUseTrustedFeature(user(ageHours(7 * 24)), now)).toBe('ok');
  });

  it('refuses muted, unverified and banned accounts whatever their age', () => {
    const old = ageHours(30 * 24);
    expect(canUseTrustedFeature(user(old, 'muted'), now)).toBe('USER_MUTED');
    expect(canUseTrustedFeature(user(old, 'active', false), now)).toBe('FORBIDDEN');
    expect(canUseTrustedFeature(user(old, 'banned'), now)).toBe('FORBIDDEN');
  });
});
