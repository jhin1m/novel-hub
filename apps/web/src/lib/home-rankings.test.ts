import { describe, expect, it } from 'vitest';
import { hasAnyRanking, pickDefaultPeriod } from './home-rankings';

const periods = (filled: string[]) => ({
  day: filled.includes('day') ? ['a'] : [],
  week: filled.includes('week') ? ['a'] : [],
  month: filled.includes('month') ? ['a'] : [],
  rising: filled.includes('rising') ? ['a'] : [],
});

describe('pickDefaultPeriod', () => {
  it('opens on the week when it ranks stories', () => {
    expect(pickDefaultPeriod(periods(['day', 'week', 'month', 'rising']))).toBe('week');
    expect(pickDefaultPeriod(periods(['week']))).toBe('week');
  });

  it('falls back to day, then month, then rising when the week is empty', () => {
    expect(pickDefaultPeriod(periods(['day', 'month', 'rising']))).toBe('day');
    expect(pickDefaultPeriod(periods(['month', 'rising']))).toBe('month');
    expect(pickDefaultPeriod(periods(['rising']))).toBe('rising');
  });

  it('is the week when every period is empty', () => {
    expect(pickDefaultPeriod(periods([]))).toBe('week');
  });
});

describe('hasAnyRanking', () => {
  it('is true as soon as one period ranks a story', () => {
    expect(hasAnyRanking(periods([]))).toBe(false);
    expect(hasAnyRanking(periods(['rising']))).toBe(true);
  });
});
