import { describe, expect, it } from 'vitest';
import {
  DEGRADED_LIST_CACHE,
  LIST_CACHE,
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

  it('lists expire after 10 minutes, and only loaded lists are cached that way', () => {
    expect(LIST_CACHE['Cache-Control']).toBe('public, s-maxage=600, stale-while-revalidate=3600');
    expect(publicPageHeaders('success', { list: true })).toEqual(LIST_CACHE);
    expect(publicPageHeaders('notFound', { list: true })).toEqual(NOT_FOUND_CACHE);
    expect(publicPageHeaders('error', { list: true })).toEqual(NO_STORE);
  });

  it('a list rendered empty by an outage is cached for a minute only', () => {
    expect(DEGRADED_LIST_CACHE['Cache-Control']).toBe('public, s-maxage=60');
    expect(publicPageHeaders('success', { list: true, degraded: true })).toEqual(
      DEGRADED_LIST_CACHE,
    );
    expect(publicPageHeaders('success', { list: true, degraded: false })).toEqual(LIST_CACHE);
    expect(publicPageHeaders('error', { list: true, degraded: true })).toEqual(NO_STORE);
  });
});
