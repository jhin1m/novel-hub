import { redirect } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { NO_STORE, REDIRECT_CACHE } from './cache-headers';

/** Strips the origin and the hash from an absolute URL, keeping path and query untouched. */
export function pathAndQuery(url: string): string {
  const pathStart = url.indexOf('/', url.indexOf('//') + 2);
  const path = pathStart === -1 ? '/' : url.slice(pathStart);
  return path.split('#')[0] ?? path;
}

/** Path and query of the document request on the server; `null` in the browser. */
const serverRequestHref = createIsomorphicFn()
  .server((): string | null => pathAndQuery(getRequest().url))
  .client((): string | null => null);

/** The request as the check needs it. */
export interface RequestLocation {
  /** Path and query as requested, not normalized. */
  href: string;
  /** Decoded path (router `location.pathname`). */
  pathname: string;
}

/**
 * The location a loader checks. The router location is normalized (percent-decoded, empty `?`
 * dropped), so on the server the raw request URL is used, which the CDN keys on. In the browser a
 * loader only runs for client-side loads, where the router location is the one being loaded.
 */
export function requestLocation(location: { href: string; pathname: string }): RequestLocation {
  return {
    href: serverRequestHref() ?? location.href.split('#')[0] ?? location.href,
    pathname: location.pathname,
  };
}

/**
 * Throws a 301 to `canonical` (from `canonicalPath`) unless the request is exactly that URL.
 * Cached content may only live under the canonical URL, because purges only touch that one.
 *
 * - A path that differs even after decoding and lowercasing (stale slug, trailing slash) is another
 *   cache key for good, so the redirect may be cached.
 * - A path that differs only in case or percent-encoding, or only by a query, answers `no-store`:
 *   the redirect then never depends on how the CDN builds its cache key.
 */
export function assertCanonical(location: RequestLocation, canonical: string): void {
  if (location.href === canonical) return;
  const canonicalPathname = canonical.split('?')[0] ?? canonical;
  const sameKeyIgnoringCase = location.pathname.toLowerCase() === canonicalPathname;
  // `throw: true` makes the router throw its redirect `Response` itself.
  redirect({
    href: canonical,
    statusCode: 301,
    headers: sameKeyIgnoringCase ? NO_STORE : REDIRECT_CACHE,
    throw: true,
  });
}
