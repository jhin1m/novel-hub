const relative = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * "5 phút trước", "hôm qua"… from an ISO timestamp. Only for personal pages rendered in the
 * browser: cached HTML must use `formatDate`, since a relative time goes stale.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  // Never in the future: a server clock slightly ahead of the browser's still reads as "now".
  const seconds = Math.min(0, Math.round((new Date(iso).getTime() - now) / 1000));
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return relative.format(0, 'minute');
}
