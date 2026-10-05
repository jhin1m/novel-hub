/** Suffix of the stored cover key; `stories.cover_url` always points at the 600px variant. */
const COVER_600_SUFFIX = '-600.webp';

/**
 * URL of a cover variant. Only the 600px URL is stored; the 300px one sits next to it with a
 * different suffix, so the client can build `srcset` without knowing the storage base URL.
 */
export function coverImageUrl(coverUrl: string, width: 300 | 600): string {
  if (width === 600 || !coverUrl.endsWith(COVER_600_SUFFIX)) return coverUrl;
  return `${coverUrl.slice(0, -COVER_600_SUFFIX.length)}-300.webp`;
}
