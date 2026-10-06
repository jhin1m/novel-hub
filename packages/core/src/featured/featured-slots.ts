import { type Db, type Tx, featuredSlots, stories, users } from '@novel-hub/db';
import type { FeaturedSlot, FeaturedSlotCreateInput, FeaturedSlotState } from '@novel-hub/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { publicStoryWhere } from '../catalog/story-card';
import { logModerationAction } from '../moderation/log-action';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';

/** The only slot so far: the home page's "featured stories" block. */
export const HOME_PICKS: FeaturedSlot = 'home_picks';

export type FeaturedSlotError = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE';

/** Where a slot running from `startsAt` to `endsAt` stands at `now`. */
export function featuredSlotState(startsAt: Date, endsAt: Date, now: Date): FeaturedSlotState {
  if (endsAt <= now) return 'ended';
  return startsAt <= now ? 'active' : 'upcoming';
}

/** The moderation log note: the period the slot covers, in ISO. */
function periodNote(startsAt: Date, endsAt: Date): string {
  return `${startsAt.toISOString()} – ${endsAt.toISOString()}`;
}

/**
 * Features a story on the home page from `startsAt` to `endsAt` and logs it, in one transaction.
 * The story must be public (author not banned) with at least one chapter; an 18+ story is refused
 * (the block is in publicly cached HTML) and so is a story the moderator wrote.
 */
export async function createFeaturedSlot(
  db: Db,
  actor: CurrentUser,
  input: FeaturedSlotCreateInput,
  now: Date = new Date(),
): Promise<
  Result<{ id: string; state: FeaturedSlotState }, FeaturedSlotError | 'FEATURED_MATURE'>
> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  return db.transaction(async (tx) => {
    const [story] = await tx
      .select({
        id: stories.id,
        authorId: stories.authorId,
        isMature: stories.isMature,
      })
      .from(stories)
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(
        and(
          eq(stories.publicId, input.story),
          publicStoryWhere({ includeMature: true }),
          isNotNull(stories.lastChapterAt),
        ),
      );
    if (!story) return err('NOT_FOUND');
    if (story.authorId === actor.id) return err('FORBIDDEN');
    if (story.isMature) return err('FEATURED_MATURE');

    const [slot] = await tx
      .insert(featuredSlots)
      .values({ storyId: story.id, slot: HOME_PICKS, startsAt, endsAt })
      .returning({ id: featuredSlots.id });
    if (!slot) throw new Error('featured slot insert failed');
    await logModerationAction(
      tx,
      actor,
      { type: 'story', id: story.id },
      'feature_story',
      periodNote(startsAt, endsAt),
    );
    return ok({ id: slot.id, state: featuredSlotState(startsAt, endsAt, now) });
  });
}

/** Locks a slot for a change; `null` when there is none with this id. */
async function lockSlot(tx: Tx, id: string) {
  const [slot] = await tx
    .select({
      id: featuredSlots.id,
      storyId: featuredSlots.storyId,
      startsAt: featuredSlots.startsAt,
      endsAt: featuredSlots.endsAt,
    })
    .from(featuredSlots)
    .where(eq(featuredSlots.id, id))
    .for('update');
  return slot ?? null;
}

/** Ends a running slot now (`ends_at = now`) and logs it; any other slot is `INVALID_STATE`. */
export async function endFeaturedSlot(
  db: Db,
  actor: CurrentUser,
  id: string,
  now: Date = new Date(),
): Promise<Result<{ ended: true }, FeaturedSlotError>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const slot = await lockSlot(tx, id);
    if (!slot) return err('NOT_FOUND');
    // Strictly after the start, so the shortened slot still satisfies `ends_at > starts_at`.
    if (!(slot.startsAt < now && now < slot.endsAt)) return err('INVALID_STATE');
    await tx.update(featuredSlots).set({ endsAt: now }).where(eq(featuredSlots.id, slot.id));
    await logModerationAction(
      tx,
      actor,
      { type: 'story', id: slot.storyId },
      'unfeature_story',
      periodNote(slot.startsAt, now),
    );
    return ok({ ended: true as const });
  });
}

/**
 * Deletes a slot that has not started yet and logs it. A started slot stays as a record of what
 * was shown (`INVALID_STATE`); end it instead.
 */
export async function deleteFeaturedSlot(
  db: Db,
  actor: CurrentUser,
  id: string,
  now: Date = new Date(),
): Promise<Result<{ deleted: true }, FeaturedSlotError>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  return db.transaction(async (tx) => {
    const slot = await lockSlot(tx, id);
    if (!slot) return err('NOT_FOUND');
    if (slot.startsAt <= now) return err('INVALID_STATE');
    await tx.delete(featuredSlots).where(eq(featuredSlots.id, slot.id));
    await logModerationAction(
      tx,
      actor,
      { type: 'story', id: slot.storyId },
      'unfeature_story',
      periodNote(slot.startsAt, slot.endsAt),
    );
    return ok({ deleted: true as const });
  });
}
