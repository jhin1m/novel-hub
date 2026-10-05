import { describe, expect, it } from 'vitest';
import {
  historyCursorSchema,
  libraryListQuery,
  libraryTabSchema,
  publicIdParamSchema,
  setShelfInput,
} from './library';

describe('libraryListQuery', () => {
  it('needs a known shelf and coerces the page', () => {
    expect(libraryListQuery.parse({ shelf: 'plan', page: '3' })).toEqual({
      shelf: 'plan',
      page: 3,
    });
    expect(libraryListQuery.safeParse({ shelf: 'history' }).success).toBe(false);
    expect(libraryListQuery.safeParse({}).success).toBe(false);
  });

  it('falls back to the first page for anything else', () => {
    for (const page of [undefined, '0', 'abc', '501', '1.5']) {
      expect(libraryListQuery.parse({ shelf: 'reading', page }).page, String(page)).toBe(1);
    }
  });
});

describe('setShelfInput', () => {
  it('accepts the four shelves only', () => {
    expect(setShelfInput.parse({ shelf: 'dropped' })).toEqual({ shelf: 'dropped' });
    expect(setShelfInput.safeParse({ shelf: 'history' }).success).toBe(false);
  });
});

describe('historyCursorSchema', () => {
  it('accepts `${micros}_${publicId}` or nothing', () => {
    const cursor = '1791158400123456_k7m2xq9p';
    expect(historyCursorSchema.parse(cursor)).toBe(cursor);
    expect(historyCursorSchema.parse(undefined)).toBeUndefined();
    for (const bad of [
      '',
      '_k7m2xq9p',
      '123456789012345678_k7m2xq9p',
      '1791158400123456-k7m2xq9p',
      '1791158400123456_K7M2XQ9P',
    ]) {
      expect(historyCursorSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('publicIdParamSchema', () => {
  it('only accepts well-formed public ids', () => {
    expect(publicIdParamSchema.safeParse({ publicId: 'k7m2xq9p' }).success).toBe(true);
    expect(publicIdParamSchema.safeParse({ publicId: 'k7m2xq9o' }).success).toBe(false);
    expect(publicIdParamSchema.safeParse({ publicId: 'short' }).success).toBe(false);
  });
});

describe('libraryTabSchema', () => {
  it('is the shelves plus the history', () => {
    expect(libraryTabSchema.options).toEqual(['reading', 'plan', 'done', 'dropped', 'history']);
  });
});
