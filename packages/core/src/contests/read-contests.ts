import { type Db, contestEntries, contests, stories, users } from '@novel-hub/db';
import {
  CONTEST_RULES,
  type ContestListDto,
  type ContestPlacement,
  type ContestSummaryDto,
  contestStatus,
} from '@novel-hub/shared';
import { type SQL, and, asc, count, desc, eq, gt, inArray, isNotNull, lte } from 'drizzle-orm';
import {
  type Paged,
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCardsWith,
  toStoryCard,
  totalPagesFor,
} from '../catalog/story-card';

/**
 * Entries a contest page shows, over rows joining `stories` and the author in `users`: the public-list
 * rule without 18+ stories (the page is publicly cached HTML) and with at least one chapter. A story
 * hidden or an author banned after entering drops out here; those changes purge the contest pages.
 */
export function listedEntryWhere(): SQL {
  return and(publicStoryWhere({ includeMature: false }), isNotNull(stories.lastChapterAt)) as SQL;
}

/** Listed entries per contest, for the given contests (missing = 0). */
export async function listedEntryCounts(
  db: Db,
  contestIds: string[],
): Promise<Map<string, number>> {
  if (contestIds.length === 0) return new Map();
  const rows = await db
    .select({ contestId: contestEntries.contestId, n: count() })
    .from(contestEntries)
    .innerJoin(stories, eq(stories.id, contestEntries.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(inArray(contestEntries.contestId, contestIds), listedEntryWhere()))
    .groupBy(contestEntries.contestId);
  return new Map(rows.map((r) => [r.contestId, r.n]));
}

export const contestSummaryColumns = {
  id: contests.id,
  slug: contests.slug,
  title: contests.title,
  startsAt: contests.startsAt,
  endsAt: contests.endsAt,
};

type SummaryRow = { id: string; slug: string; title: string; startsAt: Date; endsAt: Date };

export function toContestSummary(
  row: SummaryRow,
  counts: Map<string, number>,
  now: Date,
): ContestSummaryDto {
  return {
    slug: row.slug,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: contestStatus(row, now),
    entryCount: counts.get(row.id) ?? 0,
  };
}

/**
 * `/contests`: running contests ending soonest first, upcoming ones starting soonest first, and
 * the 20 most recently ended. Each with its number of listed entries.
 */
export async function listContestsPage(db: Db, now: Date = new Date()): Promise<ContestListDto> {
  const select = () => db.select(contestSummaryColumns).from(contests);
  const [open, upcoming, ended] = await Promise.all([
    select()
      .where(and(lte(contests.startsAt, now), gt(contests.endsAt, now)))
      .orderBy(asc(contests.endsAt), asc(contests.id)),
    select().where(gt(contests.startsAt, now)).orderBy(asc(contests.startsAt), asc(contests.id)),
    select()
      .where(lte(contests.endsAt, now))
      .orderBy(desc(contests.endsAt), desc(contests.id))
      .limit(CONTEST_RULES.endedListed),
  ]);
  const counts = await listedEntryCounts(
    db,
    [...open, ...upcoming, ...ended].map((c) => c.id),
  );
  const summary = (row: SummaryRow) => toContestSummary(row, counts, now);
  return { open: open.map(summary), upcoming: upcoming.map(summary), ended: ended.map(summary) };
}

export interface ContestPageDto {
  contest: ContestSummaryDto & { description: string };
  /** Placed entries by place, once the contest has ended; empty before. */
  winners: Array<{ placement: ContestPlacement; story: StoryCardDto }>;
  /** Listed entries, most recently entered first. */
  entries: Paged<StoryCardDto>;
}

/** A contest page: the contest, its winners and a page of entries. `null` for an unknown slug. */
export async function getContestPage(
  db: Db,
  slug: string,
  page: number,
  now: Date = new Date(),
): Promise<ContestPageDto | null> {
  const [contest] = await db
    .select({ ...contestSummaryColumns, description: contests.description })
    .from(contests)
    .where(eq(contests.slug, slug))
    .limit(1);
  if (!contest) return null;
  const status = contestStatus(contest, now);
  const pageSize = CONTEST_RULES.entriesPageSize;
  const where = and(eq(contestEntries.contestId, contest.id), listedEntryWhere());
  const entryRows = () =>
    selectStoryCardsWith(db, {
      enteredAt: contestEntries.createdAt,
      placement: contestEntries.placement,
    }).innerJoin(contestEntries, eq(contestEntries.storyId, stories.id));

  const [rows, [total], placed] = await Promise.all([
    entryRows()
      .where(where)
      .orderBy(desc(contestEntries.createdAt), desc(stories.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: count() })
      .from(contestEntries)
      .innerJoin(stories, eq(stories.id, contestEntries.storyId))
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(where),
    status === 'ended'
      ? entryRows()
          .where(and(where, isNotNull(contestEntries.placement)))
          .orderBy(asc(contestEntries.placement))
      : Promise.resolve([]),
  ]);
  const n = total?.n ?? 0;
  return {
    contest: {
      slug: contest.slug,
      title: contest.title,
      description: contest.description,
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
      status,
      entryCount: n,
    },
    winners: placed.map((row) => ({
      placement: row.placement as ContestPlacement,
      story: toStoryCard(row),
    })),
    entries: { items: rows.map(toStoryCard), page, totalPages: totalPagesFor(n, pageSize) },
  };
}
