import { addDays } from '../rankings';

/** The author dashboard always covers the last 30 stats days, today included. */
export const STATS_WINDOW_DAYS = 30;

/** Inclusive `YYYY-MM-DD` range of the dashboard window ending on `today` (`statsDate(now)`). */
export function authorStatsWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -(STATS_WINDOW_DAYS - 1)), to: today };
}

/** Story-wide numbers of `GET /api/v1/author-stats/:publicId`; all but the total over the window. */
export interface StoryStatsTotals {
  /** Chapter reads (`chapter_daily_stats.views`). */
  views: number;
  /** Distinct readers per day summed over the window (`story_daily_stats`). */
  readers: number;
  newStoryFollows: number;
  /** New followers of the author (the account, not only this story). */
  newAuthorFollows: number;
  /** Followers of the story, all time. */
  storyFollowersTotal: number;
}

/**
 * One published chapter. `reached` counts signed-in readers (the author excluded) whose latest
 * chapter of the story is this one or a later one, all time; `dropOffPct` is the share of them
 * who never got to the next published chapter, `null` for the last chapter or when nobody reached.
 */
export interface ChapterStatsRow {
  number: number;
  title: string | null;
  views30d: number;
  reached: number;
  dropOffPct: number | null;
}

export interface StoryStatsDto {
  story: { publicId: string; title: string };
  window: { from: string; to: string };
  totals: StoryStatsTotals;
  chapters: ChapterStatsRow[];
}
