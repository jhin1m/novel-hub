import { describe, expect, it } from 'vitest';
import { computeDropOff, reachedByChapter } from './drop-off';

describe('computeDropOff', () => {
  it('is the share of readers lost before the next chapter, null on the last one', () => {
    const rows = computeDropOff([
      { number: 1, reached: 10 },
      { number: 2, reached: 6 },
      { number: 3, reached: 2 },
    ]);
    expect(rows.map((r) => r.dropOffPct)).toEqual([40, 66.7, null]);
  });

  it('is 0 when everyone went on, and null when nobody reached the chapter', () => {
    const rows = computeDropOff([
      { number: 1, reached: 4 },
      { number: 2, reached: 4 },
      { number: 3, reached: 0 },
      { number: 4, reached: 0 },
    ]);
    expect(rows.map((r) => r.dropOffPct)).toEqual([0, 100, null, null]);
  });

  it('keeps the other fields and handles an empty story', () => {
    expect(computeDropOff([{ number: 7, reached: 1, title: 'x' }])).toEqual([
      { number: 7, reached: 1, title: 'x', dropOffPct: null },
    ]);
    expect(computeDropOff([])).toEqual([]);
  });
});

describe('reachedByChapter', () => {
  it('counts readers whose latest chapter is this one or later', () => {
    const latest = new Map([
      [1, 2],
      [3, 1],
      [5, 4],
    ]);
    expect(reachedByChapter([1, 2, 3, 4, 5], latest)).toEqual([7, 5, 5, 4, 4]);
  });

  it('counts a reader stopped on an unlisted chapter for every listed one before it', () => {
    // Chapter 3 was deleted: its reader still reached 1 and 2, not 4.
    expect(reachedByChapter([1, 2, 4], new Map([[3, 2]]))).toEqual([2, 2, 0]);
    expect(reachedByChapter([1, 2], new Map())).toEqual([0, 0]);
  });
});
