import { describe, expect, it } from 'vitest';
import { fromLocalInputValue, toLocalInputValue } from './local-datetime';

describe('local datetime input values', () => {
  it('round-trips a wall-clock time of the device', () => {
    const value = '2026-11-02T20:30';
    const iso = fromLocalInputValue(value);
    expect(iso).not.toBeNull();
    expect(toLocalInputValue(new Date(iso!))).toBe(value);
    expect(new Date(iso!).getTime()).toBe(new Date(2026, 10, 2, 20, 30).getTime());
  });

  it('rejects empty, malformed and impossible values', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('2026-11-02 20:30')).toBeNull();
    expect(fromLocalInputValue('2026-02-30T08:00')).toBeNull();
  });
});
