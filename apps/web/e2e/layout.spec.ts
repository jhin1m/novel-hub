import { createTestDb } from '@novel-hub/db/testing';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

test('home page has a header and footer; guests get sign-in and sign-up links', async ({
  page,
}) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('SayNovel');
  await expect(header.getByRole('link', { name: 'SayNovel', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Đăng ký', exact: true })).toHaveAttribute(
    'href',
    '/sign-up',
  );
});

test('home page HTML does not depend on the session: no cookie, no account name', async ({
  page,
}) => {
  const { email } = await signUp(page);
  const name = `Tên Riêng ${Date.now().toString(36)}`;
  const { pool } = createTestDb();
  try {
    await pool.query('update users set display_name = $1 where email = $2', [name, email]);
  } finally {
    await pool.end();
  }

  const res = await page.request.get('/');
  expect(res.headers()['set-cookie']).toBeUndefined();
  const html = await res.text();
  expect(html).not.toContain(name);
  expect(html).not.toContain(email);
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

function fontPreloads(html: string): string[] {
  return [...html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('as="font"'));
}

test('home page HTML preloads only the UI font and sets no cookie', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  expect(res.headers()['set-cookie']).toBeUndefined();

  const preloads = fontPreloads(await res.text());
  for (const file of [
    'be-vietnam-pro-latin-400-normal',
    'be-vietnam-pro-vietnamese-400-normal',
    'be-vietnam-pro-latin-700-normal',
    'be-vietnam-pro-vietnamese-700-normal',
  ]) {
    expect(preloads.some((tag) => tag.includes(file))).toBe(true);
  }
  expect(preloads).toHaveLength(4);
  for (const tag of preloads) expect(tag).toContain('crossorigin');
  expect(preloads.filter((tag) => tag.includes('source-serif-4'))).toEqual([]);
});

test('the reading page also preloads the content font', async ({ request }) => {
  const story = await createPublishedStory({ published: 1 });
  const res = await request.get(story.chapterPath(1));
  expect(res.status()).toBe(200);

  const preloads = fontPreloads(await res.text());
  for (const file of [
    'source-serif-4-latin-wght-normal',
    'source-serif-4-vietnamese-wght-normal',
  ]) {
    const tag = preloads.find((candidate) => candidate.includes(file));
    expect(tag, file).toContain('crossorigin');
  }
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

  expect(fonts.some((url) => url.includes('be-vietnam-pro'))).toBe(true);
  expect(fonts.filter((url) => /literata|noto-serif/.test(url))).toEqual([]);
});

async function expectHeaderFits(page: Page, lastItem: Locator) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const headerBox = await page.getByRole('banner').boundingBox();
  const lastBox = await lastItem.boundingBox();
  expect((lastBox?.x ?? Infinity) + (lastBox?.width ?? 0)).toBeLessThanOrEqual(
    (headerBox?.x ?? 0) + (headerBox?.width ?? 0),
  );
}

for (const width of [768, 1280]) {
  test(`at ${width}px the guest and signed-in headers fit without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHydrated(page, '/');
    const header = page.getByRole('banner');
    for (const name of ['Khám phá', 'Bảng xếp hạng', 'Tủ truyện', 'Đăng nhập', 'Đăng ký']) {
      await expect(header.getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    await expectHeaderFits(page, header.getByRole('link', { name: 'Đăng ký', exact: true }));

    await signUpVerified(page);
    await gotoHydrated(page, '/');
    const account = header.getByRole('button', { name: /^Tài khoản: / });
    await expect(account).toBeVisible();
    for (const name of ['Khám phá', 'Bảng xếp hạng', 'Tủ truyện', 'Viết truyện']) {
      await expect(header.getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    await expectHeaderFits(page, account);
  });
}
