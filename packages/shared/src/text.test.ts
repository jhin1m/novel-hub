import { describe, expect, it } from 'vitest';
import { countWords } from './text';

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('Xin chào thế giới')).toBe(4);
    expect(countWords('  Lâm   Phong\nngồi xếp bằng ')).toBe(5);
    expect(countWords('')).toBe(0);
  });

  it('splits on em dashes and the ellipsis character', () => {
    expect(countWords('anh—em')).toBe(2);
    expect(countWords('đợi…rồi')).toBe(2);
  });

  it('ignores tokens without a letter or digit', () => {
    expect(countWords('— … !!!')).toBe(0);
  });

  it('counts digits and keeps hyphenated words whole', () => {
    expect(countWords('123 456')).toBe(2);
    expect(countWords('e-mail')).toBe(1);
  });

  it('gives the same count for NFD and NFC input', () => {
    const nfc = 'Thế giới tiên hiệp';
    expect(countWords(nfc.normalize('NFD'))).toBe(countWords(nfc));
  });
});
