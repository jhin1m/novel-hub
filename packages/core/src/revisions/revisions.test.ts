import { describe, expect, it } from 'vitest';
import { publishedRevisionIndex, revisionKey } from './revisions';

describe('revisionKey', () => {
  it('is the epoch milliseconds as a string', () => {
    expect(revisionKey(new Date('2026-10-05T01:02:03.456Z'))).toBe('1791162123456');
  });
});

describe('publishedRevisionIndex', () => {
  it('picks the newest revision matching the stored content of a published chapter', () => {
    expect(publishedRevisionIndex([true, false, true], 'published')).toBe(0);
    // A restore snapshot sits above the published revision.
    expect(publishedRevisionIndex([false, true, false], 'published')).toBe(1);
    expect(publishedRevisionIndex([false, false], 'published')).toBe(-1);
    for (const status of ['draft', 'scheduled', 'hidden_by_mod'] as const) {
      expect(publishedRevisionIndex([true], status)).toBe(-1);
    }
  });
});
