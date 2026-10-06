/**
 * Rules for counting chapter reads. Shared by the reading page (dwell time) and the server
 * (per-day caps), so both sides agree on what one read is.
 */
export const VIEW_RULES = {
  /** Time the tab must be visible on the chapter before the read is sent (ms). */
  minDwellMs: 30_000,
  /** Reads counted per viewer (account or anonymous cookie) per chapter per day. */
  perViewerPerDay: 3,
  /** Reads counted per IP per chapter per day. */
  perIpPerDay: 10,
  /**
   * Distinct readers one IP may add to a story per day (rankings count readers per story, so
   * rotating cookies over many chapters cannot raise a story past this).
   */
  perIpPerStoryPerDay: 10,
  /** Lifetime of the Redis counters: today plus a day of slack for the flush (s). */
  keyTtlSec: 172_800,
} as const;

/** The day a read belongs to is the Vietnamese calendar day, not the UTC one. */
export const STATS_TIMEZONE = 'Asia/Ho_Chi_Minh';

const statsDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` of `now` in `STATS_TIMEZONE` (the `chapter_daily_stats.date` key). */
export function statsDate(now: Date): string {
  return statsDayFormat.format(now);
}
