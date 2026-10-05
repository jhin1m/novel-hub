import { describe, expect, it } from 'vitest';
import { DEDUPE, LIMITS } from './limits';

describe('LIMITS', () => {
  it('matches the starting values of the spec', () => {
    expect(LIMITS.storyTitle).toEqual({ min: 2, max: 150 });
    expect(LIMITS.storySynopsisMax).toBe(3_000);
    expect(LIMITS.storyTagsMax).toBe(10);
    expect(LIMITS.draftMaxBytes).toBe(2_000_000);
    expect(LIMITS.revisionsKept).toBe(20);
    expect(LIMITS.schedule).toEqual({ minLeadMs: 300_000, maxAheadMs: 31_536_000_000 });
    expect(LIMITS.cover.maxBytes).toBe(5 * 1024 * 1024);
    expect(LIMITS.cover.variants.map((v) => `${v.width}x${v.height}`)).toEqual([
      '600x900',
      '300x450',
    ]);
  });
});

describe('DEDUPE', () => {
  it('splits the MinHash signature exactly into the LSH bands', () => {
    expect(DEDUPE.bands * DEDUPE.rows).toBe(DEDUPE.perms);
    expect(DEDUPE.jaccard).toBe(0.7);
  });
});
