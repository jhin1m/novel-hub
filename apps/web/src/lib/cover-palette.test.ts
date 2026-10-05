import { describe, expect, it } from 'vitest';
import {
  COVER_PALETTE_SIZE,
  coverColorVar,
  coverPaletteIndex,
  coverTitleClass,
  fnv1a32,
} from './cover-palette';

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = fnv1a32('huyen-huyen');
    expect(hash).toBe(4228185114);
    expect(hash).toBeGreaterThan(2 ** 31);
  });
});

describe('coverPaletteIndex', () => {
  it('gives fixed slots for sample tag slugs', () => {
    expect(coverPaletteIndex('tien-hiep')).toBe(2);
    expect(coverPaletteIndex('ngon-tinh')).toBe(3);
    expect(coverPaletteIndex('')).toBe(1);
  });

  it('stays within the palette and is stable across calls', () => {
    for (const slug of ['do-thi', 'huyen-huyen', 'kiem-hiep', 'trinh-tham', 'x'.repeat(200)]) {
      const index = coverPaletteIndex(slug);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(COVER_PALETTE_SIZE);
      expect(coverPaletteIndex(slug)).toBe(index);
    }
  });
});

describe('coverColorVar', () => {
  it('points at the palette slot of the tag', () => {
    expect(coverColorVar('tien-hiep')).toBe('var(--cover-2)');
    expect(coverColorVar('ngon-tinh')).toBe('var(--cover-3)');
  });
});

describe('coverTitleClass', () => {
  it('steps the size down at 20, 45 and 90 characters', () => {
    expect(coverTitleClass('a'.repeat(20))).toContain('13cqw');
    expect(coverTitleClass('a'.repeat(21))).toContain('11cqw');
    expect(coverTitleClass('a'.repeat(45))).toContain('11cqw');
    expect(coverTitleClass('a'.repeat(46))).toContain('9cqw');
    expect(coverTitleClass('a'.repeat(90))).toContain('9cqw');
    expect(coverTitleClass('a'.repeat(150))).toContain('7cqw');
  });

  it('counts characters, not UTF-16 units, and keeps a rem fallback', () => {
    // Each emoji is two UTF-16 units but one character.
    expect(coverTitleClass('😀'.repeat(20))).toContain('13cqw');
    expect(coverTitleClass('Ngã ba')).toMatch(/^text-xl /);
  });
});
