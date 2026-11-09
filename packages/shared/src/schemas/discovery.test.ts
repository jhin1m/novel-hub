import { describe, expect, it } from 'vitest';
import { spotlightHourKey } from './discovery';

describe('spotlightHourKey', () => {
  it('stays the same within an hour and changes on the hour', () => {
    const start = new Date('2026-10-07T05:00:00.000Z');
    const key = spotlightHourKey(start);
    expect(spotlightHourKey(new Date('2026-10-07T05:59:59.999Z'))).toBe(key);
    expect(spotlightHourKey(new Date('2026-10-07T06:00:00.000Z'))).toBe(String(Number(key) + 1));
    expect(spotlightHourKey(new Date('2026-10-07T04:59:59.999Z'))).toBe(String(Number(key) - 1));
  });
});
