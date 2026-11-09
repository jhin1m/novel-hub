import type { Db } from '@novel-hub/db';
import {
  type ContestSummaryDto,
  FEATURED_RULES,
  HOME_DEDUPE_SLACK,
  HOME_RECENT_LIMIT,
  NEW_STORY_SPOTLIGHT,
} from '@novel-hub/shared';
import { listOpenContests } from '../contests/open-contests';
import { listActiveFeatured } from '../featured/active-featured';
import { type HomeHero, listNotable, loadHomeHero, recentlyUpdatedWhere } from './home';
import { type HomeGenreTile, listHomeGenreTiles } from './home-genre-tiles';
import { withLatestChapters } from './latest-chapters';
import { listNewStoriesSpotlight } from './new-stories-spotlight';
import { listRecentlyCompleted } from './recently-completed';
import { type StoryCardDto, recentlyUpdatedOrder, selectStoryCards } from './story-card';

export interface HomePageData {
  /** The first notable story, never 18+; `null` when there is none. */
  hero: HomeHero | null;
  /** Most recently updated first, each with its latest chapter. */
  recent: StoryCardDto[];
  /**
   * Moderator picks running now, one more than the block shows: only the hero comes before them,
   * so the block stays full once the page drops it.
   */
  picks: StoryCardDto[];
  /** The "what to read today" tiles, never a cover of an 18+ story. */
  genreTiles: HomeGenreTile[];
  /**
   * "New stories that need readers": rotates every hour, never an 18+ story. With
   * `HOME_DEDUPE_SLACK` more, as `completed`: the page drops stories a section higher up already
   * shows and still has full sections.
   */
  spotlight: StoryCardDto[];
  /** "Recently completed". */
  completed: StoryCardDto[];
  /** Contests running now, ending soonest first. */
  contests: ContestSummaryDto[];
}

/** The server-rendered home page: never any 18+ story, so the HTML can be cached publicly. */
export async function getHomePage(db: Db, now: Date = new Date()): Promise<HomePageData> {
  const o = { includeMature: false };
  // Only the first page shows, so no total is counted.
  const [recentRows, [heroCard], picks, genreTiles, spotlight, completed, contests] =
    await Promise.all([
      selectStoryCards(db)
        .where(recentlyUpdatedWhere(o))
        .orderBy(...recentlyUpdatedOrder)
        .limit(HOME_RECENT_LIMIT),
      listNotable(db, { ...o, now, limit: 1 }),
      listActiveFeatured(db, now, FEATURED_RULES.homeLimit + 1),
      listHomeGenreTiles(db),
      listNewStoriesSpotlight(db, now, NEW_STORY_SPOTLIGHT.size + HOME_DEDUPE_SLACK),
      listRecentlyCompleted(db, o),
      listOpenContests(db, now),
    ]);
  const [recent, hero] = await Promise.all([
    withLatestChapters(db, recentRows),
    heroCard ? loadHomeHero(db, heroCard) : null,
  ]);
  return { hero, recent, picks, genreTiles, spotlight, completed, contests };
}
