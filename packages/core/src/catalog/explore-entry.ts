import type { Db } from '@novel-hub/db';
import { EXPLORE_ENTRY_SIZE } from '@novel-hub/shared';
import { type RankingPage, type RankingReader, readRanking } from '../rankings/ranking-reader';
import { listNewStoriesSpotlight } from './new-stories-spotlight';
import { listRecentlyCompleted } from './recently-completed';
import type { StoryCardDto } from './story-card';

/** Ids read from the weekly ranking: a margin for stories hidden since the last recompute. */
const ENTRY_RANKING_SCAN = 25;

/**
 * The short rows opening the explore page before any filter is picked. Rendered on the server and
 * cached publicly, so no row ever holds an 18+ story. A row may repeat a story of another: each is
 * its own way in.
 */
export interface ExploreEntry {
  /** Most read this week; `available: false` when the rankings could not be read. */
  ranking: RankingPage;
  completed: StoryCardDto[];
  spotlight: StoryCardDto[];
}

export async function getExploreEntry(
  db: Db,
  reader: RankingReader | null,
  now: Date = new Date(),
): Promise<ExploreEntry> {
  const general = { includeMature: false, limit: EXPLORE_ENTRY_SIZE };
  const [ranking, completed, spotlight] = await Promise.all([
    readRanking(db, reader, 'week', { ...general, scan: ENTRY_RANKING_SCAN }),
    listRecentlyCompleted(db, general),
    listNewStoriesSpotlight(db, now, EXPLORE_ENTRY_SIZE),
  ]);
  return { ranking, completed, spotlight };
}
