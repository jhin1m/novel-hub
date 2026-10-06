import { type Db, featuredSlots, stories } from '@novel-hub/db';
import { FEATURED_RULES } from '@novel-hub/shared';
import { and, desc, eq, gt, isNotNull, lte, max } from 'drizzle-orm';
import {
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCards,
  toStoryCard,
} from '../catalog/story-card';
import { HOME_PICKS } from './featured-slots';

/**
 * Stories in the home "featured stories" block at `now`: a running `home_picks` slot, public, not
 * 18+ (the block is in publicly cached HTML) and with at least one chapter. A story featured twice
 * shows once, by its latest start; newest start first. A story hidden or banned after it was picked
 * drops out here, and those changes already purge the home page.
 */
export async function listActiveFeatured(
  db: Db,
  now: Date = new Date(),
  limit: number = FEATURED_RULES.homeLimit,
): Promise<StoryCardDto[]> {
  const active = db
    .select({
      storyId: featuredSlots.storyId,
      startedAt: max(featuredSlots.startsAt).as('started_at'),
    })
    .from(featuredSlots)
    .where(
      and(
        eq(featuredSlots.slot, HOME_PICKS),
        lte(featuredSlots.startsAt, now),
        gt(featuredSlots.endsAt, now),
      ),
    )
    .groupBy(featuredSlots.storyId)
    .as('active_featured');
  const rows = await selectStoryCards(db)
    .innerJoin(active, eq(active.storyId, stories.id))
    .where(and(publicStoryWhere({ includeMature: false }), isNotNull(stories.lastChapterAt)))
    .orderBy(desc(active.startedAt), desc(stories.id))
    .limit(limit);
  return rows.map(toStoryCard);
}
