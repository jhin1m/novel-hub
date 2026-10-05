import { describe, expect, it } from 'vitest';
import {
  DEFAULT_READER_SETTINGS,
  READER_RANGES,
  READER_THEMES,
  chapterViewInput,
  isInReaderRange,
  parseChapterNumber,
  parseChapterSegment,
  readerSettingsSchema,
  readingProgressInput,
} from './reader';

describe('reading inputs', () => {
  it('accepts a chapter reference with a scroll position', () => {
    const input = { publicId: 'k7m2xq9p', number: 3, scrollPct: 42.5 };
    expect(readingProgressInput.parse(input)).toEqual(input);
    expect(chapterViewInput.parse({ publicId: 'k7m2xq9p', number: 1 })).toEqual({
      publicId: 'k7m2xq9p',
      number: 1,
    });
  });

  it.each([
    { publicId: 'k7m2xq9p', number: 0, scrollPct: 1 },
    { publicId: 'k7m2xq9p', number: 1.5, scrollPct: 1 },
    { publicId: 'k7m2xq9p', number: 1, scrollPct: 100.1 },
    { publicId: 'k7m2xq9p', number: 1, scrollPct: -1 },
    { publicId: '', number: 1, scrollPct: 1 },
    { publicId: 'k7m2xq9p', number: '1', scrollPct: 1 },
  ])('rejects %o', (input) => {
    expect(readingProgressInput.safeParse(input).success).toBe(false);
  });
});

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

describe('readerSettingsSchema', () => {
  const valid = (patch: Record<string, unknown>) =>
    readerSettingsSchema.safeParse({ ...DEFAULT_READER_SETTINGS, ...patch }).success;

  it('accepts the defaults and every preset', () => {
    expect(valid({})).toBe(true);
    for (const theme of READER_THEMES) expect(valid({ theme })).toBe(true);
  });

  it('accepts the range ends and values on a step', () => {
    for (const patch of [
      { fontSize: 14 },
      { fontSize: 28 },
      { lineHeight: 1.5 },
      { lineHeight: 1.7 },
      { lineHeight: 2.2 },
      { paragraphSpacing: 0 },
      { paragraphSpacing: 1.75 },
      { paragraphSpacing: 2 },
    ]) {
      expect(valid(patch), JSON.stringify(patch)).toBe(true);
    }
  });

  it('rejects values out of range or off a step', () => {
    for (const patch of [
      { fontSize: 13 },
      { fontSize: 29 },
      { fontSize: 18.5 },
      { lineHeight: 1.4 },
      { lineHeight: 2.25 },
      { paragraphSpacing: 0.3 },
      { paragraphSpacing: -0.25 },
      { fontSize: Number.NaN },
    ]) {
      expect(valid(patch), JSON.stringify(patch)).toBe(false);
    }
  });

  it('rejects unknown enum values and a missing or fractional updatedAt', () => {
    expect(valid({ theme: 'neon' })).toBe(false);
    expect(valid({ font: 'comic-sans' })).toBe(false);
    expect(valid({ width: 'huge' })).toBe(false);
    expect(valid({ align: 'center' })).toBe(false);
    expect(valid({ updatedAt: 1.5 })).toBe(false);
    expect(valid({ updatedAt: -1 })).toBe(false);
    expect(valid({ updatedAt: undefined })).toBe(false);
  });
});

describe('isInReaderRange', () => {
  it('handles float steps without rounding errors', () => {
    for (let i = 0; i <= 7; i += 1) {
      expect(isInReaderRange(1.5 + i * 0.1, READER_RANGES.lineHeight)).toBe(true);
    }
  });
});
