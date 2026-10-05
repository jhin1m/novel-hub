import { describe, expect, it } from 'vitest';
import { statsDate } from './views';

describe('statsDate', () => {
  it('uses the Vietnamese calendar day', () => {
    // 17:30 UTC is 00:30 the next day in Vietnam (UTC+7).
    expect(statsDate(new Date('2026-10-05T17:30:00Z'))).toBe('2026-10-06');
    expect(statsDate(new Date('2026-10-05T16:59:59Z'))).toBe('2026-10-05');
    expect(statsDate(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });
});
