import { canonicalPath } from '@novel-hub/shared';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);
const password = 'mat-khau-e2e-123';

/** The link sends a guest to `/sign-in` with `redirect` (and `reason`, when given). */
async function expectSignInLink(link: Locator, redirect: string | RegExp, reason?: string) {
  const href = await link.getAttribute('href');
  const url = new URL(href ?? '', 'http://n.invalid');
  expect(url.pathname).toBe('/sign-in');
  const target = url.searchParams.get('redirect');
  if (typeof redirect === 'string') expect(target).toBe(redirect);
  else expect(target).toMatch(redirect);
  expect(url.searchParams.get('reason')).toBe(reason ?? null);
}

async function signInWith(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test.describe('guests sign in and come back', () => {
  test('a guest clicks "Theo dõi", signs in, and lands back on the story page', async ({
    page,
    context,
  }) => {
    const story = await createPublishedStory({ title: `Quay Lại ${run}`, published: 1 });
    const storyPath = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
    const account = await signUp(page);
    await context.clearCookies();

    await gotoHydrated(page, storyPath);
    const follow = page.getByRole('link', { name: 'Theo dõi' });
    await expectSignInLink(follow, storyPath, 'follow');
    await follow.click();
    await expect(page.getByRole('status')).toHaveText('Đăng nhập để theo dõi.');
    await page.waitForLoadState('networkidle');
    await signInWith(page, account.email);

    await expect(page).toHaveURL(storyPath);
    await expect(page.getByRole('button', { name: 'Theo dõi' })).toBeVisible();
  });

  test('a guest goes from sign-in to sign-up and still lands back on the story page', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Đăng Ký Quay Lại ${run}`, published: 1 });
    const storyPath = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

    await gotoHydrated(page, storyPath);
    await page.getByRole('link', { name: 'Theo dõi' }).click();
    await page.getByRole('link', { name: 'Chưa có tài khoản? Đăng ký' }).click();
    await expect(page).toHaveURL(/\/sign-up\?/);
    await expect(page.getByRole('status')).toHaveText('Đăng nhập để theo dõi.');
    await page.waitForLoadState('networkidle');

    const suffix = `${Date.now().toString(36)}r`;
    await page.getByLabel('Tên hiển thị').fill('Khách Quay Lại');
    await page.getByLabel('Tên người dùng').fill(`g_${suffix}`);
    await page.getByLabel('Email').fill(`guest-${suffix}@example.com`);
    await page.getByLabel('Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    await expect(page).toHaveURL(storyPath);
    await expect(page.getByRole('button', { name: 'Theo dõi' })).toBeVisible();
  });

  test('an unsafe redirect falls back to the home page', async ({ page, context }) => {
    const account = await signUp(page);
    await context.clearCookies();

    await gotoHydrated(page, '/sign-in?redirect=/.//evil.example');
    await expect(page.getByRole('status')).toHaveCount(0);
    await signInWith(page, account.email);
    await expect(page).toHaveURL('/');
  });

  test('every sign-in link a guest sees carries the page to come back to', async ({ page }) => {
    const story = await createPublishedStory({ title: `Link Khách ${run}`, published: 1 });
    const storyPath = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

    await gotoHydrated(page, storyPath);
    await expectSignInLink(
      page.getByRole('link', { name: 'Thêm vào tủ' }).first(),
      storyPath,
      'library',
    );
    await expectSignInLink(
      page.getByRole('link', { name: 'Báo cáo', exact: true }).first(),
      storyPath,
      'report',
    );

    await gotoHydrated(page, '/library');
    await expectSignInLink(
      page.getByRole('main').getByRole('link', { name: 'Đăng nhập', exact: true }),
      /^\/library(\?|$)/,
    );
  });
});
