import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;

/** Display name long enough to overflow any narrow header unless it is truncated. */
const LONG_NAME = 'Người Viết Có Một Cái Tên Hiển Thị Rất Rất Dài';

let story: PublishedStory;

test.beforeAll(async () => {
  story = await createPublishedStory({ title: `Đầu Trang Hẹp ${Date.now().toString(36)}` });
});

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function setLongDisplayName(email: string) {
  const { pool } = createTestDb();
  try {
    await pool.query('update users set display_name = $1 where email = $2', [LONG_NAME, email]);
  } finally {
    await pool.end();
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`narrow header at ${viewport.width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('guest: no horizontal scroll; search, sign-in and sign-up are reachable', async ({
      page,
    }) => {
      await gotoHydrated(page, '/');
      const header = page.getByRole('banner');
      await expect(header.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await expect(header.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Tìm kiếm' })).toHaveAttribute(
        'href',
        '/search',
      );

      await gotoHydrated(page, story.chapterPath(1));
      await expectNoHorizontalScroll(page);
    });

    test('signed in with a long name: no horizontal scroll; every header item is reachable', async ({
      page,
    }) => {
      const { email } = await signUp(page);
      await setLongDisplayName(email);
      await gotoHydrated(page, '/');
      const header = page.getByRole('banner');
      const account = header.getByRole('button', { name: `Tài khoản: ${LONG_NAME}` });
      await expect(account).toBeVisible();
      await expectNoHorizontalScroll(page);

      await expect(header.getByRole('link', { name: 'Tìm kiếm' })).toBeVisible();

      // Secondary links live in the account menu on narrow screens.
      await account.click();
      const menu = page.getByRole('menu');
      for (const name of ['Viết truyện', 'Tủ truyện', 'Cài đặt', 'Đăng xuất']) {
        await expect(menu.getByRole('menuitem', { name })).toBeVisible();
      }
      await expectNoHorizontalScroll(page);
      await menu.getByRole('menuitem', { name: 'Viết truyện' }).click();
      await expect(page).toHaveURL('/write');

      await gotoHydrated(page, story.chapterPath(1));
      await expectNoHorizontalScroll(page);
    });
  });
}

test('signed in with a long name: no horizontal scroll at tablet widths either', async ({
  page,
}) => {
  const { email } = await signUp(page);
  await setLongDisplayName(email);
  for (const width of [640, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoHydrated(page, '/');
    await expect(page.getByRole('button', { name: `Tài khoản: ${LONG_NAME}` })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
