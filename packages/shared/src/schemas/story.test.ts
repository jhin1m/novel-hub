import { describe, expect, it } from 'vitest';
import { storyCreateSchema, storyStatusSchema, storyUpdateSchema, tagSlugSchema } from './story';

describe('storyCreateSchema', () => {
  it('fills defaults and normalizes the title', () => {
    const decomposed = 'Kiếm Đạo'; // "Kiếm" typed with a combining acute accent
    const parsed = storyCreateSchema.parse({ title: `  ${decomposed}  `, mainTag: 'tien-hiep' });
    expect(parsed).toEqual({
      title: 'Kiếm Đạo',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    expect(parsed.title).toBe('Kiếm Đạo'.normalize('NFC'));
  });

  it('enforces title and synopsis length after trimming', () => {
    expect(storyCreateSchema.safeParse({ title: ' a ', mainTag: 'x' }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ title: 'a'.repeat(151), mainTag: 'x' }).success).toBe(
      false,
    );
    expect(storyCreateSchema.safeParse({ title: 'ab', mainTag: 'x' }).success).toBe(true);
    expect(
      storyCreateSchema.safeParse({ title: 'ab', mainTag: 'x', synopsis: 's'.repeat(3_001) })
        .success,
    ).toBe(false);
  });

  it('rejects malformed tag slugs and oversized tag lists', () => {
    expect(storyCreateSchema.safeParse({ title: 'ab', mainTag: 'Tiên hiệp' }).success).toBe(false);
    const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(storyCreateSchema.safeParse({ title: 'ab', mainTag: 'x', tags }).success).toBe(false);
  });
});

describe('storyUpdateSchema', () => {
  it('does not fill defaults for absent fields', () => {
    expect(storyUpdateSchema.parse({ title: 'Tên mới' })).toEqual({ title: 'Tên mới' });
    expect(storyUpdateSchema.parse({ isMature: false })).toEqual({ isMature: false });
  });

  it('requires at least one field', () => {
    expect(storyUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('requires mainTag and tags together', () => {
    expect(storyUpdateSchema.safeParse({ tags: ['he-thong'] }).success).toBe(false);
    expect(storyUpdateSchema.safeParse({ mainTag: 'do-thi' }).success).toBe(false);
    expect(storyUpdateSchema.safeParse({ mainTag: 'do-thi', tags: [] }).success).toBe(true);
  });

  it('accepts a status change', () => {
    expect(storyUpdateSchema.parse({ status: 'completed' })).toEqual({ status: 'completed' });
    expect(storyUpdateSchema.safeParse({ status: 'draft' }).success).toBe(false);
  });
});

describe('tagSlugSchema / storyStatusSchema', () => {
  it('accept the expected values', () => {
    expect(tagSlugSchema.safeParse('tien-hiep').success).toBe(true);
    expect(tagSlugSchema.safeParse('-x').success).toBe(false);
    expect(storyStatusSchema.options).toEqual(['ongoing', 'completed', 'hiatus']);
  });
});
