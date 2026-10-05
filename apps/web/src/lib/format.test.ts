import { describe, expect, it } from 'vitest';
import { formatDate, formatWordCount } from './format';

describe('formatWordCount', () => {
  it.each([
    [0, '0'],
    [850, '850'],
    [1_000, '1 nghìn'],
    [12_345, '12,3 nghìn'],
    [999_949, '999,9 nghìn'],
    [999_999, '1 triệu'],
    [1_250_000, '1,3 triệu'],
  ])('%i → %s', (words, text) => {
    expect(formatWordCount(words)).toBe(text);
  });
});

describe('formatDate', () => {
  it('shows the day in Vietnam time, whatever the time zone of the machine', () => {
    expect(formatDate('2026-10-05T03:00:00.000Z')).toBe('05/10/2026');
    // 23:30 UTC on the 4th is already the 5th in Vietnam.
    expect(formatDate('2026-10-04T23:30:00.000Z')).toBe('05/10/2026');
  });
});
