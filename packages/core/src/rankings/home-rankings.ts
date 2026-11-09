import type { Db } from '@novel-hub/db';
import {
  HOME_RANKING_SCAN,
  HOME_RANKING_SIZE,
  RANKING_PERIODS,
  type RankingPeriod,
} from '@novel-hub/shared';
import type { StoryCardDto } from '../catalog/story-card';
import { type RankingReader, readRanking } from './ranking-reader';

export interface HomeRankings {
  /** `false` when any period could not be read: the section is then left out, not half shown. */
  available: boolean;
  /** Top stories of every period, best first; never 18+ (the home page is cached publicly). */
  periods: Record<RankingPeriod, StoryCardDto[]>;
}

const emptyPeriods = (): Record<RankingPeriod, StoryCardDto[]> => ({
  day: [],
  week: [],
  month: [],
  rising: [],
});

/** The short rankings of the home page, every period at once (the page switches in the browser). */
export async function readHomeRankings(
  db: Db,
  reader: RankingReader | null,
): Promise<HomeRankings> {
  const pages = await Promise.all(
    RANKING_PERIODS.map((period) =>
      readRanking(db, reader, period, {
        includeMature: false,
        limit: HOME_RANKING_SIZE,
        scan: HOME_RANKING_SCAN,
      }),
    ),
  );
  // Redis down fails every period alike; one failing alone is treated the same.
  if (!pages.every((p) => p.available)) return { available: false, periods: emptyPeriods() };
  const periods = emptyPeriods();
  RANKING_PERIODS.forEach((period, i) => {
    periods[period] = pages[i]?.stories ?? [];
  });
  return { available: true, periods };
}
