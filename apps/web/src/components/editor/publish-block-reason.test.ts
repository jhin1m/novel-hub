import { LIMITS } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { publishBlockReason } from './publish-block-reason';

const { min, max } = LIMITS.chapterWords;

describe('publishBlockReason', () => {
  it('reports how many words are missing below the minimum', () => {
    expect(publishBlockReason(min - 1, 'draft')).toEqual({ kind: 'too_short', missing: 1 });
    expect(publishBlockReason(0, 'draft')).toEqual({ kind: 'too_short', missing: min });
  });

  it('lets a chapter within the limits through, bounds included', () => {
    expect(publishBlockReason(min, 'draft')).toBeNull();
    expect(publishBlockReason(max, 'published')).toBeNull();
    expect(publishBlockReason(1_000, 'scheduled')).toBeNull();
  });

  it('reports how many words are over the maximum', () => {
    expect(publishBlockReason(max + 1, 'draft')).toEqual({ kind: 'too_long', extra: 1 });
  });

  it('puts a moderator hide ahead of the word count', () => {
    expect(publishBlockReason(500, 'hidden_by_mod')).toEqual({ kind: 'hidden_by_mod' });
    expect(publishBlockReason(10, 'hidden_by_mod')).toEqual({ kind: 'hidden_by_mod' });
  });

  it('accepts custom limits', () => {
    expect(publishBlockReason(5, 'draft', { min: 10, max: 20 })).toEqual({
      kind: 'too_short',
      missing: 5,
    });
  });
});
