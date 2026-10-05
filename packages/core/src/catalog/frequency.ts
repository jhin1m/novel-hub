const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

/**
 * Release pace shown on the story page: chapters published in the last 30 days, as chapters per
 * week rounded to one decimal. Fewer than 2 chapters in the window says nothing useful → `null`.
 * Computed on read, never stored.
 */
export function chaptersPerWeek(publishedAts: readonly Date[], now: Date): number | null {
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const recent = publishedAts.filter((d) => d.getTime() > since && d.getTime() <= now.getTime());
  if (recent.length < 2) return null;
  return Math.round(((recent.length * 7) / WINDOW_DAYS) * 10) / 10;
}
