import { describe, expect, it } from 'vitest';
import { STATS_WINDOW_DAYS, authorStatsWindow } from './author-stats';

describe('authorStatsWindow', () => {
  it('covers the last 30 days, today included', () => {
    expect(STATS_WINDOW_DAYS).toBe(30);
    expect(authorStatsWindow('2026-10-06')).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });

  it('crosses month and year boundaries', () => {
    expect(authorStatsWindow('2026-01-15')).toEqual({ from: '2025-12-17', to: '2026-01-15' });
  });
});
