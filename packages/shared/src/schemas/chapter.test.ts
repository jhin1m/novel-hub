import { describe, expect, it } from 'vitest';
import {
  chapterMetaSchema,
  chapterNumberParamSchema,
  draftSaveSchema,
  publishChapterSchema,
  scheduleChapterSchema,
} from './chapter';

describe('chapterNumberParamSchema', () => {
  it('coerces a positive integer chapter number', () => {
    expect(chapterNumberParamSchema.parse({ publicId: 'k7m2xq9p', number: '3' })).toEqual({
      publicId: 'k7m2xq9p',
      number: 3,
    });
    for (const number of ['0', '-1', '1.5', 'abc']) {
      expect(chapterNumberParamSchema.safeParse({ publicId: 'x', number }).success).toBe(false);
    }
  });
});

describe('draftSaveSchema', () => {
  it('needs a doc object and an ISO timestamp', () => {
    const baseUpdatedAt = new Date().toISOString();
    expect(
      draftSaveSchema.safeParse({ doc: { type: 'doc', content: [] }, baseUpdatedAt }).success,
    ).toBe(true);
    expect(
      draftSaveSchema.safeParse({ doc: { type: 'doc', content: 'x' }, baseUpdatedAt }).success,
    ).toBe(false);
    expect(draftSaveSchema.safeParse({ doc: { type: 'paragraph' }, baseUpdatedAt }).success).toBe(
      false,
    );
    expect(
      draftSaveSchema.safeParse({ doc: { type: 'doc' }, baseUpdatedAt: 'yesterday' }).success,
    ).toBe(false);
  });
});

describe('chapterMetaSchema', () => {
  it('trims, normalizes and turns empty text into null', () => {
    expect(chapterMetaSchema.parse({ title: '  Chương một  ', authorNote: '   ' })).toEqual({
      title: 'Chương một',
      authorNote: null,
    });
    expect(chapterMetaSchema.parse({ title: null })).toEqual({ title: null });
  });

  it('enforces lengths and needs at least one field', () => {
    expect(chapterMetaSchema.safeParse({ title: 'a'.repeat(151) }).success).toBe(false);
    expect(chapterMetaSchema.safeParse({ authorNote: 'a'.repeat(1_001) }).success).toBe(false);
    expect(chapterMetaSchema.safeParse({}).success).toBe(false);
  });
});

describe('publishChapterSchema and scheduleChapterSchema', () => {
  const baseUpdatedAt = '2026-10-05T04:05:06.123Z';

  it('needs the draft version, and a schedule time with an offset', () => {
    expect(publishChapterSchema.safeParse({ baseUpdatedAt }).success).toBe(true);
    expect(publishChapterSchema.safeParse({}).success).toBe(false);
    for (const scheduledAt of ['2026-10-06T08:00:00+07:00', '2026-10-06T01:00:00.000Z']) {
      expect(scheduleChapterSchema.safeParse({ baseUpdatedAt, scheduledAt }).success).toBe(true);
    }
    for (const scheduledAt of ['2026-10-06T08:00', 'tomorrow']) {
      expect(scheduleChapterSchema.safeParse({ baseUpdatedAt, scheduledAt }).success).toBe(false);
    }
  });
});
