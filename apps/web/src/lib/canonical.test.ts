import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { assertCanonical, pathAndQuery } from './canonical';

const CANONICAL = '/stories/kiem-dao-k7m2xq9p/chapter-3';

/** Runs the check; returns the redirect's status, target and cache header, or `null`. */
function check(href: string, pathname = decodeURIComponent(href.split('?')[0] ?? '')) {
  try {
    assertCanonical({ href, pathname }, CANONICAL);
    return null;
  } catch (thrown) {
    if (!isRedirect(thrown)) throw thrown;
    return {
      status: thrown.status,
      location: thrown.options.href,
      cache: thrown.headers.get('cache-control'),
    };
  }
}

describe('assertCanonical', () => {
  it('passes the canonical URL', () => {
    expect(check(CANONICAL)).toBeNull();
  });

  it('a query or a case/encoding change → 301 that is never stored', () => {
    for (const href of [
      `${CANONICAL}?a=1`,
      `${CANONICAL}?utm_source=x`,
      '/Stories/Kiem-Dao-K7M2XQ9P/Chapter-3',
      '/stories/kiem-dao%2Dk7m2xq9p/chapter-3',
      `${CANONICAL}?`,
    ]) {
      expect(check(href)).toEqual({ status: 301, location: CANONICAL, cache: 'no-store' });
    }
  });

  it('a stale slug or a trailing slash → 301 cached for an hour', () => {
    for (const href of [
      '/stories/ten-cu-k7m2xq9p/chapter-3',
      `${CANONICAL}/`,
      '/stories/k7m2xq9p/chapter-3?a=1',
    ]) {
      expect(check(href)).toEqual({
        status: 301,
        location: CANONICAL,
        cache: 'public, s-maxage=3600',
      });
    }
  });
});

describe('pathAndQuery', () => {
  it('keeps the raw path and query, drops origin and hash', () => {
    expect(pathAndQuery('http://localhost:3000/stories/a%2Db/chapter-1?x=1#top')).toBe(
      '/stories/a%2Db/chapter-1?x=1',
    );
    expect(pathAndQuery('https://example.com/x?')).toBe('/x?');
    expect(pathAndQuery('https://example.com')).toBe('/');
  });
});
