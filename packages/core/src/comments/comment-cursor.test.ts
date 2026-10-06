import { describe, expect, it } from 'vitest';
import { decodeCommentCursor, encodeCommentCursor } from './comment-cursor';

const id = '01920000-0000-7000-8000-000000000001';

describe('comment cursor', () => {
  it('round-trips', () => {
    const cursor = encodeCommentCursor('1759708800123456', id);
    expect(decodeCommentCursor(cursor)).toEqual({ micros: '1759708800123456', id });
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', `_${id}`, `12_${id}x`, '12_nope', `1${'0'.repeat(17)}_${id}`]) {
      expect(decodeCommentCursor(bad), bad).toBeNull();
    }
  });
});
