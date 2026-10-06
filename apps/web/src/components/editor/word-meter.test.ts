import { LIMITS } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { wordMeter } from './word-meter';

describe('wordMeter', () => {
  it('is empty with no words', () => {
    expect(wordMeter(0).ratio).toBe(0);
  });

  it('fills in proportion to the maximum and stops full past it', () => {
    expect(wordMeter(5_000, { min: 300, max: 20_000 }).ratio).toBe(0.25);
    expect(wordMeter(LIMITS.chapterWords.max + 1).ratio).toBe(1);
  });

  it('puts the minimum marker at min / max', () => {
    expect(wordMeter(0).minMarker).toBe(LIMITS.chapterWords.min / LIMITS.chapterWords.max);
    expect(wordMeter(0, { min: 300, max: 20_000 }).minMarker).toBe(0.015);
  });
});
