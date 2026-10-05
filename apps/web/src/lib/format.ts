import { m } from '@novel-hub/shared/messages';

/**
 * Formats for publicly cached HTML. The same output on the server and in every browser, whatever
 * its locale or time zone, so hydration never disagrees; no relative times ("2 hours ago"), which
 * would go stale in the cache.
 */

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

const date = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** A number with at most one decimal, Vietnamese style (`1,5`). */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

/** A word count in short form: `850`, `12,3 nghìn`, `1,2 triệu`. */
export function formatWordCount(words: number): string {
  // From 999,950 the thousands would round to "1.000 nghìn".
  if (words >= 999_950) return m.format_millions({ count: decimal.format(words / 1_000_000) });
  if (words >= 1_000) return m.format_thousands({ count: decimal.format(words / 1_000) });
  return decimal.format(words);
}

/** `dd/MM/yyyy` in Vietnam time, from an ISO timestamp. */
export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}
