import { type Db, contests } from '@novel-hub/db';
import { type ContestSummaryDto, HOME_CONTESTS_LIMIT } from '@novel-hub/shared';
import { and, asc, gt, lte } from 'drizzle-orm';
import { contestSummaryColumns, listedEntryCounts, toContestSummary } from './read-contests';

/**
 * Contests running at `now`, ending soonest first, each with its number of listed entries: the
 * home page's contest cards.
 */
export async function listOpenContests(
  db: Db,
  now: Date = new Date(),
  limit: number = HOME_CONTESTS_LIMIT,
): Promise<ContestSummaryDto[]> {
  const rows = await db
    .select(contestSummaryColumns)
    .from(contests)
    .where(and(lte(contests.startsAt, now), gt(contests.endsAt, now)))
    .orderBy(asc(contests.endsAt), asc(contests.id))
    .limit(limit);
  const counts = await listedEntryCounts(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toContestSummary(row, counts, now));
}
