/**
 * Response headers for public HTML. Set on leaf routes only (`headers` route option): Start merges
 * the headers of every matched route, so a value on a parent would leak into its children.
 */

/** Public pages: cached by the CDN for a day, purged when their content changes. */
export const PUBLIC_CACHE: Record<string, string> = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
};

/**
 * Lists (home, tag and author pages): purged when a story on them changes, but later tag pages
 * are not, so they expire sooner. Shorter stale window than chapters, so a story hidden by a
 * moderator leaves every list within about an hour.
 */
export const LIST_CACHE: Record<string, string> = {
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
};

/** Missing or unreadable pages: cached briefly, so content that comes back shows up soon. */
export const NOT_FOUND_CACHE: Record<string, string> = {
  'Cache-Control': 'public, s-maxage=60',
};

/** Redirects from a stale slug: their cache key never holds content, so purging can ignore them. */
export const REDIRECT_CACHE: Record<string, string> = {
  'Cache-Control': 'public, s-maxage=3600',
};

/** Responses that must not be stored anywhere. */
export const NO_STORE: Record<string, string> = { 'Cache-Control': 'no-store' };

/** Tells crawlers to skip the page; 18+ stories are never indexed. */
export const NOINDEX: Record<string, string> = { 'X-Robots-Tag': 'noindex' };

/**
 * Headers for a public page from its route match. Only a loaded page is cached for long and only a
 * real 404 briefly; anything else (a loader error answers 500) is never stored, so an outage does
 * not stay in the CDN after recovery.
 */
export function publicPageHeaders(
  status: 'pending' | 'success' | 'error' | 'notFound',
  opts: { noindex?: boolean; list?: boolean } = {},
): Record<string, string> {
  if (status === 'notFound') return NOT_FOUND_CACHE;
  if (status !== 'success') return NO_STORE;
  const cache = opts.list ? LIST_CACHE : PUBLIC_CACHE;
  return opts.noindex ? { ...cache, ...NOINDEX } : cache;
}
