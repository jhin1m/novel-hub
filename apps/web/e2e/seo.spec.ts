import { canonicalPath } from '@novel-hub/shared';
import { type APIResponse, expect, test } from '@playwright/test';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const SITEMAP_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const run = Date.now().toString(36);
let normal: PublishedStory;
let mature: PublishedStory;

test.beforeAll(async () => {
  normal = await createPublishedStory({ title: `Truyện SEO ${run}`, published: 2 });
  mature = await createPublishedStory({
    title: `Truyện SEO Người Lớn ${run}`,
    isMature: true,
    warningTags: ['noi-dung-18'],
  });
});

const storyPath = (s: PublishedStory) => canonicalPath({ kind: 'story', ...s });

/** The `content` of `<meta name|property="key">` in server-rendered HTML. */
function metaContent(html: string, key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*>`))?.[0];
  return tag?.match(/content="([^"]*)"/)?.[1] ?? null;
}

function canonicalHref(html: string): string | null {
  return html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? null;
}

async function ok(res: APIResponse, url: string): Promise<string> {
  expect(res.status(), url).toBe(200);
  return res.text();
}

test('a story page reached through a stale slug has full meta for its canonical URL', async ({
  request,
  baseURL,
}) => {
  const stale = `/stories/sai-slug-${normal.publicId}`;
  const redirect = await request.get(stale, { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers()['location']).toBe(storyPath(normal));

  const html = await ok(await request.get(stale), stale);
  const canonical = `${baseURL}${storyPath(normal)}`;
  expect(canonicalHref(html)).toBe(canonical);
  expect(metaContent(html, 'og:url')).toBe(canonical);
  expect(metaContent(html, 'og:title')).toContain(normal.title);
  expect(metaContent(html, 'og:type')).toBe('book');
  expect(metaContent(html, 'og:image')).toBe(`${baseURL}/og-default.png`);
  expect(metaContent(html, 'og:site_name')).toBe('Novel Hub');
  expect(metaContent(html, 'og:locale')).toBe('vi_VN');
  expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
  expect(metaContent(html, 'description')).toBeTruthy();
  expect(metaContent(html, 'robots')).toBeNull();
  expect(html).toMatch(/<title>[^<]* · Novel Hub<\/title>/);
});

test('a chapter page has a description built from its story', async ({ request, baseURL }) => {
  const path = normal.chapterPath(2);
  const html = await ok(await request.get(path), path);
  expect(canonicalHref(html)).toBe(`${baseURL}${path}`);
  expect(metaContent(html, 'description')).toBe(`Đọc chương 2 – ${normal.title} của Tác Giả Đọc.`);
  expect(metaContent(html, 'og:type')).toBe('article');
});

test('18+ story and chapter pages are noindex in the meta and the header', async ({ request }) => {
  for (const path of [storyPath(mature), mature.chapterPath(1)]) {
    const res = await request.get(path);
    const html = await ok(res, path);
    expect(res.headers()['x-robots-tag'], path).toBe('noindex');
    expect(metaContent(html, 'robots'), path).toBe('noindex');
    expect(canonicalHref(html), path).toBeNull();
  }
});

test('pages and static pages have canonical links; private ones are noindex', async ({
  request,
  baseURL,
}) => {
  for (const path of ['/', '/terms', '/content-policy', '/tags/tien-hiep']) {
    const html = await ok(await request.get(path), path);
    expect(canonicalHref(html), path).toBe(`${baseURL}${path}`);
    expect(metaContent(html, 'description'), path).toBeTruthy();
    expect(metaContent(html, 'robots'), path).toBeNull();
  }
  for (const path of [
    '/search',
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/write',
    '/library',
  ]) {
    const html = await ok(await request.get(path), path);
    expect(metaContent(html, 'robots'), path).toBe('noindex');
    expect(canonicalHref(html), path).toBeNull();
  }
  const missing = await request.get('/khong-ton-tai');
  expect(missing.status()).toBe(404);
  expect(metaContent(await missing.text(), 'robots')).toBe('noindex');
  const missingStory = await request.get('/stories/khong-co-zzzzzzzz');
  expect(missingStory.status()).toBe(404);
  expect(metaContent(await missingStory.text(), 'robots')).toBe('noindex');
});

test('the sitemap index and child sitemaps list public URLs only', async ({ request, baseURL }) => {
  const index = await request.get('/sitemap.xml');
  expect(index.status()).toBe(200);
  expect(index.headers()['content-type']).toBe('application/xml; charset=utf-8');
  expect(index.headers()['cache-control']).toBe(SITEMAP_CACHE);
  expect(index.headers()['set-cookie']).toBeUndefined();
  const indexXml = await index.text();
  expect(indexXml).toContain(`<loc>${baseURL}/sitemap/pages</loc>`);
  expect(indexXml).toContain(`<loc>${baseURL}/sitemap/stories/1</loc>`);
  expect(indexXml).toContain(`<loc>${baseURL}/sitemap/chapters/1</loc>`);

  // The URLs are the canonical ones, the same the 301s point to.
  const stories = await ok(await request.get('/sitemap/stories/1'), 'stories');
  expect(stories).toContain(`<loc>${baseURL}${storyPath(normal)}</loc>`);
  expect(stories).not.toContain(mature.publicId);
  const chapters = await ok(await request.get('/sitemap/chapters/1'), 'chapters');
  expect(chapters).toContain(`<loc>${baseURL}${normal.chapterPath(2)}</loc>`);
  expect(chapters).not.toContain(mature.publicId);
  const pages = await ok(await request.get('/sitemap/pages'), 'pages');
  expect(pages).toContain(`<loc>${baseURL}/tags/tien-hiep</loc>`);
  expect(pages).toContain(`<loc>${baseURL}/authors/${normal.username}</loc>`);
  expect(pages).not.toContain(`/authors/${mature.username}<`);
  expect(pages).not.toContain('/tags/tu-tien<');

  for (const path of ['/sitemap/stories/0', '/sitemap/stories/abc', '/sitemap/chapters/99999']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test('robots.txt blocks everything outside production', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('text/plain; charset=utf-8');
  expect(await res.text()).toBe('User-agent: *\nDisallow: /\n');
});

test('the default social image is served', async ({ request }) => {
  const res = await request.get('/og-default.png');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the server-rendered head already has the meta tags', async ({ page, baseURL }) => {
    await page.goto(storyPath(normal));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${baseURL}${storyPath(normal)}`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${baseURL}/og-default.png`,
    );
    await expect(page).toHaveTitle(`${normal.title} – Tác Giả Đọc · Novel Hub`);
  });
});
