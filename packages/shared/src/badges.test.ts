import { describe, expect, it } from 'vitest';
import { BADGES, BADGE_CODES, type BadgeRule, isBadgeCode } from './badges';

describe('BADGES', () => {
  it('has unique snake_case codes', () => {
    expect(new Set(BADGE_CODES).size).toBe(BADGES.length);
    for (const code of BADGE_CODES) expect(code).toMatch(/^[a-z0-9_]+$/);
  });

  it('lists thresholds of the same kind in increasing order', () => {
    const last = new Map<BadgeRule['kind'], number>();
    for (const { rule } of BADGES as readonly { rule: BadgeRule }[]) {
      if (!('min' in rule)) continue;
      expect(rule.min).toBeGreaterThan(last.get(rule.kind) ?? 0);
      last.set(rule.kind, rule.min);
    }
  });

  it('recognises catalog codes only', () => {
    expect(isBadgeCode('chapters_10')).toBe(true);
    expect(isBadgeCode('retired_badge')).toBe(false);
  });
});
