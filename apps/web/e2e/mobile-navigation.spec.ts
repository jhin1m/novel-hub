import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { createChapter, createStory } from './helpers/stories';

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

  test('the writing page: "Viết" is current, the totals show, no horizontal scroll', async ({
    page,
  }) => {
    await signUpVerified(page);
    const title = `Truyện Của Tôi ${Date.now().toString(36)}`;
    await createStory(page, title);
    await gotoHydrated(page, '/write');
    await expect(
      page.getByRole('navigation', MAIN_NAV).getByRole('link', { name: 'Viết' }),
    ).toHaveAttribute('aria-current', 'page');

    const stats = page.getByLabel('Tổng quan truyện của bạn');
    await expect(stats.locator('dt').first()).toHaveText('truyện');
    await expect(stats.locator('dd').first()).toHaveText('1');
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tạo truyện mới' })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
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

test.describe('secondary pages at 360px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('search, sign-in and the library fit the screen', async ({ page }) => {
    await gotoHydrated(page, '/search?q=tab');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tìm', exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await gotoHydrated(page, '/sign-in');
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await signUpVerified(page);
    await gotoHydrated(page, '/library');
    // The shelf tabs scroll inside their own row; the page itself does not.
    await expect(page.getByRole('link', { name: 'Đã xong' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the moderation filters wrap instead of overflowing', async ({ page }) => {
    const mod = await signUp(page);
    const { pool } = createTestDb();
    try {
      await pool.query("update users set role = 'mod' where email = $1", [mod.email]);
    } finally {
      await pool.end();
    }
    await gotoHydrated(page, '/moderation');
    await expect(page.getByRole('heading', { name: 'Kiểm duyệt', level: 1 })).toBeVisible();
    const reasons = page.getByRole('navigation', { name: 'Lọc theo lý do' });
    await expect(reasons).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('chapter editor at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the toolbar sits at the bottom, "Đăng" shows, no horizontal scroll', async ({ page }) => {
    await signUpVerified(page);
    const publicId = await createStory(page, `Editor Hẹp ${Date.now().toString(36)}`);
    const number = await createChapter(page, publicId);
    await gotoHydrated(page, `/write/stories/${publicId}/chapters/${number}`);

    const toolbar = page.getByRole('toolbar', { name: 'Định dạng' });
    await expect(toolbar).toBeVisible();
    const box = await toolbar.boundingBox();
    if (!box) throw new Error('toolbar not laid out');
    expect(box.y + box.height).toBeCloseTo(844, 0);
    await expect(page.getByRole('button', { name: 'Đăng', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lịch sử' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Về trang truyện' })).toBeVisible();
    // The word count moves under the chapter title, once.
    await expect(page.getByText('0 chữ', { exact: true })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
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

test.describe('chapter reading controls', () => {
  const CHAPTER_NAV = { name: 'Điều hướng chương' } as const;
  let book: PublishedStory;
  let mature: PublishedStory;

  test.beforeAll(async () => {
    book = await createPublishedStory({ published: 2 });
    mature = await createPublishedStory({ isMature: true });
  });

  /** Where a sheet ends up once its slide-in animation is over. */
  async function settledBox(sheet: Locator) {
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await sheet.boundingBox();
    if (!box) throw new Error('sheet not laid out');
    return box;
  }

  /** Tabs through the page; nothing behind the 18+ screen ever takes focus or opens a panel. */
  async function expectGateKeepsFocus(page: Page) {
    await gotoHydrated(page, mature.chapterPath(1));
    await expect(page.getByRole('alertdialog')).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement?.closest('.reader-page') ?? null),
      ).toBeNull();
      await expect(page.locator('button[aria-label="Mục lục"]').first()).not.toBeFocused();
      await expect(page.locator('button[aria-label="Cài đặt hiển thị"]').first()).not.toBeFocused();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  test.describe('at 360px', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test('one bottom bar with the four controls; chapter 1 has no previous chapter', async ({
      page,
    }) => {
      await gotoHydrated(page, book.chapterPath(1));
      const nav = page.getByRole('navigation', CHAPTER_NAV);
      await expect(nav).toHaveCount(1);
      await expect(nav).toHaveClass(/reader-bottom-bar/);
      await expect(nav.getByRole('button', { name: 'Mục lục' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Cài đặt hiển thị' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Chương trước' })).toBeDisabled();
      await expect(nav.getByRole('link', { name: 'Chương sau' })).toHaveAttribute(
        'href',
        book.chapterPath(2),
      );
      await expectNoHorizontalScroll(page);
    });

    test('the settings panel is a bottom sheet', async ({ page }) => {
      await gotoHydrated(page, book.chapterPath(1));
      await page
        .getByRole('navigation', CHAPTER_NAV)
        .getByRole('button', { name: 'Cài đặt hiển thị' })
        .click();
      const settings = page.getByRole('dialog', { name: 'Cài đặt hiển thị' });
      await expect(settings).toBeVisible();
      const box = await settledBox(settings);
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeCloseTo(800, 0);
      expect(box.x).toBe(0);
      expect(box.width).toBe(360);
    });

    test('the 18+ screen keeps keyboard focus off the reading controls', async ({ page }) => {
      await expectGateKeepsFocus(page);
    });
  });

  test.describe('at 1280px', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('only the rail shows; closing a panel gives focus back to its button', async ({
      page,
    }) => {
      await gotoHydrated(page, book.chapterPath(2));
      const nav = page.getByRole('navigation', CHAPTER_NAV);
      await expect(nav).toHaveCount(1);
      await expect(nav).toHaveClass(/reader-rail/);
      await expect(nav.getByRole('link', { name: 'Chương trước' })).toHaveAttribute(
        'href',
        book.chapterPath(1),
      );

      const toc = nav.getByRole('button', { name: 'Mục lục' });
      await toc.click();
      // The modal sheet hides the rest of the page from the accessibility tree meanwhile.
      await expect(page.locator('.reader-rail button[aria-label="Mục lục"]')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(page.getByRole('dialog', { name: 'Mục lục' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(toc).toBeFocused();
      await expect(toc).toHaveAttribute('aria-expanded', 'false');
    });

    test('the settings panel is modal: a click on the text closes it, focus goes back', async ({
      page,
    }) => {
      await gotoHydrated(page, book.chapterPath(1));
      const settings = page
        .getByRole('navigation', CHAPTER_NAV)
        .getByRole('button', { name: 'Cài đặt hiển thị' });
      await settings.click();
      await expect(page.getByRole('dialog', { name: 'Cài đặt hiển thị' })).toBeVisible();
      // The transparent overlay takes the click, not the text under it.
      const text = await page.locator('.reader-content').boundingBox();
      if (!text) throw new Error('chapter text not laid out');
      await page.mouse.click(text.x + 10, text.y + 10);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(settings).toBeFocused();
    });

    test('settings open on the right beside the text; the contents open on the left', async ({
      page,
    }) => {
      await gotoHydrated(page, book.chapterPath(1));
      const nav = page.getByRole('navigation', CHAPTER_NAV);
      await nav.getByRole('button', { name: 'Cài đặt hiển thị' }).click();
      const settings = page.getByRole('dialog', { name: 'Cài đặt hiển thị' });
      await expect(settings).toBeVisible();
      const panel = await settledBox(settings);
      expect(panel.x).toBeGreaterThan(640);
      // The text column moved left: the panel covers none of it.
      const paragraph = await page.locator('.reader-content p').first().boundingBox();
      if (!paragraph) throw new Error('chapter text not laid out');
      expect(paragraph.x + paragraph.width).toBeLessThanOrEqual(panel.x);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await nav.getByRole('button', { name: 'Mục lục' }).click();
      const toc = page.getByRole('dialog', { name: 'Mục lục' });
      await expect(toc).toBeVisible();
      expect((await settledBox(toc)).x).toBe(0);
    });

    test('the 18+ screen keeps keyboard focus off the reading controls', async ({ page }) => {
      await expectGateKeepsFocus(page);
    });
  });
});
