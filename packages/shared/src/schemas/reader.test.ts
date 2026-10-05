import { describe, expect, it } from 'vitest';
import { parseChapterNumber, parseChapterSegment } from './reader';

describe('parseChapterSegment', () => {
  it('reads the number of a canonical segment', () => {
    expect(parseChapterSegment('chapter-1')).toBe(1);
    expect(parseChapterSegment('chapter-12')).toBe(12);
    expect(parseChapterSegment('chapter-2147483647')).toBe(2_147_483_647);
  });

  it('rejects zero, leading zeros, signs and non-digits', () => {
    for (const segment of [
      'chapter-0',
      'chapter-03',
      'chapter-+3',
      'chapter--3',
      'chapter-3a',
      'chapter-1.5',
      'chapter-',
      'chapter- 3',
      'Chapter-3',
      'chuong-3',
      '3',
    ]) {
      expect(parseChapterSegment(segment)).toBeNull();
    }
  });

  it('rejects numbers above the integer column range', () => {
    expect(parseChapterSegment('chapter-2147483648')).toBeNull();
    expect(parseChapterSegment('chapter-99999999999')).toBeNull();
  });
});

describe('parseChapterNumber', () => {
  it('parses the bare number', () => {
    expect(parseChapterNumber('7')).toBe(7);
    expect(parseChapterNumber('07')).toBeNull();
  });
});
