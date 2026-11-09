import type { StoryCardDto } from '@novel-hub/core';
import { describe, expect, it, vi } from 'vitest';
import { pickRelatedStories } from './related-stories';

// The unit project has no `@/` alias, and only the pure selection is under test.
vi.mock('@/lib/api-client', () => ({ createApiClient: () => ({}) }));
vi.mock('@/lib/api-errors', () => ({ readApiError: vi.fn() }));
vi.mock('@/lib/use-near-viewport', () => ({ useNearViewport: () => false }));
vi.mock('@/lib/utils', () => vi.importActual('../../lib/utils'));

const stories = (...ids: string[]) => ids.map((publicId) => ({ publicId }) as StoryCardDto);
const ids = (list: StoryCardDto[]) => list.map((story) => story.publicId);

describe('pickRelatedStories', () => {
  it('puts the same author first and shows a story in both lists once', () => {
    const picked = pickRelatedStories({
      sameAuthor: stories('a', 'b'),
      sameMainTag: stories('b', 'c'),
    });
    expect(ids(picked)).toEqual(['a', 'b', 'c']);
  });

  it('stops at six stories', () => {
    const picked = pickRelatedStories({
      sameAuthor: stories('a', 'b', 'c', 'd'),
      sameMainTag: stories('e', 'f', 'g', 'h'),
    });
    expect(ids(picked)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('is empty when both lists are', () => {
    expect(pickRelatedStories({ sameAuthor: [], sameMainTag: [] })).toEqual([]);
  });
});
