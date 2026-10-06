import { type Db, contestEntries, contests, stories } from '@novel-hub/db';
import type { ContestAdminDto, ContestAdminEntryDto, ContestPlacement } from '@novel-hub/shared';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { selectStoryCardsWith } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import {
  contestSummaryColumns,
  listedEntryCounts,
  listedEntryWhere,
  toContestSummary,
} from './read-contests';

/** Contests a moderator manages, newest start first (at most 100). */
export async function listContestsForMods(
  db: Db,
  actor: CurrentUser,
  now: Date = new Date(),
): Promise<Result<ContestAdminDto[], 'FORBIDDEN'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  const rows = await db
    .select({ ...contestSummaryColumns, description: contests.description })
    .from(contests)
    .orderBy(desc(contests.startsAt), desc(contests.id))
    .limit(100);
  const counts = await listedEntryCounts(
    db,
    rows.map((r) => r.id),
  );
  return ok(
    rows.map((row) => ({
      ...toContestSummary(row, counts, now),
      id: row.id,
      description: row.description,
    })),
  );
}

/**
 * Every entry of a contest for ranking, placed ones first then oldest entry first. `listed` tells
 * whether the contest page shows it (a hidden story, a banned author or a story turned 18+ is not
 * listed and cannot be placed, but its place can still be cleared).
 */
export async function listContestEntriesForMods(
  db: Db,
  actor: CurrentUser,
  contestId: string,
): Promise<Result<ContestAdminEntryDto[], 'FORBIDDEN' | 'NOT_FOUND'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  const [contest] = await db
    .select({ id: contests.id })
    .from(contests)
    .where(eq(contests.id, contestId));
  if (!contest) return err('NOT_FOUND');
  const rows = await selectStoryCardsWith(db, {
    enteredAt: contestEntries.createdAt,
    placement: contestEntries.placement,
    listed: sql<boolean>`${listedEntryWhere()}`,
  })
    .innerJoin(contestEntries, eq(contestEntries.storyId, stories.id))
    .where(eq(contestEntries.contestId, contest.id))
    .orderBy(sql`${contestEntries.placement} asc nulls last`, asc(contestEntries.createdAt));
  return ok(
    rows.map((row) => ({
      story: {
        publicId: row.publicId,
        slug: row.slug,
        title: row.title,
        coverUrl: row.coverUrl,
        authorName: row.authorDisplayName,
        mainTagSlug: row.mainTagSlug,
      },
      enteredAt: row.enteredAt.toISOString(),
      placement: row.placement as ContestPlacement | null,
      listed: row.listed,
    })),
  );
}
