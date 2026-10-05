import { describe, expect, it } from 'vitest';
import { computeScrollPct, scrollYForPct } from './scroll';

const at = (scrollY: number) =>
  computeScrollPct({ scrollY, viewportHeight: 800, top: 200, height: 3000 });

describe('computeScrollPct', () => {
  it('measures the share of the text above the bottom of the screen', () => {
    expect(at(0)).toBe(20);
    expect(at(1100)).toBe(56.7);
    expect(at(2400)).toBe(100);
  });

  it('stays within 0–100', () => {
    expect(computeScrollPct({ scrollY: 0, viewportHeight: 100, top: 500, height: 1000 })).toBe(0);
    expect(at(9000)).toBe(100);
  });

  it('is 0 for an empty element', () => {
    expect(computeScrollPct({ scrollY: 0, viewportHeight: 800, top: 0, height: 0 })).toBe(0);
  });
});

describe('scrollYForPct', () => {
  const geometry = { viewportHeight: 800, top: 200, height: 3000 };

  it('is the inverse of computeScrollPct', () => {
    for (const scrollY of [0, 100, 1100, 2399.5]) {
      const pct = computeScrollPct({ ...geometry, scrollY });
      expect(scrollYForPct(geometry, pct)).toBeCloseTo(scrollY, -1);
    }
    for (const pct of [20, 35.5, 56.7, 100]) {
      expect(computeScrollPct({ ...geometry, scrollY: scrollYForPct(geometry, pct) })).toBe(pct);
    }
  });

  it('stays at the top for positions on the first screen', () => {
    expect(scrollYForPct(geometry, 0)).toBe(0);
    expect(scrollYForPct(geometry, 10)).toBe(0);
  });
});
