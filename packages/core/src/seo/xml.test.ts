import { describe, expect, it } from 'vitest';
import { escapeXml, renderRobots, renderSitemapIndex, renderUrlset } from './xml';

const APP_URL = 'https://novelhub.example';

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });
});

describe('renderUrlset', () => {
  it('writes absolute, escaped URLs with UTC lastmod', () => {
    const xml = renderUrlset(APP_URL, [
      { path: '/tags/tien-hiep?page=2&x=1', lastmod: null },
      { path: '/stories/kiem-dao-k7m2xq9p', lastmod: new Date('2026-10-05T18:30:00+07:00') },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset')).toBe(true);
    expect(xml).toContain(
      '<url><loc>https://novelhub.example/tags/tien-hiep?page=2&amp;x=1</loc></url>',
    );
    expect(xml).toContain(
      '<url><loc>https://novelhub.example/stories/kiem-dao-k7m2xq9p</loc><lastmod>2026-10-05T11:30:00.000Z</lastmod></url>',
    );
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('writes an empty but valid urlset', () => {
    expect(renderUrlset(APP_URL, [])).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>',
    );
  });
});

describe('renderSitemapIndex', () => {
  it('lists every child sitemap', () => {
    const xml = renderSitemapIndex(APP_URL, ['/sitemap/pages', '/sitemap/stories/1']);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<sitemap>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<sitemap><loc>https://novelhub.example/sitemap/stories/1</loc></sitemap>',
    );
  });
});

describe('renderRobots', () => {
  it('points crawlers at the sitemap when indexing is allowed and blocks private areas', () => {
    const robots = renderRobots(APP_URL, true);
    expect(robots).toContain('Disallow: /api/\n');
    expect(robots).toContain('Disallow: /write\n');
    expect(robots).toContain('Disallow: /moderation\n');
    expect(robots).toContain('Sitemap: https://novelhub.example/sitemap.xml\n');
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  it('blocks everything when indexing is not allowed', () => {
    expect(renderRobots(APP_URL, false)).toBe('User-agent: *\nDisallow: /\n');
  });
});
