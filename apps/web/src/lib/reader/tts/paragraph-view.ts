/**
 * Where the paragraphs of the chapter text sit on screen, for the listening player: which one to
 * start from and when to scroll to the one being read.
 */

/** Heights kept clear of the reading bars (and the player) when judging what is in view. */
const TOP_CLEARANCE = 80;
const BOTTOM_CLEARANCE = 170;

/** Paragraphs and headings of the text, in reading order. */
export function paragraphElements(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>('[data-pid]') ?? [])];
}

/** Some of the element shows between the reading bars. */
function overlapsView(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  return bottom > TOP_CLEARANCE && top < window.innerHeight - BOTTOM_CLEARANCE;
}

/** First paragraph whose text shows between the reading bars, or the first one. */
export function firstVisible(elements: HTMLElement[]): number {
  return Math.max(0, elements.findIndex(overlapsView));
}

/** Scrolls the element between the reading bars, unless it is there already. */
export function bringIntoView(element: HTMLElement): void {
  const { top, bottom, height } = element.getBoundingClientRect();
  if (top >= TOP_CLEARANCE && bottom <= window.innerHeight - BOTTOM_CLEARANCE) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    // A paragraph taller than half the screen is shown from its start.
    block: height > window.innerHeight / 2 ? 'start' : 'center',
  });
}

/** The reader is still looking at the element: following the reading will not pull them away. */
export function isFollowing(element: HTMLElement | null): boolean {
  return element === null || overlapsView(element);
}
