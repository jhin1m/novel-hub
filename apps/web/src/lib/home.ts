/**
 * Pure helpers behind the home page sections. They take the smallest shape they need, so the
 * same function works on the loader data and on the JSON the API returns (dates as strings).
 */

/**
 * The story the home hero shows: the first one in the list that has a published chapter. The
 * notable list tops itself up with the newest public stories, which may have none yet.
 */
export function pickHero<T extends { chapterCount: number }>(stories: readonly T[]): T | null {
  return stories.find((story) => story.chapterCount > 0) ?? null;
}

/** The list without one story (`publicId: null` = the list as it is), in the same order. */
export function withoutStory<T extends { publicId: string }>(
  stories: readonly T[],
  publicId: string | null,
): T[] {
  return publicId === null ? [...stories] : stories.filter((story) => story.publicId !== publicId);
}

/**
 * The first `max` reading-history entries this reader may see. The history API lists 18+ stories
 * too (it is the reader's own list), so they are dropped unless the account shows them.
 */
export function continueRows<T extends { story: { isMature: boolean } }>(
  items: readonly T[],
  showMature: boolean,
  max = 3,
): T[] {
  return items.filter((item) => showMature || !item.story.isMature).slice(0, max);
}
