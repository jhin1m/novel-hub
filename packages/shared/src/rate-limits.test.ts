import { describe, expect, it } from 'vitest';
import {
  AUTH_PATH_ACTIONS,
  NEW_ACCOUNT_DAYS,
  RATE_LIMITS,
  type RateLimitAction,
  TRUSTED_ACCOUNT_DAYS,
} from './rate-limits';

const actions = Object.keys(RATE_LIMITS) as RateLimitAction[];

describe('RATE_LIMITS', () => {
  it.each(actions)('%s limits at least one dimension', (action) => {
    const rule = RATE_LIMITS[action];
    expect(rule.user ?? rule.ip ?? rule.emailIp ?? rule.emailGlobal).toBeDefined();
  });

  it.each(actions)('%s gives new accounts a tier no looser than the normal one', (action) => {
    const tiers = RATE_LIMITS[action].user;
    if (!tiers) return;
    expect(tiers.newAccount.max).toBeLessThanOrEqual(tiers.normal.max);
    expect(tiers.newAccount.windowSec).toBeGreaterThanOrEqual(tiers.normal.windowSec);
  });

  it('fails closed only for actions that create accounts or send mail', () => {
    const closed = actions.filter((a) => RATE_LIMITS[a].onStoreError === 'closed').sort();
    expect(closed).toEqual(['forgotPassword', 'sendVerification', 'signUp']);
  });

  it('counts only failed sign-ins per email, so others cannot lock an account', () => {
    expect(RATE_LIMITS.signIn.emailGlobal?.countOn).toBe('failure');
  });
});

describe('AUTH_PATH_ACTIONS', () => {
  it('maps every auth action to a Better Auth path', () => {
    const mapped = new Set(Object.values(AUTH_PATH_ACTIONS));
    for (const action of ['signUp', 'signIn', 'forgotPassword', 'sendVerification'] as const) {
      expect(mapped.has(action)).toBe(true);
    }
  });
});

describe('buckets of announcements, nominations and chapter imports', () => {
  it.each(['announce', 'nominate', 'importChapters'] as const)(
    '%s limits per user (both tiers) and per IP, failing open',
    (action) => {
      const rule = RATE_LIMITS[action];
      expect(rule.user?.normal).toBeDefined();
      expect(rule.user?.newAccount).toBeDefined();
      expect(rule.ip).toBeDefined();
      expect(rule.onStoreError).toBe('open');
    },
  );

  it('trusted features start after the new-account tier ends', () => {
    expect(TRUSTED_ACCOUNT_DAYS).toBeGreaterThan(NEW_ACCOUNT_DAYS);
  });
});
