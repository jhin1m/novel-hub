export interface ScrollGeometry {
  /** `window.scrollY`. */
  scrollY: number;
  /** `window.innerHeight`. */
  viewportHeight: number;
  /** Top of the chapter text in document coordinates. */
  top: number;
  /** Height of the chapter text. */
  height: number;
}

/**
 * How far through the chapter text the reader is, 0–100 with one decimal: the share of the text
 * above the bottom of the screen. 100 once the end of the text is on screen.
 */
export function computeScrollPct({ scrollY, viewportHeight, top, height }: ScrollGeometry): number {
  if (height <= 0) return 0;
  const pct = ((scrollY + viewportHeight - top) / height) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

/** `computeScrollPct` for an element on the current page. */
export function scrollPctOf(element: Element): number {
  const rect = element.getBoundingClientRect();
  return computeScrollPct({
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    top: rect.top + window.scrollY,
    height: rect.height,
  });
}
