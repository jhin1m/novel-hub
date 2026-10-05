import { m } from '@novel-hub/shared/messages';
import { rootRouteId } from '@tanstack/react-router';
import { metaDescription } from './meta-description';

/** Shared social image for pages without their own (1200×630, in `public/`). */
export const DEFAULT_OG_IMAGE = { path: '/og-default.png', width: 1200, height: 630 };

/** Size of the stored cover (`stories.cover_url` is the 600×900 variant). */
const COVER_IMAGE = { width: 600, height: 900 };

/** What the root loader hands every `head()`: the origin is read from env on the server only. */
export interface SiteConfig {
  appUrl: string;
}

export interface SeoInput {
  /** Site origin (`APP_URL`); without it no absolute URL (canonical, `og:url`, image) is emitted. */
  appUrl?: string;
  /** Canonical path from `canonicalPath()`, never from the request URL. */
  path?: string;
  /** Page title without the site name; omitted on the home page. */
  title?: string;
  description?: string;
  /** Stored 600×900 cover (absolute or root-relative); the default social image when absent. */
  image?: string | null;
  type?: 'website' | 'article' | 'book' | 'profile';
  noindex?: boolean;
}

type HeadMeta =
  { title: string } | { name: string; content: string } | { property: string; content: string };
type HeadLink = { rel: string; href: string };

/** `pathOrUrl` resolved against the site origin; an absolute URL is kept as it is. */
export function absoluteUrl(appUrl: string, pathOrUrl: string): string {
  return new URL(pathOrUrl, appUrl).href;
}

/**
 * `head()` tags of a page: title, description, canonical link, Open Graph, Twitter card and robots.
 * Everything comes from loader data, so the server-rendered head and the hydrated one match.
 * A `noindex` page gets no canonical link (it is not meant to be the indexed copy of anything).
 */
export function seo(input: SeoInput): { meta: HeadMeta[]; links: HeadLink[] } {
  const siteName = m.app_name();
  const title = input.title ? `${input.title} · ${siteName}` : siteName;
  const ogTitle = input.title ?? siteName;
  const meta: HeadMeta[] = [{ title }, { property: 'og:title', content: ogTitle }];
  const links: HeadLink[] = [];

  if (input.description !== undefined) {
    const description = metaDescription(input.description);
    meta.push(
      { name: 'description', content: description },
      { property: 'og:description', content: description },
    );
  }
  meta.push({ property: 'og:type', content: input.type ?? 'website' });
  if (input.noindex) meta.push({ name: 'robots', content: 'noindex' });

  const { appUrl } = input;
  if (appUrl) {
    if (input.path && !input.noindex) {
      const canonical = absoluteUrl(appUrl, input.path);
      links.push({ rel: 'canonical', href: canonical });
      meta.push({ property: 'og:url', content: canonical });
    }
    // Always with its size: the root's default image tags would otherwise outlive a cover.
    const image = input.image ? { ...COVER_IMAGE, path: input.image } : DEFAULT_OG_IMAGE;
    meta.push(
      { property: 'og:image', content: absoluteUrl(appUrl, image.path) },
      { property: 'og:image:width', content: String(image.width) },
      { property: 'og:image:height', content: String(image.height) },
      { name: 'twitter:card', content: input.image ? 'summary' : 'summary_large_image' },
    );
  }
  return { meta, links };
}

/** The root loader's `SiteConfig` from a `head()` context, if it loaded. */
export function siteConfig(
  matches: readonly { routeId: unknown; loaderData?: unknown }[],
): SiteConfig | undefined {
  const data = matches.find((match) => match.routeId === rootRouteId)?.loaderData;
  return isSiteConfig(data) ? data : undefined;
}

function isSiteConfig(value: unknown): value is SiteConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'appUrl' in value &&
    typeof value.appUrl === 'string'
  );
}
