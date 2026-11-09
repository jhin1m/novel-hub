import { describe, expect, it } from 'vitest';
import { safeRedirectPath, signInHref, signInSearchSchema } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps internal paths with their query and hash', () => {
    expect(safeRedirectPath('/stories/a-b?x=1#c')).toBe('/stories/a-b?x=1#c');
    expect(safeRedirectPath('/write/stories/abc23456')).toBe('/write/stories/abc23456');
    expect(safeRedirectPath('/')).toBe('/');
  });

  it.each(['//evil.com', '/\\evil.com', '\\\\evil.com', '/\\/evil.com'])(
    'rejects protocol-relative and backslash targets: %s',
    (value) => expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each(['https://evil.com', 'javascript:alert(1)', 'http:/evil.com', 'evil.com'])(
    'rejects absolute and scheme targets: %s',
    (value) => expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each([
    '/.//evil.com',
    '/..//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '/%2E%2E//evil.com',
    '/a/./b',
  ])('rejects dot-segments that normalise into another origin: %s', (value) =>
    expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each(['/%2F%2Fevil.com', '/a%2fb', '/a%5Cb'])(
    'rejects encoded separators, as Better Auth does: %s',
    (value) => expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each(['/a\tb', '/a\nb', ' /a', '/a b', '/a\u0085'])(
    'rejects control characters and whitespace: %j',
    (value) => expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each([undefined, null, 123, '', '/'.padEnd(3000, 'a')])(
    'rejects anything that is not a short string: %j',
    (value) => expect(safeRedirectPath(value)).toBe('/'),
  );

  it.each([
    '/sign-in?redirect=/x',
    '/sign-up',
    '/sign-in/',
    '/SIGN-IN',
    '/api/v1/health',
    '/Api/v1',
    '/api',
  ])('rejects auth pages and the API: %s', (value) => expect(safeRedirectPath(value)).toBe('/'));

  it('accepts paths that only start like a blocked one', () => {
    expect(safeRedirectPath('/sign-instructions')).toBe('/sign-instructions');
    expect(safeRedirectPath('/apis')).toBe('/apis');
  });
});

describe('signInHref', () => {
  it('encodes the redirect and reason so they parse back unchanged', () => {
    const href = signInHref('/stories/a b?x=1&y=2', 'follow');
    const url = new URL(href, 'http://n.invalid');
    expect(url.pathname).toBe('/sign-in');
    expect(url.searchParams.get('redirect')).toBe('/stories/a b?x=1&y=2');
    expect(url.searchParams.get('reason')).toBe('follow');
  });

  it('leaves the reason out when there is none', () => {
    const url = new URL(signInHref('/x'), 'http://n.invalid');
    expect(url.searchParams.get('redirect')).toBe('/x');
    expect(url.searchParams.has('reason')).toBe(false);
  });
});

describe('signInSearchSchema', () => {
  it('drops an unknown reason and a non-string redirect instead of failing', () => {
    expect(signInSearchSchema.parse({ redirect: 5, reason: 'nope' })).toEqual({
      redirect: undefined,
      reason: undefined,
    });
    expect(signInSearchSchema.parse({ redirect: '/x', reason: 'rating' })).toEqual({
      redirect: '/x',
      reason: 'rating',
    });
  });
});

describe('signInSearchSchema reasons', () => {
  it('accepts nominate', () => {
    expect(signInSearchSchema.parse({ redirect: '/x', reason: 'nominate' })).toEqual({
      redirect: '/x',
      reason: 'nominate',
    });
  });
});
