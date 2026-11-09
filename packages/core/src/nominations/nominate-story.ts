import { type Db, storyNominations } from '@novel-hub/db';
import { NOMINATION_RULES, nominationWeekStart } from '@novel-hub/shared';
import { and, eq, sql } from 'drizzle-orm';
import { matureCommentAccess } from '../comments/mature-comment-access';
import { type Result, err, ok } from '../lib/result';
import { canUseTrustedFeature } from '../policies/account-age';
import { findRateableStory } from '../ratings/rating-dto';
import type { CurrentUser } from '../users/current-user';

export type NominateStoryError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'USER_MUTED'
  | 'ACCOUNT_TOO_NEW'
  | 'MATURE_CONTENT_DISABLED'
  | 'NOMINATION_WEEKLY_LIMIT'
  | 'ALREADY_NOMINATED';

/**
 * Spends one of the reader's free weekly nominations on a story: at most `NOMINATION_RULES.perWeek`
 * a week (Monday 00:00 Vietnam time) and one per story a week. Throwaway accounts are kept out by
 * the trusted-account rule, and an author cannot nominate their own story (it would skew the
 * board). The read and the insert run under a per-user advisory lock, so parallel requests cannot
 * both pass the quota check.
 */
export async function nominateStory(
  db: Db,
  actor: CurrentUser,
  publicId: string,
  now: Date = new Date(),
): Promise<Result<{ remaining: number }, NominateStoryError>> {
  const trusted = canUseTrustedFeature(actor, now);
  if (trusted !== 'ok') return err(trusted);
  const story = await findRateableStory(db, publicId);
  if (!story) return err('NOT_FOUND');
  if (story.authorId === actor.id) return err('FORBIDDEN');
  if (!(await matureCommentAccess(db, actor.id, story.isMature))) {
    return err('MATURE_CONTENT_DISABLED');
  }

  const weekStart = nominationWeekStart(now);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`nominate:${actor.id}`}, 0))`,
    );
    const thisWeek = await tx
      .select({ storyId: storyNominations.storyId })
      .from(storyNominations)
      .where(and(eq(storyNominations.userId, actor.id), eq(storyNominations.weekStart, weekStart)));
    // Checked before the quota, so a story nominated with the last vote is not "out of votes".
    if (thisWeek.some((row) => row.storyId === story.id)) return err('ALREADY_NOMINATED');
    if (thisWeek.length >= NOMINATION_RULES.perWeek) return err('NOMINATION_WEEKLY_LIMIT');
    await tx
      .insert(storyNominations)
      .values({ userId: actor.id, storyId: story.id, weekStart, createdAt: now });
    return ok({ remaining: NOMINATION_RULES.perWeek - thisWeek.length - 1 });
  });
}
