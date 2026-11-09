import { describe, expect, it } from 'vitest';
import { accountInitial, initialCssValue, parseAccountHint } from './account-hint';

describe('accountInitial', () => {
  it('upper-cases the first letter, Vietnamese included', () => {
    expect(accountInitial('đêm trắng')).toBe('Đ');
  });

  it('keeps a character made of two UTF-16 units whole', () => {
    expect(accountInitial('😀 reader')).toBe('😀');
  });

  it('is empty for an empty name', () => {
    expect(accountInitial('')).toBe('');
  });
});

describe('initialCssValue', () => {
  it('writes the code point as a CSS hex escape', () => {
    expect(initialCssValue(0x110)).toBe('"\\110 "');
  });
});

describe('parseAccountHint', () => {
  it('reads a stored hint', () => {
    expect(parseAccountHint('{"initial":272,"continueRows":1}')).toEqual({
      initial: 272,
      continueRows: 1,
    });
  });

  it('zeroes fields out of range instead of dropping the hint', () => {
    expect(parseAccountHint('{"initial":"x","continueRows":9}')).toEqual({
      initial: 0,
      continueRows: 0,
    });
  });

  it.each([null, '', '{broken', '[1]', '42', 'null'])('%s is no hint', (raw) => {
    expect(parseAccountHint(raw)).toBeNull();
  });
});
