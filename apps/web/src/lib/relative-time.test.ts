import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
  it('picks the largest whole unit in the past', () => {
    expect(formatRelativeTime(ago(10), NOW)).toBe(
      new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' }).format(0, 'minute'),
    );
    expect(formatRelativeTime(ago(5 * 60), NOW)).toContain('5');
    expect(formatRelativeTime(ago(3 * 3600), NOW)).toContain('3');
    expect(formatRelativeTime(ago(2 * 24 * 3600), NOW)).toBe(
      new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' }).format(-2, 'day'),
    );
  });
});
