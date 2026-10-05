import { describe, expect, it } from 'vitest';
import { searchIndexNames } from './client';

describe('searchIndexNames', () => {
  it('prefixes both indexes', () => {
    expect(searchIndexNames('novelhub')).toEqual({
      stories: 'novelhub_stories',
      authors: 'novelhub_authors',
    });
    expect(searchIndexNames('test_a1-B').stories).toBe('test_a1-B_stories');
  });

  it.each(['a:b', '', 'a b', 'x'.repeat(33), 'tên'])('rejects the prefix %j', (prefix) => {
    expect(() => searchIndexNames(prefix)).toThrow(/QUEUE_PREFIX/);
  });
});
