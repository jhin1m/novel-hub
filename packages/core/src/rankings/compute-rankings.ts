import { type Db, stories, storyDailyStats, users } from '@novel-hub/db';
import { RANKING_RULES, type RankingPeriod, rankingWindow } from '@novel-hub/shared';
import { and, asc, between, desc, eq, sql } from 'drizzle-orm';
import { publicStoryWhere } from '../catalog/story-card';

/**
 * Ids of the best stories of a ranking, best first, at most `RANKING_RULES.keep`. The score is the
 * sum of the story's daily distinct readers over the window (`rankingWindow`); `rising` scores the
 * growth of the last 7 days over the 7 before, `(cur − prev) / max(prev, minRisingReaders)`, for
 * stories with at least `minRisingReaders` readers this week and a positive growth. Ties go to the
 * most recently updated story. Only stories public lists may show; 18+ ones only with
 * `includeMature`.
 */
export async function computeRankings(
  db: Db,
  period: RankingPeriod,
  today: string,
  o: { includeMature: boolean },
): Promise<string[]> {
  const window = rankingWindow(period, today);
  const visible = publicStoryWhere(o);
  const tieBreak = [sql`${stories.lastChapterAt} desc nulls last`, asc(stories.id)];

  if (window.prevFrom === undefined) {
    const score = sql<number>`sum(${storyDailyStats.uniqueReaders})`;
    const rows = await db
      .select({ id: stories.id })
      .from(storyDailyStats)
      .innerJoin(stories, eq(stories.id, storyDailyStats.storyId))
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(and(between(storyDailyStats.date, window.from, window.to), visible))
      .groupBy(stories.id)
      .having(sql`${score} > 0`)
      .orderBy(desc(score), ...tieBreak)
      .limit(RANKING_RULES.keep);
    return rows.map((r) => r.id);
  }

  const inWindow = (from: string, to: string) =>
    sql`coalesce(sum(${storyDailyStats.uniqueReaders}) filter (where ${storyDailyStats.date} between ${from} and ${to}), 0)`;
  const cur = inWindow(window.from, window.to);
  const prev = inWindow(window.prevFrom, window.prevTo ?? window.prevFrom);
  const growth = sql`(${cur} - ${prev})::float8 / greatest(${prev}, ${RANKING_RULES.minRisingReaders})`;
  const rows = await db
    .select({ id: stories.id })
    .from(storyDailyStats)
    .innerJoin(stories, eq(stories.id, storyDailyStats.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(between(storyDailyStats.date, window.prevFrom, window.to), visible))
    .groupBy(stories.id)
    .having(sql`${cur} >= ${RANKING_RULES.minRisingReaders} and ${cur} > ${prev}`)
    .orderBy(desc(growth), ...tieBreak)
    .limit(RANKING_RULES.keep);
  return rows.map((r) => r.id);
}
