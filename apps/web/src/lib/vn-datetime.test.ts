import { describe, expect, it } from 'vitest';
import { fromVnDateTimeLocal, toVnDateTimeLocal } from './vn-datetime';

describe('vn-datetime', () => {
  it('shows an instant in Vietnam time, to the minute', () => {
    expect(toVnDateTimeLocal('2026-10-06T01:30:45Z')).toBe('2026-10-06T08:30');
    expect(toVnDateTimeLocal(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01T03:00');
  });

  it('reads a value as Vietnam time with the offset', () => {
    const iso = fromVnDateTimeLocal('2026-10-06T08:30');
    expect(iso).toBe('2026-10-06T08:30:00+07:00');
    expect(new Date(iso ?? '').toISOString()).toBe('2026-10-06T01:30:00.000Z');
  });

  it('round-trips', () => {
    const value = '2027-03-01T00:05';
    expect(toVnDateTimeLocal(fromVnDateTimeLocal(value) ?? '')).toBe(value);
  });

  it('rejects empty, malformed and impossible values', () => {
    for (const value of [
      '',
      '2026-10-06',
      '2026-10-06 08:30',
      '2026-02-30T10:00',
      '2026-10-06T25:00',
    ]) {
      expect(fromVnDateTimeLocal(value)).toBeNull();
    }
  });
});
