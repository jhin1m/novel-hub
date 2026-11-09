import { describe, expect, it } from 'vitest';
import { canViewMatureContent } from './mature-content';

describe('canViewMatureContent', () => {
  it('needs a signed-in viewer who turned 18+ on', () => {
    expect(canViewMatureContent(null)).toBe(false);
    expect(canViewMatureContent({ showMature: false })).toBe(false);
    expect(canViewMatureContent({ showMature: true })).toBe(true);
  });
});
