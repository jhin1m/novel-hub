import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { createChapter, createStory } from './helpers/stories';

type Box = { x: number; y: number; width: number; height: number };

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

/** The header's right-hand cluster and search box as the server renders them (account unknown). */
async function serverHeader(browser: Browser, viewport: typeof PHONE) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    return await headerBoxes(page, viewport);
  } finally {
    await context.close();
  }
}

async function headerBoxes(page: Page, viewport: typeof PHONE) {
  return {
    account: await box(page, '[data-account-slot]'),
    // The search link below `md`, the search box from `md` up (the "Khám phá" link also leads to
    // `/search`, but has no `aria-label`).
    search: await box(
      page,
      viewport.width < 768 ? 'a[href="/search"][aria-label]' : 'form[role="search"]',
    ),
  };
}

function expectSameX(actual: Box, expected: Box) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.5);
}

test.describe('the header keeps its layout once the account is known', () => {
  for (const viewport of [PHONE, DESKTOP]) {
    test(`${viewport.width}px: guest and signed-in headers match the server render`, async ({
      browser,
      page,
    }) => {
      const server = await serverHeader(browser, viewport);
      expect(server.account.width).toBe(42);

      await page.setViewportSize(viewport);
      await gotoHydrated(page, '/');
      await expect(page.getByRole('button', { name: 'Tài khoản', exact: true })).toBeVisible();
      const guest = await headerBoxes(page, viewport);
      expect(guest.account.width).toBe(42);
      expectSameX(guest.account, server.account);
      expectSameX(guest.search, server.search);
      expect(guest.search.width).toBeCloseTo(server.search.width, 0);

      await signUp(page);
      await gotoHydrated(page, '/');
      await expect(page.getByRole('button', { name: /^Tài khoản: / })).toBeVisible();
      const signedIn = await headerBoxes(page, viewport);
      expect(signedIn.account.width).toBe(42);
      expectSameX(signedIn.account, server.account);
      expectSameX(signedIn.search, server.search);
      expect(signedIn.search.width).toBeCloseTo(server.search.width, 0);
    });
  }

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
    expect(family.startsWith('"Plus Jakarta Sans')).toBe(true);
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
