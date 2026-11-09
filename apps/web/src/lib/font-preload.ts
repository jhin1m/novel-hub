/**
 * `<link rel="preload">` for a self-hosted font. `crossOrigin` is required even on the same origin:
 * fonts are fetched in anonymous CORS mode, and a preload without it would be downloaded twice.
 */
export function fontPreloadLink(href: string) {
  return {
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href,
    crossOrigin: 'anonymous' as const,
  };
}
