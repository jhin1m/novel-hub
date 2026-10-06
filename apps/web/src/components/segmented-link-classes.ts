import { cn } from '@/lib/utils';

/*
 * Pill tabs for rows of links (shelves in /library, tabs and filters in /moderation). Classes only,
 * not a component: each page keeps its typed `<Link to search>` so navigation stays client-side.
 */

/** The track around the pills. */
export const SEGMENTED_LIST_CLASS = 'inline-flex gap-1 rounded-full bg-secondary p-1';

/**
 * One pill; the current one sits on the card colour in bold. `small` = a filter chip for rows that
 * wrap onto several lines (the list then drops the track, see `SEGMENTED_CHIP_LIST_CLASS`).
 */
export function segmentedLinkClass(current: boolean, small = false): string {
  return cn(
    'inline-flex items-center rounded-full whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
    small ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
    current
      ? 'bg-card font-bold text-foreground shadow-xs'
      : 'font-semibold text-muted-foreground hover:text-foreground',
    // Chips sit on the page, not on the track: the current one gets an outline to stand apart.
    small && (current ? 'border border-border' : 'bg-secondary'),
  );
}

/** Wrapping row for `small` chips (no track: a long row breaks onto several lines at 360px). */
export const SEGMENTED_CHIP_LIST_CLASS = 'flex flex-wrap gap-1.5';
