import { type Db, stories } from '@novel-hub/db';
import { HOME_COMPLETED_LIMIT, HOME_DEDUPE_SLACK } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { homeListingWhere } from './home';
import {
  type ListOptions,
  type StoryCardDto,
  publicStoryWhere,
  recentlyUpdatedOrder,
  selectStoryCards,
  toStoryCard,
} from './story-card';

/**
 * "Recently completed": public stories marked completed and past the home listing threshold, most
 * recently updated first. By default the section plus `HOME_DEDUPE_SLACK` more, so it stays full
 * once the home page drops stories a section above already shows.
 */
export async function listRecentlyCompleted(
  db: Db,
  o: ListOptions & { limit?: number },
): Promise<StoryCardDto[]> {
  const rows = await selectStoryCards(db)
    .where(and(publicStoryWhere(o), eq(stories.status, 'completed'), homeListingWhere()))
    .orderBy(...recentlyUpdatedOrder)
    .limit(o.limit ?? HOME_COMPLETED_LIMIT + HOME_DEDUPE_SLACK);
  return rows.map(toStoryCard);
}
