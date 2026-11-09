import type { Db } from '@novel-hub/db';
import {
  CATALOG_PAGE_SIZE,
  type ContestSummaryDto,
  FEATURED_RULES,
  HOME_DEDUPE_SLACK,
  NEW_STORY_SPOTLIGHT,
  NOTABLE_LIMIT,
} from '@novel-hub/shared';
import { listOpenContests } from '../contests/open-contests';
import { listActiveFeatured } from '../featured/active-featured';
import type { TagView } from '../stories/story-view';
import { type HomeHero, listGenres, listNotable, loadHomeHero, recentlyUpdatedWhere } from './home';
import { withLatestChapters } from './latest-chapters';
import { listNewStoriesSpotlight } from './new-stories-spotlight';
import { listRecentlyCompleted } from './recently-completed';
import { type StoryCardDto, recentlyUpdatedOrder, selectStoryCards } from './story-card';

export interface HomePageData {
  /** The first `notable` story with a chapter, never 18+; `null` when there is none. */
  hero: HomeHero | null;
  /** Most recently updated first, each with its latest chapter. */
  recent: StoryCardDto[];
  /**
   * The notable list plus `HOME_DEDUPE_SLACK` more, as is `spotlight`: the page drops stories a
   * section higher up already shows and still has full sections.
   */
  notable: StoryCardDto[];
  /**
   * Moderator picks running now, one more than the block shows: only the hero comes before them,
   * so the block stays full once the page drops it.
   */
  picks: StoryCardDto[];
  genres: TagView[];
  /** "New stories that need readers": rotates every hour, never an 18+ story. */
  spotlight: StoryCardDto[];
  /** "Recently completed", with `HOME_DEDUPE_SLACK` more as `notable`. */
  completed: StoryCardDto[];
  /** Contests running now, ending soonest first. */
  contests: ContestSummaryDto[];
}

/** The server-rendered home page: never any 18+ story, so the HTML can be cached publicly. */
export async function getHomePage(db: Db, now: Date = new Date()): Promise<HomePageData> {
  const o = { includeMature: false };
  // Only the first page shows, so no total is counted.
  const [recentRows, notable, picks, genres, spotlight, completed, contests] = await Promise.all([
    selectStoryCards(db)
      .where(recentlyUpdatedWhere(o))
      .orderBy(...recentlyUpdatedOrder)
      .limit(CATALOG_PAGE_SIZE),
    listNotable(db, { ...o, now, limit: NOTABLE_LIMIT + HOME_DEDUPE_SLACK }),
    listActiveFeatured(db, now, FEATURED_RULES.homeLimit + 1),
    listGenres(db),
    listNewStoriesSpotlight(db, now, NEW_STORY_SPOTLIGHT.size + HOME_DEDUPE_SLACK),
    listRecentlyCompleted(db, o),
    listOpenContests(db, now),
  ]);
  const heroCard = notable.find((story) => story.chapterCount > 0);
  const [recent, hero] = await Promise.all([
    withLatestChapters(db, recentRows),
    heroCard ? loadHomeHero(db, heroCard) : null,
  ]);
  return { hero, recent, notable, picks, genres, spotlight, completed, contests };
}
