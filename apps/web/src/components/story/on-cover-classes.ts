/*
 * Buttons on a hero over a blurred cover (home and story page). The hero sets `--story-tint` to
 * the solid button's text colour. Only `--cover-fg` is used, the one colour the scrim guarantees:
 * outline text in `--foreground` or a `--primary` fill would sink into some covers. The solid
 * button's focus mark is an outline set off from it, since a ring in its own colour would just
 * look like a bigger button.
 */

/** Filled call to action on the cover. */
export const ON_COVER_SOLID =
  'bg-(--cover-fg) text-(--story-tint) hover:bg-(--cover-fg)/90 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-(--cover-fg)';

/** Outlined secondary action on the cover. */
export const ON_COVER_OUTLINE =
  'border-[1.5px] border-(--cover-fg) bg-transparent text-(--cover-fg) hover:bg-(--cover-fg)/10 hover:text-(--cover-fg) focus-visible:ring-(--cover-fg)';
