import { CONTINUE_ROWS_MAX } from './account-hint';

/**
 * Pure helpers behind the home page sections. They take the smallest shape they need, so the
 * same function works on the loader data and on the JSON the API returns (dates as strings).
 */

/**
 * The story the home hero shows: the first one in the list that has a published chapter. Every
 * story the notable list holds is past the home listing threshold, so this guards the hero against
 * a list from any other source.
 */
export function pickHero<T extends { chapterCount: number }>(stories: readonly T[]): T | null {
  return stories.find((story) => story.chapterCount > 0) ?? null;
}

/**
 * The first `max` reading-history entries this reader may see. The history API lists 18+ stories
 * too (it is the reader's own list), so they are dropped unless the account shows them.
 */
export function continueRows<T extends { story: { isMature: boolean } }>(
  items: readonly T[],
  showMature: boolean,
  max = CONTINUE_ROWS_MAX,
): T[] {
  return items.filter((item) => showMature || !item.story.isMature).slice(0, max);
}
