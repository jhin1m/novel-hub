import type { RankingPeriod } from './rankings';
import { storyKey } from './story-key';

/** Every public page that has one canonical URL. */
export type CanonicalTarget =
  | { kind: 'home' }
  | { kind: 'story'; slug: string; publicId: string }
  | { kind: 'chapter'; slug: string; publicId: string; number: number }
  | { kind: 'author'; username: string }
  | { kind: 'tag'; slug: string; page?: number }
  | { kind: 'ranking'; period: RankingPeriod }
  | { kind: 'contests' }
  | { kind: 'contest'; slug: string; page?: number }
  | { kind: 'static'; path: '/terms' | '/content-policy' };

/**
 * The single builder of canonical public URLs (relative path, lowercase, no trailing slash).
 * Redirect targets, CDN purge lists, canonical links and the sitemap all go through it, so they can
 * never disagree about which URL holds the cached content.
 */
export function canonicalPath(target: CanonicalTarget): string {
  switch (target.kind) {
    case 'home':
      return '/';
    case 'story':
      return `/stories/${storyKey(target)}`;
    case 'chapter':
      return `/stories/${storyKey(target)}/chapter-${target.number}`;
    case 'author':
      return `/authors/${target.username}`;
    case 'tag':
      return target.page !== undefined && target.page > 1
        ? `/tags/${target.slug}?page=${target.page}`
        : `/tags/${target.slug}`;
    case 'ranking':
      return `/rankings/${target.period}`;
    case 'contests':
      return '/contests';
    case 'contest':
      return target.page !== undefined && target.page > 1
        ? `/contests/${target.slug}?page=${target.page}`
        : `/contests/${target.slug}`;
    case 'static':
      return target.path;
  }
}
