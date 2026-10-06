import { type Db, contestEntries, contests, stories, users } from '@novel-hub/db';
import { type ContestInput, type ContestPlacementInput, contestStatus } from '@novel-hub/shared';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { logModerationAction } from '../moderation/log-action';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { uniqueContestSlug } from './contest-slug';
import { listedEntryWhere } from './read-contests';

export type ContestManageError = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATE';

/** Creates a contest (a unique slug from the title) and logs it, in one transaction. */
export async function createContest(
  db: Db,
  actor: CurrentUser,
  input: ContestInput,
): Promise<Result<{ id: string; slug: string }, 'FORBIDDEN'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const slug = await uniqueContestSlug(tx, input.title);
    const [row] = await tx
      .insert(contests)
      .values({
        slug,
        title: input.title,
        description: input.description,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        createdBy: actor.id,
      })
      .returning({ id: contests.id });
    if (!row) throw new Error('contest insert failed');
    await logModerationAction(tx, actor, { type: 'contest', id: row.id }, 'create_contest', slug);
    return ok({ id: row.id, slug });
  });
}

/**
 * Replaces a contest's title, description and times, and logs it. The slug never changes (stable
 * URL). Once a story has entered, the start is fixed (`INVALID_STATE`): eligibility depends on it.
 * A contest with places cannot be moved to end in the future either (`INVALID_STATE`).
 */
export async function updateContest(
  db: Db,
  actor: CurrentUser,
  id: string,
  input: ContestInput,
  now: Date = new Date(),
): Promise<Result<{ slug: string }, ContestManageError>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const [contest] = await tx
      .select({ id: contests.id, slug: contests.slug, startsAt: contests.startsAt })
      .from(contests)
      .where(eq(contests.id, id))
      .for('update');
    if (!contest) return err('NOT_FOUND');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() !== contest.startsAt.getTime()) {
      const [entry] = await tx
        .select({ one: contestEntries.storyId })
        .from(contestEntries)
        .where(eq(contestEntries.contestId, contest.id))
        .limit(1);
      if (entry) return err('INVALID_STATE');
    }
    // Reopening a contest that has places would hide its results and let a placed entry be
    // withdrawn without a log entry: clear the places first.
    if (endsAt > now) {
      const [placed] = await tx
        .select({ one: contestEntries.storyId })
        .from(contestEntries)
        .where(and(eq(contestEntries.contestId, contest.id), isNotNull(contestEntries.placement)))
        .limit(1);
      if (placed) return err('INVALID_STATE');
    }
    await tx
      .update(contests)
      .set({
        title: input.title,
        description: input.description,
        startsAt,
        endsAt,
      })
      .where(eq(contests.id, contest.id));
    await logModerationAction(
      tx,
      actor,
      { type: 'contest', id: contest.id },
      'update_contest',
      contest.slug,
    );
    return ok({ slug: contest.slug });
  });
}

/**
 * Awards place 1–3 to an entry of an ended contest, or clears its place (`null`), and logs it.
 * Only a listed entry (`listedEntryWhere`) can be placed; any entry can be cleared. A moderator never
 * ranks their own story (`FORBIDDEN`); a place held by another entry is `CONTEST_PLACEMENT_TAKEN`.
 * The contest row is locked, so two moderators cannot award the same place at once.
 */
export async function setPlacement(
  db: Db,
  actor: CurrentUser,
  contestId: string,
  input: ContestPlacementInput,
  now: Date = new Date(),
): Promise<
  Result<
    { placement: ContestPlacementInput['placement'] },
    ContestManageError | 'CONTEST_PLACEMENT_TAKEN'
  >
> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const [contest] = await tx
      .select({ id: contests.id, startsAt: contests.startsAt, endsAt: contests.endsAt })
      .from(contests)
      .where(eq(contests.id, contestId))
      .for('update');
    if (!contest) return err('NOT_FOUND');
    if (contestStatus(contest, now) !== 'ended') return err('INVALID_STATE');

    const [entry] = await tx
      .select({
        storyId: stories.id,
        authorId: stories.authorId,
        listed: sql<boolean>`${listedEntryWhere()}`,
      })
      .from(contestEntries)
      .innerJoin(stories, eq(stories.id, contestEntries.storyId))
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(and(eq(contestEntries.contestId, contest.id), eq(stories.publicId, input.story)));
    if (!entry) return err('NOT_FOUND');
    if (entry.authorId === actor.id) return err('FORBIDDEN');

    if (input.placement !== null) {
      if (!entry.listed) return err('INVALID_STATE');
      const [holder] = await tx
        .select({ storyId: contestEntries.storyId })
        .from(contestEntries)
        .where(
          and(
            eq(contestEntries.contestId, contest.id),
            eq(contestEntries.placement, input.placement),
            ne(contestEntries.storyId, entry.storyId),
          ),
        );
      if (holder) return err('CONTEST_PLACEMENT_TAKEN');
    }
    await tx
      .update(contestEntries)
      .set({ placement: input.placement })
      .where(
        and(eq(contestEntries.contestId, contest.id), eq(contestEntries.storyId, entry.storyId)),
      );
    await logModerationAction(
      tx,
      actor,
      { type: 'contest', id: contest.id },
      'set_contest_placement',
      `${input.story}: ${input.placement ?? '-'}`,
    );
    return ok({ placement: input.placement });
  });
}
