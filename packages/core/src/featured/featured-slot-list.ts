import { type Db, featuredSlots, stories } from '@novel-hub/db';
import { FEATURED_RULES, type FeaturedSlotListDto } from '@novel-hub/shared';
import { desc, eq, gt } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { selectStoryCardsWith } from '../catalog/story-card';
import { canModerate } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { featuredSlotState } from './featured-slots';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every slot a moderator manages, grouped: running, upcoming, and ended in the last 30 days, each
 * newest start first. Stories show as they are now, even when hidden since (the home page drops
 * those).
 */
export async function listFeaturedSlotsForMods(
  db: Db,
  actor: CurrentUser,
  now: Date = new Date(),
): Promise<Result<FeaturedSlotListDto, 'FORBIDDEN'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  const endedSince = new Date(now.getTime() - FEATURED_RULES.endedListDays * DAY_MS);
  const rows = await selectStoryCardsWith(db, {
    slotId: featuredSlots.id,
    startsAt: featuredSlots.startsAt,
    endsAt: featuredSlots.endsAt,
  })
    .innerJoin(featuredSlots, eq(featuredSlots.storyId, stories.id))
    .where(gt(featuredSlots.endsAt, endedSince))
    .orderBy(desc(featuredSlots.startsAt), desc(featuredSlots.id));

  const list: FeaturedSlotListDto = { active: [], upcoming: [], ended: [] };
  for (const row of rows) {
    const state = featuredSlotState(row.startsAt, row.endsAt, now);
    list[state].push({
      id: row.slotId,
      story: {
        publicId: row.publicId,
        slug: row.slug,
        title: row.title,
        coverUrl: row.coverUrl,
        authorName: row.authorDisplayName,
        mainTagSlug: row.mainTagSlug,
      },
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      state,
    });
  }
  return ok(list);
}
