import { canonicalPath } from '@novel-hub/shared';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const MAIN_NAV = { name: 'Điều hướng chính' } as const;
const TABS = ['Trang chủ', 'Khám phá', 'Tủ truyện', 'Viết', 'Tôi'];

let story: PublishedStory;

test.beforeAll(async () => {
  // A long title, so the story page hero is checked for horizontal overflow.
  story = await createPublishedStory({
    title: `Thanh Tab ${Date.now().toString(36)} – một tiêu đề thật dài để thử xem phần đầu trang truyện có tràn ngang trên màn hình điện thoại hẹp hay không`,
  });
});

const storyPath = () =>
  canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe('mobile tab bar at 360px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('the home page has the five tabs outside the header, "Trang chủ" current', async ({
    page,
  }) => {
    await gotoHydrated(page, '/');
    const nav = page.getByRole('navigation', MAIN_NAV);
    await expect(nav).toBeVisible();
    await expect(page.getByRole('banner').getByRole('navigation', MAIN_NAV)).toHaveCount(0);

    const links = nav.getByRole('link');
    await expect(links).toHaveText(TABS);
    await expect(nav.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });

  test('on the search page "Khám phá" is current; a guest\'s "Tôi" leads to sign-in', async ({
    page,
  }) => {
    await gotoHydrated(page, '/search?q=tab');
    const nav = page.getByRole('navigation', MAIN_NAV);
    await expect(nav.getByRole('link', { name: 'Khám phá' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Trang chủ' })).not.toHaveAttribute(
      'aria-current',
      /.*/,
    );
    await expect(nav.getByRole('link', { name: 'Tôi' })).toHaveAttribute('href', '/sign-in');
  });

  test('signed in: "Tủ truyện" opens the library without reloading the app', async ({ page }) => {
    await signUpVerified(page);
    await gotoHydrated(page, '/');
    const nav = page.getByRole('navigation', MAIN_NAV);
    await expect(nav.getByRole('link', { name: 'Tôi' })).toHaveAttribute('href', '/settings');

    // A full document load would drop this marker.
    await page.evaluate(() => {
      (window as unknown as { __nav: number }).__nav = 1;
    });
    await nav.getByRole('link', { name: 'Tủ truyện' }).click();
    await expect(page).toHaveURL('/library?shelf=reading&page=1');
    await expect(nav.getByRole('link', { name: 'Tủ truyện' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(() => (window as unknown as { __nav?: number }).__nav)).toBe(1);
  });

  test('the story page has no tab bar, no horizontal scroll and one sticky reading link', async ({
    page,
  }) => {
    await gotoHydrated(page, storyPath());
    await expect(page.getByRole('heading', { level: 1, name: story.title })).toBeVisible();
    await expect(page.getByRole('navigation', MAIN_NAV)).toHaveCount(0);
    // The hero's own reading link is hidden on a narrow screen: only the sticky one is there.
    const start = page.getByRole('link', { name: 'Đọc từ đầu' });
    await expect(start).toHaveCount(1);
    await expect(start).toBeVisible();
    await expect(start).toHaveAttribute('href', story.chapterPath(1));
    await expectNoHorizontalScroll(page);
  });

  test('the sticky reading link never covers the footer', async ({ page }) => {
    await gotoHydrated(page, storyPath());
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // A plain click: it fails if anything fixed sits over the link.
    await page.getByRole('contentinfo').getByRole('link', { name: 'Điều khoản' }).click();
    await expect(page).toHaveURL('/terms');
  });
});

test.describe('desktop at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the tab bar is hidden', async ({ page }) => {
    await gotoHydrated(page, '/');
    await expect(page.getByRole('navigation', MAIN_NAV)).toBeHidden();
  });

  test('library buttons on the story hero use the cover text colour, like its title', async ({
    page,
  }) => {
    const color = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).color);
    await gotoHydrated(page, storyPath());
    const title = page.getByRole('heading', { level: 1, name: story.title });
    const titleColor = await color(title);

    const guestAdd = page.getByRole('link', { name: 'Thêm vào tủ' });
    await expect(guestAdd).toBeVisible();
    expect(await color(guestAdd)).toBe(titleColor);

    await signUpVerified(page);
    await gotoHydrated(page, storyPath());
    await page.getByRole('button', { name: 'Thêm vào tủ' }).click();
    const onShelf = page.getByRole('button', { name: 'Trong tủ: Đang đọc' });
    await expect(onShelf).toBeVisible();
    expect(await color(onShelf)).toBe(titleColor);
  });
});
