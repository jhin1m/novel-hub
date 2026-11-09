import { RANKING_PERIODS, type RankingPeriod } from '@novel-hub/shared';

/*
 * Pure helpers of the home page's ranking section. They only read the server-rendered data, so the
 * period picked is the same in the HTML and after hydration.
 */

type Periods = Readonly<Record<RankingPeriod, readonly unknown[]>>;

/** Order periods are tried in when picking the one shown first: the week, as on `/rankings`. */
const DEFAULT_ORDER: readonly RankingPeriod[] = ['week', 'day', 'month', 'rising'];

/** The period the section opens on: the week, else the first non-empty one; `week` if all are. */
export function pickDefaultPeriod(periods: Periods): RankingPeriod {
  return DEFAULT_ORDER.find((period) => periods[period].length > 0) ?? 'week';
}

/** Whether any period ranks a story (else the section is left out). */
export function hasAnyRanking(periods: Periods): boolean {
  return RANKING_PERIODS.some((period) => periods[period].length > 0);
}
