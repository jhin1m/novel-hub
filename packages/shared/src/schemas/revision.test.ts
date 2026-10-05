import { describe, expect, it } from 'vitest';
import { restoreRevisionSchema, revisionKeySchema, revisionParamSchema } from './revision';

describe('revisionKeySchema', () => {
  it('accepts epoch milliseconds and rejects anything else', () => {
    expect(revisionKeySchema.safeParse('1791158400123').success).toBe(true);
    expect(revisionKeySchema.safeParse('0').success).toBe(true);
    for (const key of [
      '',
      '-1',
      '1.5',
      '1e10',
      'abc',
      '1234567890123456',
      '0190a5c4-7d2e-7c3a-9b1e-0a1b2c3d4e5f',
    ]) {
      expect(revisionKeySchema.safeParse(key).success, key).toBe(false);
    }
  });
});

describe('revisionParamSchema', () => {
  it('extends the chapter params with the key', () => {
    expect(
      revisionParamSchema.parse({ publicId: 'k7m2xq9p', number: '2', key: '1791158400123' }),
    ).toEqual({ publicId: 'k7m2xq9p', number: 2, key: '1791158400123' });
    expect(
      revisionParamSchema.safeParse({ publicId: 'k7m2xq9p', number: '2', key: 'x' }).success,
    ).toBe(false);
  });
});

describe('restoreRevisionSchema', () => {
  it('needs an ISO draft version', () => {
    expect(
      restoreRevisionSchema.safeParse({ baseUpdatedAt: new Date().toISOString() }).success,
    ).toBe(true);
    expect(restoreRevisionSchema.safeParse({ baseUpdatedAt: 'yesterday' }).success).toBe(false);
    expect(restoreRevisionSchema.safeParse({}).success).toBe(false);
  });
});
