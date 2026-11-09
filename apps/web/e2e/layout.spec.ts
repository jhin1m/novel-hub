import { expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';

test('home page has a header and footer; guests sign in from the account menu', async ({
  page,
}) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('SayNovel');
  await header.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Đăng nhập' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Đăng ký' })).toBeVisible();
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
    'plus-jakarta-sans-latin-wght-normal',
    'plus-jakarta-sans-vietnamese-wght-normal',
    'source-serif-4-latin-wght-normal',
    'source-serif-4-vietnamese-wght-normal',
  ]) {
    expect(fontPreloads.some((tag) => tag.includes(file))).toBe(true);
  }
  expect(fontPreloads).toHaveLength(4);
  for (const tag of fontPreloads) expect(tag).toContain('crossorigin');
});

test('regular pages do not download the optional reader fonts (Literata, Noto Serif)', async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'font') fonts.push(req.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(fonts.some((url) => url.includes('plus-jakarta-sans'))).toBe(true);
  expect(fonts.filter((url) => /literata|noto-serif/.test(url))).toEqual([]);
});

test('at 768px the signed-in header (explore, rankings, library, write) fits without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await signUpVerified(page);
  await gotoHydrated(page, '/');
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: /^Tài khoản: / })).toBeVisible();
  for (const name of ['Khám phá', 'Bảng xếp hạng', 'Tủ truyện', 'Viết truyện']) {
    await expect(header.getByRole('link', { name, exact: true }), name).toBeVisible();
  }
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const headerBox = await header.boundingBox();
  const lastLink = await header.getByRole('button', { name: /^Tài khoản: / }).boundingBox();
  expect((lastLink?.x ?? Infinity) + (lastLink?.width ?? 0)).toBeLessThanOrEqual(
    (headerBox?.x ?? 0) + (headerBox?.width ?? 0),
  );
});
