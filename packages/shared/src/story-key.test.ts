import { describe, expect, it } from 'vitest';
import { parseStoryKey, storyKey } from './story-key';

describe('parseStoryKey', () => {
  it('splits on the last dash', () => {
    expect(parseStoryKey('kiem-dao-k7m2xq9p')).toEqual({ slug: 'kiem-dao', publicId: 'k7m2xq9p' });
  });

  it('accepts a bare public id with an empty slug', () => {
    expect(parseStoryKey('k7m2xq9p')).toEqual({ slug: '', publicId: 'k7m2xq9p' });
  });

  it('rejects a malformed public id', () => {
    expect(parseStoryKey('abc-')).toBeNull();
    expect(parseStoryKey('x-0000000o')).toBeNull();
    expect(parseStoryKey('kiem-dao-K7M2XQ9P')).toBeNull();
    expect(parseStoryKey('')).toBeNull();
  });

  it('round-trips with storyKey', () => {
    const story = { slug: 'kiem-dao-doc-ton', publicId: 'k7m2xq9p' };
    expect(parseStoryKey(storyKey(story))).toEqual(story);
  });
});
