import { describe, expect, it } from 'vitest';
import { contrastRatio, contrastViolations, parseHex } from './contrast';

describe('parseHex', () => {
  it('parses 6- and 3-digit hex, case-insensitively', () => {
    expect(parseHex('#A8432A')).toEqual([168, 67, 42]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#0aF')).toEqual([0, 170, 255]);
  });

  it.each(['fff', '#ffff', '#gggggg', '', '#12345'])('invalid hex "%s" throws', (hex) => {
    expect(() => parseHex(hex)).toThrow();
  });
});

describe('contrastRatio', () => {
  it('black/white is 21, identical colours are 1, order does not matter', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#a8432a', '#A8432A')).toBe(1);
  });

  it('matches the ratios computed when the accent colour was chosen', () => {
    expect(contrastRatio('#A8432A', '#FBF8F3')).toBeCloseTo(5.66, 2);
    expect(contrastRatio('#D9825F', '#1C1A18')).toBeCloseTo(6.04, 2);
  });
});

describe('contrastViolations', () => {
  const pairs = [{ bg: '--background', fg: '--foreground', min: 4.5 }];

  it('passing pair yields no violation', () => {
    expect(contrastViolations({ '--background': '#fff', '--foreground': '#000' }, pairs)).toEqual(
      [],
    );
  });

  it('light grey text on a light background is reported with its ratio', () => {
    const [violation, ...rest] = contrastViolations(
      { '--background': '#FBF8F3', '--foreground': '#CCCCCC' },
      pairs,
    );
    expect(rest).toEqual([]);
    expect(violation?.ratio).toBeLessThan(4.5);
  });

  it('missing variable is reported with a null ratio', () => {
    expect(contrastViolations({ '--background': '#fff' }, pairs)).toEqual([
      { ...pairs[0], ratio: null },
    ]);
  });
});
