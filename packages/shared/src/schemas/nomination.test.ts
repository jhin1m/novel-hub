import { describe, expect, it } from 'vitest';
import {
  nominationCreateSchema,
  nominationStatusQuerySchema,
  nominationWeekStart,
} from './nomination';

describe('nominationWeekStart', () => {
  it('starts the week at Monday 00:00 Vietnam time (Sunday 17:00 UTC)', () => {
    // Sunday 2026-10-11 16:59 UTC = Sunday 23:59 in Vietnam: still the week of Monday 10-05.
    expect(nominationWeekStart(new Date('2026-10-11T16:59:59Z'))).toBe('2026-10-05');
    // Sunday 17:00 UTC = Monday 00:00 in Vietnam: a new week.
    expect(nominationWeekStart(new Date('2026-10-11T17:00:00Z'))).toBe('2026-10-12');
  });
});

describe('nomination schemas', () => {
  it('take a public id only', () => {
    expect(nominationCreateSchema.parse({ publicId: 'k7m2xq9p' })).toEqual({
      publicId: 'k7m2xq9p',
    });
    expect(nominationCreateSchema.safeParse({ publicId: 'k7m2xq9p', weekStart: 'x' }).success).toBe(
      false,
    );
    expect(nominationStatusQuerySchema.safeParse({ story: 'bad' }).success).toBe(false);
    expect(nominationStatusQuerySchema.parse({ story: 'k7m2xq9p' })).toEqual({ story: 'k7m2xq9p' });
  });
});
