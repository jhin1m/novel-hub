import { describe, expect, it } from 'vitest';
import { ratingListQuerySchema, ratingStoryQuerySchema, ratingUpsertSchema } from './rating';

const id = '01920000-0000-7000-8000-000000000001';

describe('ratingUpsertSchema', () => {
  const base = { publicId: 'k7m2xq9p' };

  it('accepts whole scores from 1 to 5 and normalises the review', () => {
    expect(ratingUpsertSchema.parse({ ...base, score: 1 })).toEqual({
      ...base,
      score: 1,
      review: null,
    });
    expect(
      ratingUpsertSchema.parse({ ...base, score: 5, review: '  Truyện hay\r\n\n\n\n\nlắm ' }),
    ).toMatchObject({ score: 5, review: 'Truyện hay\n\n\nlắm' });
  });

  it('stores a review with nothing visible as no review', () => {
    expect(ratingUpsertSchema.parse({ ...base, score: 3, review: '  \n\t ' }).review).toBeNull();
    expect(ratingUpsertSchema.parse({ ...base, score: 3, review: '' }).review).toBeNull();
  });

  it('rejects scores outside 1–5 or not whole', () => {
    for (const score of [0, 6, 2.5, '4']) {
      expect(ratingUpsertSchema.safeParse({ ...base, score }).success).toBe(false);
    }
  });

  it('rejects a review longer than 5,000 characters and a bad public id', () => {
    expect(
      ratingUpsertSchema.safeParse({ ...base, score: 4, review: 'x'.repeat(5_000) }).success,
    ).toBe(true);
    expect(
      ratingUpsertSchema.safeParse({ ...base, score: 4, review: 'x'.repeat(5_001) }).success,
    ).toBe(false);
    expect(
      ratingUpsertSchema.safeParse({ ...base, score: 4, review: 'x'.repeat(20_001) }).success,
    ).toBe(false);
    expect(ratingUpsertSchema.safeParse({ publicId: 'k7m2xq9o', score: 4 }).success).toBe(false);
  });
});

describe('rating queries', () => {
  it('reads the story and an optional cursor', () => {
    expect(ratingListQuerySchema.parse({ story: 'k7m2xq9p' })).toEqual({ story: 'k7m2xq9p' });
    const cursor = `1759708800000000_${id}`;
    expect(ratingListQuerySchema.parse({ story: 'k7m2xq9p', cursor }).cursor).toBe(cursor);
    expect(ratingListQuerySchema.safeParse({ story: 'k7m2xq9p', cursor: 'x' }).success).toBe(false);
    expect(ratingStoryQuerySchema.safeParse({ story: 'short' }).success).toBe(false);
  });
});
