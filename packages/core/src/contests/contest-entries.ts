import { type Db, type StoryRow, type Tx, contestEntries, contests } from '@novel-hub/db';
import {
  type ContestIneligibleReason,
  type OpenContestForStoryDto,
  contestStatus,
} from '@novel-hub/shared';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { loadOwnedStory } from '../stories/load-owned-story';

export type ContestEntryError = 'NOT_FOUND' | 'CONTEST_NOT_OPEN';

/**
 * Why a story may not enter a contest starting at `startsAt`; `null` when it may. It must be
 * public with a chapter, not 18+ (contest pages are publicly cached HTML) and created after the start (the
 * contest is for stories written for it).
 */
export function contestIneligibility(
  story: Pick<StoryRow, 'visibility' | 'isMature' | 'createdAt' | 'lastChapterAt'>,
  startsAt: Date,
): ContestIneligibleReason | null {
  // The contest page lists only public stories with a chapter (`listedEntryWhere`).
  if (story.visibility !== 'published' || story.lastChapterAt === null) return 'not_published';
  if (story.isMature) return 'mature';
  if (story.createdAt < startsAt) return 'too_old';
  return null;
}

/**
 * The contest by slug; `null` when unknown. `lock` takes a share lock until the transaction ends,
 * so a moderator moving the start (`updateContest` locks the row for update and refuses once a
 * story entered) either sees the new entry or happens before the eligibility check reads the start.
 */
async function loadContest(db: Db | Tx, slug: string, lock = false) {
  const query = db
    .select({ id: contests.id, startsAt: contests.startsAt, endsAt: contests.endsAt })
    .from(contests)
    .where(eq(contests.slug, slug));
  const [contest] = lock ? await query.for('share') : await query;
  return contest ?? null;
}

/**
 * Enters one of the actor's stories in an open contest (again is a no-op). Someone else's story is
 * `NOT_FOUND`, never `FORBIDDEN`, so the answer does not tell whether it exists.
 */
export async function enterContest(
  db: Db,
  actor: StoryActor,
  slug: string,
  publicId: string,
  now: Date = new Date(),
): Promise<Result<{ entered: true }, ContestEntryError | 'CONTEST_STORY_INELIGIBLE'>> {
  return db.transaction(async (tx) => {
    const contest = await loadContest(tx, slug, true);
    if (!contest) return err('NOT_FOUND');
    if (contestStatus(contest, now) !== 'open') return err('CONTEST_NOT_OPEN');
    const owned = await loadOwnedStory(tx, actor, publicId);
    if (!owned.ok) return err('NOT_FOUND');
    if (contestIneligibility(owned.value, contest.startsAt)) {
      return err('CONTEST_STORY_INELIGIBLE');
    }
    await tx
      .insert(contestEntries)
      .values({ contestId: contest.id, storyId: owned.value.id })
      .onConflictDoNothing();
    return ok({ entered: true as const });
  });
}

/** Withdraws one of the actor's stories from a contest while it is open (not entered is a no-op). */
export async function withdrawEntry(
  db: Db,
  actor: StoryActor,
  slug: string,
  publicId: string,
  now: Date = new Date(),
): Promise<Result<{ withdrawn: true }, ContestEntryError>> {
  const contest = await loadContest(db, slug);
  if (!contest) return err('NOT_FOUND');
  if (contestStatus(contest, now) !== 'open') return err('CONTEST_NOT_OPEN');
  const owned = await loadOwnedStory(db, actor, publicId);
  if (!owned.ok) return err('NOT_FOUND');
  await db
    .delete(contestEntries)
    .where(
      and(eq(contestEntries.contestId, contest.id), eq(contestEntries.storyId, owned.value.id)),
    );
  return ok({ withdrawn: true as const });
}

/**
 * The open contests as one of the actor's stories sees them, ending soonest first: whether it has
 * entered and whether it may. Someone else's story is `NOT_FOUND`.
 */
export async function listOpenContestsForStory(
  db: Db,
  actor: StoryActor,
  publicId: string,
  now: Date = new Date(),
): Promise<Result<OpenContestForStoryDto[], 'NOT_FOUND'>> {
  const owned = await loadOwnedStory(db, actor, publicId);
  if (!owned.ok) return err('NOT_FOUND');
  const story = owned.value;
  const rows = await db
    .select({
      slug: contests.slug,
      title: contests.title,
      startsAt: contests.startsAt,
      endsAt: contests.endsAt,
      enteredAt: contestEntries.createdAt,
    })
    .from(contests)
    .leftJoin(
      contestEntries,
      and(eq(contestEntries.contestId, contests.id), eq(contestEntries.storyId, story.id)),
    )
    .where(and(lte(contests.startsAt, now), gt(contests.endsAt, now)))
    .orderBy(asc(contests.endsAt), asc(contests.id));
  return ok(
    rows.map((row) => {
      const reason = contestIneligibility(story, row.startsAt);
      return {
        slug: row.slug,
        title: row.title,
        endsAt: row.endsAt.toISOString(),
        entered: row.enteredAt !== null,
        eligible: reason === null,
        ...(reason ? { reason } : {}),
      };
    }),
  );
}
