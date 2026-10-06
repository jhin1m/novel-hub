import { describe, expect, it } from 'vitest';
import {
  commentCreateSchema,
  commentIdParamSchema,
  commentListQuerySchema,
  commentRepliesQuerySchema,
  paragraphCountsQuerySchema,
} from './comment';

const id = '01920000-0000-7000-8000-000000000001';
const cursor = `1759708800000000_${id}`;

describe('commentCreateSchema', () => {
  const base = { publicId: 'k7m2xq9p', chapterNumber: 3 };

  it('normalises the body', () => {
    expect(
      commentCreateSchema.parse({ ...base, body: '  Hay quá\r\n\n\n\n\nhóng chương sau ' }),
    ).toMatchObject({ body: 'Hay quá\n\n\nhóng chương sau' });
    expect(commentCreateSchema.parse({ ...base, parentId: id, body: 'ừ' }).parentId).toBe(id);
    expect(
      commentCreateSchema.parse({ ...base, paragraphId: 'ab3k9xq2', body: 'ừ' }),
    ).toMatchObject({ paragraphId: 'ab3k9xq2' });
  });

  it('rejects empty, too long and malformed input', () => {
    for (const body of [
      { ...base, body: '   \n ' },
      { ...base, body: 'x'.repeat(2_001) },
      { ...base, body: 'x'.repeat(8_001) },
      { ...base, body: 'ok', parentId: 'nope' },
      { publicId: 'k7m2xq9p', body: 'ok' },
      { ...base, publicId: 'K7M2XQ9P', body: 'ok' },
      { ...base, body: 'ok', paragraphId: 'AB3K9XQ2' },
      { ...base, body: 'ok', paragraphId: 'ab3k9xq' },
      { ...base, body: 'ok', paragraphId: 'ab3k9xq0' },
      { ...base, body: 'ok', paragraphId: '[data-pid]' },
    ]) {
      expect(commentCreateSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('comment queries', () => {
  it('reads the chapter and an optional cursor', () => {
    expect(commentListQuerySchema.parse({ story: 'k7m2xq9p', chapter: '2' })).toEqual({
      story: 'k7m2xq9p',
      chapter: 2,
      cursor: undefined,
    });
    expect(commentListQuerySchema.parse({ story: 'k7m2xq9p', chapter: '2', cursor }).cursor).toBe(
      cursor,
    );
    expect(commentRepliesQuerySchema.parse({ cursor }).cursor).toBe(cursor);
    expect(
      commentListQuerySchema.parse({ story: 'k7m2xq9p', chapter: '2', paragraph: 'ab3k9xq2' })
        .paragraph,
    ).toBe('ab3k9xq2');
    expect(paragraphCountsQuerySchema.parse({ story: 'k7m2xq9p', chapter: '2' })).toEqual({
      story: 'k7m2xq9p',
      chapter: 2,
    });
  });

  it('rejects broken cursors, chapters and ids', () => {
    for (const query of [
      { story: 'k7m2xq9p', chapter: '0' },
      { story: 'nope', chapter: '1' },
      { story: 'k7m2xq9p', chapter: '1', cursor: 'abc' },
      { story: 'k7m2xq9p', chapter: '1', cursor: `x_${id}` },
      { story: 'k7m2xq9p', chapter: '1', paragraph: 'nope' },
    ]) {
      expect(commentListQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
    expect(commentIdParamSchema.safeParse({ id: 'nope' }).success).toBe(false);
    expect(commentIdParamSchema.safeParse({ id }).success).toBe(true);
  });
});
