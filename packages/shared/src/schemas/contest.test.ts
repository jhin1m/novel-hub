import { describe, expect, it } from 'vitest';
import {
  contestEntryParamSchema,
  contestInputSchema,
  contestPlacementSchema,
  contestStatus,
} from './contest';

describe('contestStatus', () => {
  const contest = { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z' };

  it('is upcoming before the start, open from the start, ended from the end', () => {
    expect(contestStatus(contest, new Date('2026-09-30T23:59:59Z'))).toBe('upcoming');
    expect(contestStatus(contest, new Date('2026-10-01T00:00:00Z'))).toBe('open');
    expect(contestStatus(contest, new Date('2026-10-30T23:59:59Z'))).toBe('open');
    expect(contestStatus(contest, new Date('2026-10-31T00:00:00Z'))).toBe('ended');
  });

  it('accepts Date values too', () => {
    const dates = { startsAt: new Date(contest.startsAt), endsAt: new Date(contest.endsAt) };
    expect(contestStatus(dates, new Date('2026-10-15T00:00:00Z'))).toBe('open');
  });
});

describe('contestInputSchema', () => {
  const base = {
    title: '  Mùa thu Hà Nội  ',
    description: 'Chủ đề: mùa thu.\r\n\r\nLuật: truyện mới.',
    startsAt: '2026-10-06T08:00:00+07:00',
    endsAt: '2026-11-06T08:00:00+07:00',
  };

  it('trims the title and normalises the description', () => {
    const parsed = contestInputSchema.parse(base);
    expect(parsed.title).toBe('Mùa thu Hà Nội');
    expect(parsed.description).toBe('Chủ đề: mùa thu.\n\nLuật: truyện mới.');
  });

  it('refuses a short title and an empty or too long description', () => {
    expect(contestInputSchema.safeParse({ ...base, title: ' a ' }).success).toBe(false);
    expect(contestInputSchema.safeParse({ ...base, title: 'x'.repeat(151) }).success).toBe(false);
    expect(contestInputSchema.safeParse({ ...base, description: ' \n ' }).success).toBe(false);
    expect(contestInputSchema.safeParse({ ...base, description: 'x'.repeat(5001) }).success).toBe(
      false,
    );
  });

  it('needs the end after the start and at most 180 days later', () => {
    expect(contestInputSchema.safeParse({ ...base, endsAt: base.startsAt }).success).toBe(false);
    expect(
      contestInputSchema.safeParse({ ...base, endsAt: '2027-04-04T08:00:00+07:00' }).success,
    ).toBe(true);
    expect(
      contestInputSchema.safeParse({ ...base, endsAt: '2027-04-05T08:00:00+07:00' }).success,
    ).toBe(false);
  });
});

describe('contestPlacementSchema', () => {
  it('takes places 1 to 3 or null', () => {
    for (const placement of [1, 2, 3, null]) {
      expect(contestPlacementSchema.safeParse({ story: 'k7m2xq9p', placement }).success).toBe(true);
    }
    for (const placement of [0, 4, 1.5, '1']) {
      expect(contestPlacementSchema.safeParse({ story: 'k7m2xq9p', placement }).success).toBe(
        false,
      );
    }
    expect(contestPlacementSchema.safeParse({ story: 'nope', placement: 1 }).success).toBe(false);
  });
});

describe('contestEntryParamSchema', () => {
  it('takes a slug with a duplicate suffix and a public id', () => {
    expect(
      contestEntryParamSchema.safeParse({ slug: 'mua-thu-2', publicId: 'k7m2xq9p' }).success,
    ).toBe(true);
    expect(
      contestEntryParamSchema.safeParse({ slug: 'Mua Thu', publicId: 'k7m2xq9p' }).success,
    ).toBe(false);
  });
});
