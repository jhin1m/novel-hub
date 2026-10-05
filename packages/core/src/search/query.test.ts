import { describe, expect, it } from 'vitest';
import { buildStoryFilter } from './query';

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
