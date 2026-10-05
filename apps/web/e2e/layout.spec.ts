import { expect, test } from '@playwright/test';

test('home page has a header and footer; guests see sign-in links after hydration', async ({
  page,
}) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Novel Hub');
  await expect(header.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
});

test('unknown path returns 404 and renders the 404 page with a home link', async ({
  page,
  request,
}) => {
  const res = await request.get('/does-not-exist');
  expect(res.status()).toBe(404);

  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
});

test('home page HTML preloads UI and content fonts and sets no cookie', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  expect(res.headers()['set-cookie']).toBeUndefined();

  const html = await res.text();
  const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)].map(([tag]) => tag);
  const fontPreloads = preloads.filter((tag) => tag.includes('as="font"'));
  for (const file of [
    'literata-latin-wght-normal',
    'literata-vietnamese-wght-normal',
    'be-vietnam-pro-latin-400-normal',
    'be-vietnam-pro-vietnamese-400-normal',
  ]) {
    expect(fontPreloads.some((tag) => tag.includes(file))).toBe(true);
  }
  for (const tag of fontPreloads) expect(tag).toContain('crossorigin');
});

test('regular pages do not download the optional reader fonts (Noto Serif, Inter)', async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'font') fonts.push(req.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(fonts.some((url) => url.includes('be-vietnam-pro'))).toBe(true);
  expect(fonts.filter((url) => /noto-serif|inter-/.test(url))).toEqual([]);
});
