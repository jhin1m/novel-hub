import { describe, expect, it } from 'vitest';
import { buildAuthorFilter, buildStoryFilter, toAuthorHit } from './query';

describe('buildStoryFilter', () => {
  it('always leaves 18+ stories out unless the reader allowed them', () => {
    expect(buildStoryFilter({}, { includeMature: false })).toEqual(['isMature = false']);
    expect(buildStoryFilter({}, { includeMature: true })).toEqual([]);
  });

  it('turns each field into one expression', () => {
    expect(
      buildStoryFilter(
        { tag: 'tien-hiep', status: 'completed', minWords: 50_000, maxWords: 199_999 },
        { includeMature: false },
      ),
    ).toEqual([
      'isMature = false',
      'tagSlugs = "tien-hiep"',
      'status = "completed"',
      'wordCount >= 50000',
      'wordCount <= 199999',
    ]);
  });

  it('keeps a zero bound', () => {
    expect(buildStoryFilter({ minWords: 0 }, { includeMature: true })).toEqual(['wordCount >= 0']);
  });
});

describe('buildAuthorFilter', () => {
  it('leaves out authors with only 18+ public stories unless the reader allowed 18+', () => {
    expect(buildAuthorFilter({ includeMature: false })).toEqual(['storyCount > 0']);
    expect(buildAuthorFilter({ includeMature: true })).toEqual([]);
  });
});

describe('toAuthorHit', () => {
  const doc = {
    username: 'lam_phong',
    displayName: 'Lâm Phong',
    avatarUrl: null,
    storyCount: 2,
    matureStoryCount: 3,
  };

  it('counts 18+ stories only for a reader who allowed them, and drops extra fields', () => {
    expect(
      toAuthorHit({ ...doc, _rankingScore: 1 } as typeof doc, { includeMature: false }),
    ).toEqual({ username: 'lam_phong', displayName: 'Lâm Phong', avatarUrl: null, storyCount: 2 });
    expect(toAuthorHit(doc, { includeMature: true }).storyCount).toBe(5);
  });
});
