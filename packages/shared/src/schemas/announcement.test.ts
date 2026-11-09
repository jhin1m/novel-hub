import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_RULES,
  announcementCreateSchema,
  announcementIdParamSchema,
} from './announcement';

describe('announcementCreateSchema', () => {
  it('normalises the plain-text body', () => {
    expect(announcementCreateSchema.parse({ body: '  Tạm nghỉ\r\n\n\n\n\nhết tuần ' })).toEqual({
      body: 'Tạm nghỉ\n\n\nhết tuần',
    });
  });

  it('accepts the maximum length and rejects empty, too long or extra keys', () => {
    const max = 'x'.repeat(ANNOUNCEMENT_RULES.bodyMax);
    expect(announcementCreateSchema.parse({ body: max }).body).toBe(max);
    for (const input of [
      { body: '  \n ' },
      { body: 'x'.repeat(ANNOUNCEMENT_RULES.bodyMax + 1) },
      { body: 'x'.repeat(ANNOUNCEMENT_RULES.bodyMax * 4 + 1) },
      { body: 'ok', storyId: 'x' },
    ]) {
      expect(announcementCreateSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('announcementIdParamSchema', () => {
  it('needs a public id and a uuid', () => {
    const id = '01920000-0000-7000-8000-000000000001';
    expect(announcementIdParamSchema.parse({ publicId: 'k7m2xq9p', id })).toEqual({
      publicId: 'k7m2xq9p',
      id,
    });
    expect(announcementIdParamSchema.safeParse({ publicId: 'k7m2xq9p', id: '1' }).success).toBe(
      false,
    );
    expect(announcementIdParamSchema.safeParse({ publicId: 'O0', id }).success).toBe(false);
  });
});
