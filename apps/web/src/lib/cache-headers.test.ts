import { describe, expect, it } from 'vitest';
import {
  NOT_FOUND_CACHE,
  NO_STORE,
  PUBLIC_CACHE,
  REDIRECT_CACHE,
  publicPageHeaders,
} from './cache-headers';

describe('cache headers', () => {
  it('public pages are cached a day at the CDN with an hour of stale-while-revalidate', () => {
    expect(PUBLIC_CACHE['Cache-Control']).toBe(
      'public, s-maxage=86400, stale-while-revalidate=3600',
    );
  });

  it('404s and redirects are cached briefly; no-store stays out of every cache', () => {
    expect(NOT_FOUND_CACHE['Cache-Control']).toBe('public, s-maxage=60');
    expect(REDIRECT_CACHE['Cache-Control']).toBe('public, s-maxage=3600');
    expect(NO_STORE['Cache-Control']).toBe('no-store');
  });
});

describe('publicPageHeaders', () => {
  it('caches loaded pages, briefly caches 404s and never stores errors', () => {
    expect(publicPageHeaders('success')).toEqual(PUBLIC_CACHE);
    expect(publicPageHeaders('success', { noindex: true })).toEqual({
      ...PUBLIC_CACHE,
      'X-Robots-Tag': 'noindex',
    });
    expect(publicPageHeaders('notFound')).toEqual(NOT_FOUND_CACHE);
    expect(publicPageHeaders('error')).toEqual(NO_STORE);
    expect(publicPageHeaders('pending')).toEqual(NO_STORE);
  });
});
