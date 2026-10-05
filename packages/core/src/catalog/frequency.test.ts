import { describe, expect, it } from 'vitest';
import { chaptersPerWeek } from './frequency';

const NOW = new Date('2026-10-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('chaptersPerWeek', () => {
  it('says nothing for 0 or 1 chapter in the last 30 days', () => {
    expect(chaptersPerWeek([], NOW)).toBeNull();
    expect(chaptersPerWeek([daysAgo(3)], NOW)).toBeNull();
  });

  it('turns 8 chapters in 30 days into 1.9 per week', () => {
    const dates = Array.from({ length: 8 }, (_, i) => daysAgo(i * 3));
    expect(chaptersPerWeek(dates, NOW)).toBe(1.9);
  });

  it('ignores chapters older than 30 days', () => {
    expect(chaptersPerWeek([daysAgo(1), daysAgo(31), daysAgo(40)], NOW)).toBeNull();
    expect(chaptersPerWeek([daysAgo(1), daysAgo(29)], NOW)).toBe(0.5);
  });
});
