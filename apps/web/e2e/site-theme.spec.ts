import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

// `--background` of each site theme and `--reader-bg` of the presets, as in `tokens.css`.
const IVORY_BG = '#f8f3e8';
const DARK_BG = '#101312';
const DARK_GRAY_READER_BG = '#2b2b2b';
const SEPIA_READER_BG = '#f4ecd8';

const html = (page: Page) => page.locator('html');

/** A CSS variable as computed on `<html>`. */
function rootVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}

/** The stored choice (`nh:theme`), or `null`. */
async function storedChoice(page: Page): Promise<unknown> {
  const raw = await page.evaluate(() => localStorage.getItem('nh:theme'));
  return raw === null ? null : (JSON.parse(raw) as { choice?: unknown }).choice;
}

/** Aborts every script file; inline scripts in the HTML (the boot script) still run. */
async function blockScriptFiles(page: Page) {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue(),
  );
}

/** Opens the header account menu (guest or signed in) and returns it. */
async function openAccountMenu(page: Page) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Tài khoản/ })
    .click();
  return page.getByRole('menu');
}

/** Picks a choice in the "Giao diện" section of `/settings` by clicking its visible label. */
async function chooseInSettings(page: Page, name: string) {
  const section = page.getByRole('region', { name: 'Giao diện' });
  await section
    .locator('label')
    .filter({ has: page.getByRole('radio', { name, exact: true }) })
    .click();
}

const isPreferencesPatch = (url: string, method: string) =>
  url.endsWith('/api/v1/me/preferences') && method === 'PATCH';

test.describe('site theme on a light system', () => {
  test.use({ colorScheme: 'light' });

  test('a guest picks Dark from the account menu; it is painted on reload before any script file', async ({
    page,
  }) => {
    await gotoHydrated(page, '/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    expect(await rootVar(page, '--background')).toBe(IVORY_BG);

    const menu = await openAccountMenu(page);
    await menu.getByRole('menuitemradio', { name: 'Tối', exact: true }).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await rootVar(page, '--background')).toBe(DARK_BG);
    expect(await storedChoice(page)).toBe('dark');

    const reopened = await openAccountMenu(page);
    await expect(reopened.getByRole('menuitemradio', { name: 'Tối', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');

    await blockScriptFiles(page);
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await rootVar(page, '--background')).toBe(DARK_BG);
  });

  test('a signed-in reader gets their choice on another device', async ({ page, browser }) => {
    await signUp(page);
    await gotoHydrated(page, '/settings');
    const saved = page.waitForResponse((res) =>
      isPreferencesPatch(res.url(), res.request().method()),
    );
    await chooseInSettings(page, 'Tối');
    expect((await saved).status()).toBe(200);

    // Same account, empty localStorage: the server copy is newer and wins.
    const { cookies } = await page.context().storageState();
    const other = await browser.newContext({
      colorScheme: 'light',
      storageState: { cookies, origins: [] },
    });
    const otherPage = await other.newPage();
    await gotoHydrated(otherPage, '/');
    await expect(html(otherPage)).toHaveAttribute('data-theme', 'dark');
    expect(await storedChoice(otherPage)).toBe('dark');

    const menu = await openAccountMenu(otherPage);
    await expect(menu.getByRole('menuitemradio', { name: 'Tối', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await other.close();
  });

  test("a guest's choice is uploaded on sign-up", async ({ page }) => {
    await gotoHydrated(page, '/settings');
    await chooseInSettings(page, 'Tối');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    const uploaded = page.waitForRequest((req) => isPreferencesPatch(req.url(), req.method()));
    await signUp(page);
    const body = (await uploaded).postDataJSON() as { siteTheme?: { choice?: unknown } };
    expect(body.siteTheme?.choice).toBe('dark');
  });

  test('the server-rendered HTML never carries a theme', async ({ page }) => {
    await gotoHydrated(page, '/settings');
    await chooseInSettings(page, 'Tối');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    const res = await page.request.get('/');
    const openingTag = /<html[^>]*>/.exec(await res.text())?.[0];
    expect(openingTag).toBeDefined();
    expect(openingTag).not.toContain('data-theme');
  });
});

test.describe('site theme on a dark system', () => {
  test.use({ colorScheme: 'dark' });

  test('Ivory overrides the system; "Theo hệ thống" follows it again', async ({ page }) => {
    await gotoHydrated(page, '/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    expect(await rootVar(page, '--background')).toBe(DARK_BG);

    await gotoHydrated(page, '/settings');
    await chooseInSettings(page, 'Ngà');
    await expect(html(page)).toHaveAttribute('data-theme', 'ivory');
    expect(await rootVar(page, '--background')).toBe(IVORY_BG);

    await blockScriptFiles(page);
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'ivory');
    expect(await rootVar(page, '--background')).toBe(IVORY_BG);

    await page.unrouteAll();
    await gotoHydrated(page, '/settings');
    await chooseInSettings(page, 'Theo hệ thống');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.*/);
    expect(await rootVar(page, '--background')).toBe(DARK_BG);
  });
});

test.describe('reading presets beside the site theme', () => {
  test.use({ colorScheme: 'light' });
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ published: 1 });
  });

  test('without a preset the reader follows Dark; a chosen preset still wins', async ({ page }) => {
    await gotoHydrated(page, '/settings');
    await chooseInSettings(page, 'Tối');

    await gotoHydrated(page, story.chapterPath(1));
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(html(page)).not.toHaveAttribute('data-reader-theme', /.*/);
    expect(await rootVar(page, '--reader-bg')).toBe(DARK_GRAY_READER_BG);

    await page.getByRole('button', { name: 'Cài đặt hiển thị' }).click();
    const settings = page.getByRole('dialog', { name: 'Cài đặt hiển thị' });
    await settings
      .locator('label')
      .filter({ has: page.getByRole('radio', { name: 'Sepia', exact: true }) })
      .click();
    await expect(html(page)).toHaveAttribute('data-reader-theme', 'sepia');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await rootVar(page, '--reader-bg')).toBe(SEPIA_READER_BG);
  });
});
