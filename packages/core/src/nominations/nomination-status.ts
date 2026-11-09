import { type Db, storyNominations } from '@novel-hub/db';
import { NOMINATION_RULES, nominationWeekStart } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canUseTrustedFeature } from '../policies/account-age';
import { findRateableStory } from '../ratings/rating-dto';
import type { CurrentUser } from '../users/current-user';

/** Why the reader may not nominate this story, or `ok`; the button says which. */
export type NominationEligibility = 'ok' | 'too_new' | 'muted' | 'unverified' | 'own_story';

export interface NominationStatusDto {
  /** Nominations left this week, whatever the story. */
  remaining: number;
  /** Whether the reader already nominated this story this week. */
  nominated: boolean;
  eligibility: NominationEligibility;
}

const TRUSTED_TO_ELIGIBILITY = {
  ok: 'ok',
  USER_MUTED: 'muted',
  ACCOUNT_TOO_NEW: 'too_new',
  // Banned accounts have no session, so only an unverified email is left.
  FORBIDDEN: 'unverified',
} as const satisfies Record<ReturnType<typeof canUseTrustedFeature>, NominationEligibility>;

/** What the "Nominate" button of a story shows for the signed-in reader. */
export async function getNominationStatus(
  db: Db,
  actor: CurrentUser,
  publicId: string,
  now: Date = new Date(),
): Promise<Result<NominationStatusDto, 'NOT_FOUND'>> {
  const story = await findRateableStory(db, publicId);
  if (!story) return err('NOT_FOUND');
  const rows = await db
    .select({ storyId: storyNominations.storyId })
    .from(storyNominations)
    .where(
      and(
        eq(storyNominations.userId, actor.id),
        eq(storyNominations.weekStart, nominationWeekStart(now)),
      ),
    );
  return ok({
    remaining: Math.max(0, NOMINATION_RULES.perWeek - rows.length),
    nominated: rows.some((row) => row.storyId === story.id),
    eligibility:
      story.authorId === actor.id
        ? 'own_story'
        : TRUSTED_TO_ELIGIBILITY[canUseTrustedFeature(actor, now)],
  });
}
