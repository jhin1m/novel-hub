import { describe, expect, it } from 'vitest';
import { absoluteUrl, seo, siteConfig } from './seo';

const APP_URL = 'https://novelhub.example';

/** `content` of the meta tag with this `name` or `property`. */
function metaContent(meta: ReturnType<typeof seo>['meta'], key: string): string | undefined {
  for (const tag of meta) {
    if (
      'content' in tag &&
      (('name' in tag && tag.name === key) || ('property' in tag && tag.property === key))
    )
      return tag.content;
  }
  return undefined;
}

describe('seo', () => {
  it('builds an absolute canonical link and uses it as og:url', () => {
    const { meta, links } = seo({
      appUrl: APP_URL,
      path: '/stories/kiem-dao-k7m2xq9p',
      title: 'Kiếm Đạo – Lâm Phong',
      description: 'Giới thiệu.',
      type: 'book',
    });
    expect(links).toEqual([{ rel: 'canonical', href: `${APP_URL}/stories/kiem-dao-k7m2xq9p` }]);
    expect(metaContent(meta, 'og:url')).toBe(`${APP_URL}/stories/kiem-dao-k7m2xq9p`);
    expect(meta).toContainEqual({ title: 'Kiếm Đạo – Lâm Phong · Novel Hub' });
    expect(metaContent(meta, 'og:title')).toBe('Kiếm Đạo – Lâm Phong');
    expect(metaContent(meta, 'og:type')).toBe('book');
    expect(metaContent(meta, 'description')).toBe('Giới thiệu.');
    expect(metaContent(meta, 'og:description')).toBe('Giới thiệu.');
    expect(metaContent(meta, 'robots')).toBeUndefined();
  });

  it('keeps the query of a paged tag page in the canonical URL', () => {
    const { links } = seo({ appUrl: APP_URL, path: '/tags/tien-hiep?page=2', title: 'Tiên hiệp' });
    expect(links[0]?.href).toBe(`${APP_URL}/tags/tien-hiep?page=2`);
  });

  it('titles the home page with the site name only', () => {
    const { meta } = seo({ appUrl: APP_URL, path: '/' });
    expect(meta).toContainEqual({ title: 'Novel Hub' });
    expect(metaContent(meta, 'og:title')).toBe('Novel Hub');
  });

  it('drops the canonical link and og:url on a noindex page', () => {
    const { meta, links } = seo({ appUrl: APP_URL, path: '/stories/x-k7m2xq9p', noindex: true });
    expect(links).toEqual([]);
    expect(metaContent(meta, 'og:url')).toBeUndefined();
    expect(metaContent(meta, 'robots')).toBe('noindex');
  });

  it('uses the cover as a summary card, else the default image as a large card', () => {
    const cover = seo({ appUrl: APP_URL, path: '/', image: 'https://cdn.example/c-600.webp' });
    expect(metaContent(cover.meta, 'og:image')).toBe('https://cdn.example/c-600.webp');
    expect(metaContent(cover.meta, 'og:image:width')).toBe('600');
    expect(metaContent(cover.meta, 'og:image:height')).toBe('900');
    expect(metaContent(cover.meta, 'twitter:card')).toBe('summary');

    const plain = seo({ appUrl: APP_URL, path: '/', image: null });
    expect(metaContent(plain.meta, 'og:image')).toBe(`${APP_URL}/og-default.png`);
    expect(metaContent(plain.meta, 'og:image:width')).toBe('1200');
    expect(metaContent(plain.meta, 'twitter:card')).toBe('summary_large_image');
  });

  it('emits no absolute URL without the site origin', () => {
    const { meta, links } = seo({ path: '/', title: 'Tìm kiếm', noindex: true });
    expect(links).toEqual([]);
    expect(metaContent(meta, 'og:image')).toBeUndefined();
  });

  it('collapses whitespace and cuts long descriptions to 160 characters, keeping quotes as text', () => {
    const long = `Dòng "một" <b>\n${'chữ '.repeat(80)}`;
    const description = metaContent(seo({ description: long }).meta, 'description') ?? '';
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.startsWith('Dòng "một" <b> chữ')).toBe(true);
    expect(description).not.toMatch(/\n/);
  });

  it('never cuts a description in the middle of a surrogate pair', () => {
    const description = metaContent(seo({ description: '😀'.repeat(100) }).meta, 'description');
    expect(description).toBeDefined();
    expect(description).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('absoluteUrl', () => {
  it('resolves a path against the origin and keeps an absolute URL', () => {
    expect(absoluteUrl(APP_URL, '/og-default.png')).toBe(`${APP_URL}/og-default.png`);
    expect(absoluteUrl(APP_URL, 'https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp');
  });
});

describe('siteConfig', () => {
  it('reads the root loader data from the head matches', () => {
    const matches = [
      { routeId: '__root__', loaderData: { appUrl: APP_URL } },
      { routeId: '/', loaderData: {} },
    ];
    expect(siteConfig(matches)).toEqual({ appUrl: APP_URL });
    expect(siteConfig([{ routeId: '__root__' }])).toBeUndefined();
  });
});
