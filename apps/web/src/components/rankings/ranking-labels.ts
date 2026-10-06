import type { RankingPeriod } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

/** Tab label of each period ("Tuần"). */
export const RANKING_PERIOD_LABELS: Record<RankingPeriod, () => string> = {
  day: m.ranking_period_day,
  week: m.ranking_period_week,
  month: m.ranking_period_month,
  rising: m.ranking_period_rising,
};

/** What each period covers, as it reads inside a sentence ("7 ngày qua"). */
export const RANKING_PERIOD_PHRASES: Record<RankingPeriod, () => string> = {
  day: m.ranking_period_day_phrase,
  week: m.ranking_period_week_phrase,
  month: m.ranking_period_month_phrase,
  rising: m.ranking_period_rising_phrase,
};
