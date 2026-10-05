/**
 * Handlers of `/robots.txt`, `/sitemap.xml` and the child sitemaps. Plain text bodies built in
 * `core`; the same for every visitor, so the CDN may cache them (no cookie is read or set).
 */
import {
  countSitemap,
  listSitemapChapters,
  listSitemapPages,
  listSitemapStories,
  renderRobots,
  renderSitemapIndex,
  renderUrlset,
} from '@novel-hub/core';
import { z } from 'zod';
import { getInfra } from './infra';

/** An hour at the CDN: a hidden story or banned author leaves the sitemap within that time. */
const SITEMAP_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const ROBOTS_CACHE = 'public, s-maxage=86400';
const NOT_FOUND_CACHE = 'public, s-maxage=60';

/** Sitemap number as written in its URL: `1`, `2`, ... (no sign, leading zero or exponent). */
const sitemapPageSchema = z
  .string()
  .regex(/^[1-9]\d{0,8}$/)
  .transform(Number);

function xml(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': SITEMAP_CACHE },
  });
}

function notFound(): Response {
  return new Response('Not found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NOT_FOUND_CACHE },
  });
}

export async function robotsResponse(): Promise<Response> {
  const { env } = await getInfra();
  return new Response(renderRobots(env.APP_URL, env.NODE_ENV === 'production'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': ROBOTS_CACHE },
  });
}

export async function sitemapIndexResponse(): Promise<Response> {
  const { db, env } = await getInfra();
  const { storyPages, chapterPages } = await countSitemap(db);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  return xml(
    renderSitemapIndex(env.APP_URL, [
      '/sitemap/pages',
      ...range(storyPages).map((page) => `/sitemap/stories/${page}`),
      ...range(chapterPages).map((page) => `/sitemap/chapters/${page}`),
    ]),
  );
}

export async function sitemapPagesResponse(): Promise<Response> {
  const { db, env } = await getInfra();
  return xml(renderUrlset(env.APP_URL, await listSitemapPages(db)));
}

/** `/sitemap/stories/$page` and `/sitemap/chapters/$page`; 404 for a page that does not exist. */
export async function sitemapListResponse(
  kind: 'stories' | 'chapters',
  rawPage: string,
): Promise<Response> {
  const page = sitemapPageSchema.safeParse(rawPage);
  if (!page.success) return notFound();
  const { db, env } = await getInfra();
  const list = kind === 'stories' ? listSitemapStories : listSitemapChapters;
  const entries = await list(db, page.data);
  return entries ? xml(renderUrlset(env.APP_URL, entries)) : notFound();
}
