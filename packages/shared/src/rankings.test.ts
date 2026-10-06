import { describe, expect, it } from 'vitest';
import { RANKING_PERIODS, rankingWindow } from './rankings';

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
