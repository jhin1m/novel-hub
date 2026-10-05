/*
 * Buttons on a story hero, whose background is the main tag's cover colour (`--story-tint`). Only
 * the cover pair is used (`--cover-fg` on any `--cover-N` is at least 5:1), because the site
 * colours are not: outline text in `--foreground` or a `--primary` fill would sink into some
 * covers. The solid button's focus mark is an outline set off from it, since a ring in its own
 * colour would just look like a bigger button.
 */

/** Filled call to action on the cover colour. */
export const ON_COVER_SOLID =
  'bg-(--cover-fg) text-(--story-tint) hover:bg-(--cover-fg)/90 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-(--cover-fg)';

/** Outlined secondary action on the cover colour. */
export const ON_COVER_OUTLINE =
  'border-[1.5px] border-(--cover-fg) bg-transparent text-(--cover-fg) hover:bg-(--cover-fg)/10 hover:text-(--cover-fg) focus-visible:ring-(--cover-fg)';
