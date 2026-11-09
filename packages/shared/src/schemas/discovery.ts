/** Discovery rules: home listing threshold, the rotating new-stories spotlight, related stories. */

/** A story shows in the home page lists only once it has this much published text. */
export const HOME_LISTING_RULES = { minChapters: 3, minWords: 5_000 } as const;

/** The home page's "what to read today" tiles, in display order: tag slugs of four genres. */
export const HOME_GENRE_TILE_SLUGS = ['ngon-tinh', 'tien-hiep', 'kinh-di', 'huyen-huyen'] as const;
export type HomeGenreTileSlug = (typeof HOME_GENRE_TILE_SLUGS)[number];

/** Covers a home genre tile shows at most: the blurred backdrop is the first of them. */
export const HOME_GENRE_TILE_COVERS = 3;

/** "New stories that need readers": stories younger than `maxAgeDays`, `size` per rotation. */
export const NEW_STORY_SPOTLIGHT = { maxAgeDays: 30, size: 8 } as const;

/**
 * Extra stories the home page loads for the sections that drop stories already shown higher up,
 * so they stay full after the page removes them.
 */
export const HOME_DEDUPE_SLACK = 8;

/** Most stories the home page's "recently completed" section shows. */
export const HOME_COMPLETED_LIMIT = 12;

/** Most running contests the home page shows, ending soonest first. */
export const HOME_CONTESTS_LIMIT = 2;

/** Related stories on a story page: by the same author, and with the same main tag. */
export const RELATED_STORIES = { sameAuthor: 4, sameMainTag: 6 } as const;

const HOUR_MS = 3_600_000;

/**
 * Hours since the epoch, as a string: the seed that rotates the spotlight every hour. Vietnam is
 * UTC+7 with no daylight saving, so its hour boundaries are the UTC ones.
 */
export function spotlightHourKey(now: Date): string {
  return String(Math.floor(now.getTime() / HOUR_MS));
}
