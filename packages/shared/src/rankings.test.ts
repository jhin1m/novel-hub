import { describe, expect, it } from 'vitest';
import { RANKING_PERIODS, previousVnMonth, rankingWindow, vnWeekStart } from './rankings';

describe('rankingWindow', () => {
  it('covers today and yesterday for the day ranking', () => {
    expect(rankingWindow('day', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-06' });
  });

  it('covers 7 and 30 days ending today', () => {
    expect(rankingWindow('week', '2026-10-06')).toEqual({ from: '2026-09-30', to: '2026-10-06' });
    expect(rankingWindow('month', '2026-10-06')).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });

  it('compares the last 7 days with the 7 before them for rising', () => {
    expect(rankingWindow('rising', '2026-10-06')).toEqual({
      from: '2026-09-30',
      to: '2026-10-06',
      prevFrom: '2026-09-23',
      prevTo: '2026-09-29',
    });
  });

  it('crosses month and year boundaries, leap days included', () => {
    expect(rankingWindow('day', '2027-01-01')).toEqual({ from: '2026-12-31', to: '2027-01-01' });
    expect(rankingWindow('week', '2028-03-02').from).toBe('2028-02-25');
    expect(rankingWindow('month', '2028-03-01').from).toBe('2028-02-01');
    expect(rankingWindow('month', '2027-03-01').from).toBe('2027-01-31');
  });

  it('knows exactly four periods', () => {
    expect(RANKING_PERIODS).toEqual(['day', 'week', 'month', 'rising']);
  });
});

describe('vnWeekStart', () => {
  it('returns the Monday of the week, Monday itself included', () => {
    expect(vnWeekStart('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(vnWeekStart('2026-10-07')).toBe('2026-10-05'); // Wednesday
    expect(vnWeekStart('2026-10-11')).toBe('2026-10-05'); // Sunday → the Monday before
  });

  it('crosses a year boundary', () => {
    expect(vnWeekStart('2027-01-01')).toBe('2026-12-28'); // Friday
  });
});

describe('previousVnMonth', () => {
  it('returns the calendar month before, across a year boundary', () => {
    expect(previousVnMonth('2027-01-01')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
      label: '12/2026',
    });
  });

  it('ends February on the 29th in a leap year', () => {
    expect(previousVnMonth('2028-03-01')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
      label: '2/2028',
    });
    expect(previousVnMonth('2026-10-31')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      label: '9/2026',
    });
  });
});
