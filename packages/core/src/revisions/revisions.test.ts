import { describe, expect, it } from 'vitest';
import { isPublishedRevision, revisionKey } from './revisions';

describe('revisionKey', () => {
  it('is the epoch milliseconds as a string', () => {
    expect(revisionKey(new Date('2026-10-05T01:02:03.456Z'))).toBe('1791162123456');
  });
});

describe('isPublishedRevision', () => {
  it('marks only the newest revision of a published chapter', () => {
    expect(isPublishedRevision(0, 'published')).toBe(true);
    expect(isPublishedRevision(1, 'published')).toBe(false);
    for (const status of ['draft', 'scheduled', 'hidden_by_mod'] as const) {
      expect(isPublishedRevision(0, status)).toBe(false);
    }
  });
});
