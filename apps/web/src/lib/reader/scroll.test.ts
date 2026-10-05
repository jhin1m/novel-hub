import { describe, expect, it } from 'vitest';
import { computeScrollPct } from './scroll';

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
