import { describe, expect, it } from 'vitest';
import { featuredSlotCreateSchema, parseStoryRef } from './featured';

describe('parseStoryRef', () => {
  it('reads the public id from an id, a key, a path or a link', () => {
    for (const raw of [
      'k7m2xq9p',
      '  k7m2xq9p ',
      'kiem-dao-doc-ton-k7m2xq9p',
      '/stories/kiem-dao-doc-ton-k7m2xq9p',
      'https://example.com/stories/kiem-dao-doc-ton-k7m2xq9p',
      'https://example.com/stories/kiem-dao-doc-ton-k7m2xq9p/chapter-3?x=1#top',
    ]) {
      expect(parseStoryRef(raw)).toBe('k7m2xq9p');
    }
  });

  it('returns null when no public id can be read', () => {
    for (const raw of ['', 'hello', 'https://example.com/', '/authors/lam_phong', 'k7m2xq9o']) {
      expect(parseStoryRef(raw)).toBeNull();
    }
  });
});

describe('featuredSlotCreateSchema', () => {
  const base = {
    story: 'https://example.com/stories/kiem-dao-k7m2xq9p',
    startsAt: '2026-10-06T08:00:00+07:00',
    endsAt: '2026-10-13T08:00:00+07:00',
  };

  it('accepts a link and outputs the public id', () => {
    expect(featuredSlotCreateSchema.parse(base)).toEqual({ ...base, story: 'k7m2xq9p' });
  });

  it('rejects an unreadable story', () => {
    expect(featuredSlotCreateSchema.safeParse({ ...base, story: 'nope' }).success).toBe(false);
  });

  it('rejects an end at or before the start', () => {
    for (const endsAt of [base.startsAt, '2026-10-06T00:59:00Z']) {
      expect(featuredSlotCreateSchema.safeParse({ ...base, endsAt }).success).toBe(false);
    }
  });

  it('accepts 90 days and rejects more', () => {
    expect(
      featuredSlotCreateSchema.safeParse({ ...base, endsAt: '2027-01-04T08:00:00+07:00' }).success,
    ).toBe(true);
    expect(
      featuredSlotCreateSchema.safeParse({ ...base, endsAt: '2027-01-04T08:01:00+07:00' }).success,
    ).toBe(false);
  });

  it('requires timestamps with an offset', () => {
    expect(
      featuredSlotCreateSchema.safeParse({ ...base, startsAt: '2026-10-06T08:00' }).success,
    ).toBe(false);
  });
});
