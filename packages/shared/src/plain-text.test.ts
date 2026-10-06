import { describe, expect, it } from 'vitest';
import { normalizePlainText, plainTextLength } from './plain-text';

describe('normalizePlainText', () => {
  it('composes to NFC and trims', () => {
    const decomposed = '  Tiếng Việt  ';
    expect(normalizePlainText(decomposed, 100)).toBe('Tiếng Việt');
  });

  it('drops control and bidi characters but keeps line feeds', () => {
    expect(normalizePlainText('a\u0000b\u0007c‮d\r\ne\tf', 100)).toBe('abcd\ne f');
  });

  it('keeps up to two blank lines in a row', () => {
    expect(normalizePlainText('a\n\nb', 100)).toBe('a\n\nb');
    expect(normalizePlainText('a\n\n\nb', 100)).toBe('a\n\n\nb');
    expect(normalizePlainText('a\n\n\n\n\n\nb', 100)).toBe('a\n\n\nb');
    expect(normalizePlainText('a  \n \n \n \n \nb', 100)).toBe('a\n\n\nb');
  });

  it('returns null when empty or too long', () => {
    expect(normalizePlainText('', 10)).toBeNull();
    expect(normalizePlainText(' \n\t\u0000 ', 10)).toBeNull();
    expect(normalizePlainText('x'.repeat(2_000), 2_000)).toBe('x'.repeat(2_000));
    expect(normalizePlainText('x'.repeat(2_001), 2_000)).toBeNull();
  });

  it('treats text made only of invisible characters as empty', () => {
    expect(normalizePlainText('\u200B\u200D\u2060', 10)).toBeNull();
    expect(normalizePlainText('a\u2028b', 10)).toBe('a\nb');
    expect(normalizePlainText('👍', 10)).toBe('👍');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(plainTextLength('😀ă')).toBe(2);
    expect(normalizePlainText('😀'.repeat(3), 3)).toBe('😀😀😀');
  });
});
