/** Text bodies of `/sitemap.xml`, its child sitemaps and `/robots.txt` (sitemaps.org protocol). */

/** One URL of a sitemap: a canonical path (`canonicalPath`) and when its content last changed. */
export interface SitemapEntry {
  path: string;
  lastmod: Date | null;
}

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch] ?? ch);
}

/** Absolute URL of a canonical path, as a sitemap needs (the origin comes from `APP_URL`). */
function locOf(appUrl: string, path: string): string {
  return `<loc>${escapeXml(new URL(path, appUrl).href)}</loc>`;
}

/** W3C datetime in UTC, e.g. `2026-10-05T11:22:33.000Z`. */
function lastmodOf(date: Date | null): string {
  return date ? `<lastmod>${date.toISOString()}</lastmod>` : '';
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export function renderUrlset(appUrl: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.map((e) => `<url>${locOf(appUrl, e.path)}${lastmodOf(e.lastmod)}</url>\n`);
  return `${XML_HEAD}<urlset xmlns="${SITEMAP_NS}">\n${urls.join('')}</urlset>\n`;
}

/** The sitemap index listing child sitemaps by path (`/sitemap/stories/1`, ...). */
export function renderSitemapIndex(appUrl: string, paths: readonly string[]): string {
  const items = paths.map((path) => `<sitemap>${locOf(appUrl, path)}</sitemap>\n`);
  return `${XML_HEAD}<sitemapindex xmlns="${SITEMAP_NS}">\n${items.join('')}</sitemapindex>\n`;
}

/**
 * `robots.txt`. Unless indexing is allowed (`ALLOW_INDEXING`, the real production site only)
 * everything is off limits, so a staging copy never competes with the real site. When allowed only
 * areas that are never public are blocked: a page that must stay out of search results says so
 * with `noindex`, which crawlers only see when they may fetch it.
 */
export function renderRobots(appUrl: string, allowIndexing: boolean): string {
  if (!allowIndexing) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /write',
    'Disallow: /moderation',
    '',
    `Sitemap: ${new URL('/sitemap.xml', appUrl).href}`,
    '',
  ].join('\n');
}
