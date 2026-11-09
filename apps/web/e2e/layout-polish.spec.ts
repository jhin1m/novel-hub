import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { createChapter, createStory } from './helpers/stories';

type Box = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number };

const PHONE = { width: 360, height: 800 };
const DESKTOP = { width: 1280, height: 800 };

let story: PublishedStory;
let matureStory: PublishedStory;

test.beforeAll(async () => {
  const run = Date.now().toString(36);
  story = await createPublishedStory({ title: `Bố Cục ${run}`, warningTags: ['bao-luc'] });
  matureStory = await createPublishedStory({
    title: `Bố Cục 18+ ${run}`,
    isMature: true,
    warningTags: ['bao-luc'],
  });
});

async function box(page: Page, selector: string): Promise<Box> {
  const found = await page.getByRole('banner').locator(selector).boundingBox();
  if (!found) throw new Error(`${selector} has no box`);
  return found;
}

/** Measures the header in a browser without JavaScript: exactly what the server renders. */
async function asServerRendered<T>(
  browser: Browser,
  viewport: Viewport,
  measure: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    return await measure(page);
  } finally {
    await context.close();
  }
}

const phoneHeader = async (page: Page) => ({
  account: await box(page, '[data-account-slot]:visible'),
  // The search box takes this role from `md` up; here the link does (the "Khám phá" tab has no label).
  search: await box(page, 'a[href="/search"][aria-label]'),
});

const desktopGuestHeader = async (page: Page) => ({
  signIn: await box(page, 'a[href^="/sign-in"]:visible'),
  signUp: await box(page, 'a[href="/sign-up"]:visible'),
  search: await box(page, 'form[role="search"]'),
});

const desktopMemberHeader = async (page: Page) => ({
  account: await box(page, '[data-account-slot]:visible'),
  search: await box(page, 'form[role="search"]'),
});

function expectSameX(actual: Box, expected: Box) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.5);
}

test.describe('the header keeps its layout once the account is known', () => {
  test(`${PHONE.width}px: guest and signed-in headers match the server render`, async ({
    browser,
    page,
  }) => {
    const server = await asServerRendered(browser, PHONE, phoneHeader);
    expect(server.account.width).toBe(42);

    await page.setViewportSize(PHONE);
    await gotoHydrated(page, '/');
    await expect(page.getByRole('button', { name: 'Tài khoản', exact: true })).toBeVisible();
    const guest = await phoneHeader(page);
    expect(guest.account.width).toBe(42);
    expectSameX(guest.account, server.account);
    expectSameX(guest.search, server.search);

    await signUp(page);
    await gotoHydrated(page, '/');
    await expect(page.getByRole('button', { name: /^Tài khoản: / })).toBeVisible();
    const signedIn = await phoneHeader(page);
    expect(signedIn.account.width).toBe(42);
    expectSameX(signedIn.account, server.account);
    expectSameX(signedIn.search, server.search);
  });

  test(`${DESKTOP.width}px: a guest's header matches the server render`, async ({
    browser,
    page,
  }) => {
    const server = await asServerRendered(browser, DESKTOP, desktopGuestHeader);

    await page.setViewportSize(DESKTOP);
    await gotoHydrated(page, '/');
    const guest = await desktopGuestHeader(page);
    expect(guest.signUp.height).toBe(44);
    expectSameX(guest.signIn, server.signIn);
    expectSameX(guest.signUp, server.signUp);
    expectSameX(guest.search, server.search);
    expect(guest.search.width).toBeCloseTo(server.search.width, 0);
  });

  test(`${DESKTOP.width}px: a returning reader's placeholders match their header`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signUp(page);
    await gotoHydrated(page, '/');
    await expect(page.getByRole('button', { name: /^Tài khoản: / })).toBeVisible();
    const signedIn = await desktopMemberHeader(page);
    expect(signedIn.account.width).toBe(42);

    // Without script files only the boot script runs: this is the header painted before hydration.
    await page.route('**/*', (route) =>
      route.request().resourceType() === 'script' ? route.abort() : route.continue(),
    );
    await page.reload();
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Viết truyện' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const hinted = await desktopMemberHeader(page);
    expect(hinted.account.width).toBe(42);
    expectSameX(hinted.account, signedIn.account);
    expectSameX(hinted.search, signedIn.search);
    expect(hinted.search.width).toBeCloseTo(signedIn.search.width, 0);
  });

  test('a guest signs in from the account menu and is sent back to the page', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoHydrated(page, '/terms');
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Đăng ký' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    await menu.getByRole('menuitem', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL('/sign-in?redirect=%2Fterms');
  });

  test('from the desktop header a guest signs in and comes back to the page', async ({
    page,
    context,
  }) => {
    const account = await signUp(page);
    await context.clearCookies();

    await gotoHydrated(page, '/terms');
    await page.getByRole('banner').getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL('/sign-in?redirect=%2Fterms');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Mật khẩu').fill(account.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL('/terms');
    await expect(page.getByRole('button', { name: /^Tài khoản: / })).toBeVisible();
  });
});

test.describe('safe areas', () => {
  test('the viewport extends under the notch and home indicator', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
  });

  async function scrollPaddingBottom(page: Page): Promise<string> {
    return page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  }

  test('focus and jumps stop above the bars fixed to the bottom of a phone', async ({ page }) => {
    await signUpVerified(page);
    const publicId = await createStory(page, `Bố Cục Viết ${Date.now().toString(36)}`);
    const chapter = await createChapter(page, publicId);
    const editorPath = `/write/stories/${publicId}/chapters/${chapter}`;
    const storyPath = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

    // `env()` is 0 in Chromium, so the padding is the bar's own 72px.
    for (const [path, ready] of [
      ['/search', 'nav[data-bottom-bar]'],
      [storyPath, 'div[data-bottom-bar]'],
      [editorPath, '[role="toolbar"][data-bottom-bar]'],
    ] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoHydrated(page, path);
      await expect(page.locator(ready)).toBeVisible();
      expect(await scrollPaddingBottom(page)).toBe('72px');

      await page.setViewportSize({ width: 1280, height: 800 });
      expect(await scrollPaddingBottom(page)).toBe('auto');
    }

    // The reader's bottom bar stays until `lg`.
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, story.chapterPath(1));
    expect(await scrollPaddingBottom(page)).toBe('72px');
    await page.setViewportSize({ width: 1100, height: 800 });
    expect(await scrollPaddingBottom(page)).toBe('auto');
  });
});

test('a 150-character title wraps between words and never widens a phone page', async ({
  page,
}) => {
  const title = `Người Kể Chuyện Trong Căn Nhà Cũ Bên Bờ Sông ${Date.now().toString(36)} `
    .repeat(4)
    .slice(0, 150)
    .trim();
  const long = await createPublishedStory({ title });
  const path = canonicalPath({ kind: 'story', slug: long.slug, publicId: long.publicId });

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoHydrated(page, path);
    const heading = page.locator('#story-title');
    await expect(heading).toHaveText(title);
    const brokenWords = await heading.evaluate((el) => {
      const node = el.firstChild as Text;
      const range = document.createRange();
      let offset = 0;
      return node.data.split(' ').filter((word) => {
        range.setStart(node, offset);
        range.setEnd(node, offset + word.length);
        offset += word.length + 1;
        return range.getClientRects().length > 1;
      });
    });
    expect(brokenWords).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});

test('the moderation queue is a 960px column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mod = await signUp(page);
  const { pool } = createTestDb();
  try {
    await pool.query("update users set role = 'mod' where email = $1", [mod.email]);
  } finally {
    await pool.end();
  }
  await gotoHydrated(page, '/moderation');
  const title = page.getByRole('heading', { name: 'Kiểm duyệt', level: 1 });
  await expect(title).toBeVisible();
  const column = await title.locator('..').boundingBox();
  expect(column?.width).toBeLessThanOrEqual(960);
  expect(column?.width).toBeGreaterThan(900);
});

test.describe('content warning tags', () => {
  test('the story page shows warning tags in the warning colours', async ({ page }) => {
    await gotoHydrated(
      page,
      canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId }),
    );
    const chip = page.locator('a[data-kind="warning"]');
    await expect(chip).toHaveAttribute('href', '/tags/bao-luc');
    await expect(chip).toHaveClass(/bg-warning-soft/);
  });

  test('the 18+ screen lists them as warning badges', async ({ page }) => {
    await gotoHydrated(
      page,
      canonicalPath({ kind: 'story', slug: matureStory.slug, publicId: matureStory.publicId }),
    );
    await expect(page.getByRole('heading', { name: 'Truyện có nội dung 18+' })).toBeVisible();
    const badge = page.locator('[data-slot="badge"][data-variant="warning"]');
    await expect(badge).toHaveCount(1);
  });
});

test('terms and content policy are set in the UI face', async ({ page }) => {
  for (const path of ['/terms', '/content-policy']) {
    await gotoHydrated(page, path);
    const body = page.locator('article section p').first();
    await expect(body).toBeVisible();
    const family = await body.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.startsWith('"Be Vietnam Pro')).toBe(true);
  }
});

test('terms and content policy use the 960px frame on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/terms', '/content-policy']) {
    await gotoHydrated(page, path);
    // The page frame (`PageShell`) is the article's parent, as wide as the moderation page.
    const frame = await page.locator('article').locator('xpath=..').boundingBox();
    expect(frame?.width).toBeCloseTo(960, 0);
  }
});
