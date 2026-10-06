/**
 * Rankings: stories ordered by their distinct readers per day (`story_daily_stats`), over a few
 * fixed windows of stats days (`statsDate`, Vietnamese calendar days).
 */

/** `day` = today and yesterday (never empty just after midnight), `rising` = growth week on week. */
export const RANKING_PERIODS = ['day', 'week', 'month', 'rising'] as const;

export type RankingPeriod = (typeof RANKING_PERIODS)[number];

/** `general` leaves 18+ stories out (every cached page); `all` is for readers who allowed them. */
export const RANKING_VARIANTS = ['general', 'all'] as const;

export type RankingVariant = (typeof RANKING_VARIANTS)[number];

export const RANKING_RULES = {
  /** How often the worker recomputes every ranking (minutes). */
  refreshMinutes: 15,
  /** Stories kept per ranking in Redis. */
  keep: 100,
  /** Stories shown on a ranking page. */
  pageSize: 50,
  /** Readers a story needs in the current week to be "rising" (and the floor of the divisor). */
  minRisingReaders: 20,
} as const;

/** Inclusive `YYYY-MM-DD` ranges; `prev*` only for `rising` (the week before `from`). */
export interface RankingWindow {
  from: string;
  to: string;
  prevFrom?: string;
  prevTo?: string;
}

const DAY_MS = 86_400_000;

/** `date` (`YYYY-MM-DD`) moved by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The stats days a ranking covers, ending on `today` (`statsDate(now)`). */
export function rankingWindow(period: RankingPeriod, today: string): RankingWindow {
  switch (period) {
    case 'day':
      return { from: addDays(today, -1), to: today };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: addDays(today, -29), to: today };
    case 'rising':
      return {
        from: addDays(today, -6),
        to: today,
        prevFrom: addDays(today, -13),
        prevTo: addDays(today, -7),
      };
  }
}
