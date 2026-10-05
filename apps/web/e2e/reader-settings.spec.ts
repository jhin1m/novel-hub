import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const html = (page: Page) => page.locator('html');

/** A CSS variable as computed on `<html>`. */
function rootVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Cài đặt hiển thị' }).click();
  return page.getByRole('dialog', { name: 'Cài đặt hiển thị' });
}

/** Picks a segment of a choice group by clicking its visible label (the radio itself is hidden). */
async function choose(settings: Locator, name: string) {
  await settings
    .locator('label')
    .filter({ has: settings.page().getByRole('radio', { name, exact: true }) })
    .click();
}

/** Aborts every script file; inline scripts in the HTML still run. */
async function blockScriptFiles(page: Page) {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue(),
  );
}

test.describe('reader settings', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ published: 1 });
  });

  test('changes apply at once and are painted on reload before any script file runs', async ({
    page,
  }) => {
    await gotoHydrated(page, story.chapterPath(1));
    const settings = await openSettings(page);

    await choose(settings, 'Sepia');
    await expect(html(page)).toHaveAttribute('data-reader-theme', 'sepia');

    const fontSize = settings.getByRole('slider', { name: 'Cỡ chữ' });
    await fontSize.focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect(fontSize).toHaveValue('24');
    expect(await rootVar(page, '--reader-font-size')).toBe('24px');
    // Arrow keys inside the panel adjust the slider; they never change the chapter.
    await expect(page).toHaveURL(story.chapterPath(1));

    await blockScriptFiles(page);
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-reader-theme', 'sepia');
    expect(await rootVar(page, '--reader-font-size')).toBe('24px');
  });

  test('the reset button returns to the system preset and 19px', async ({ page }) => {
    await gotoHydrated(page, story.chapterPath(1));
    const settings = await openSettings(page);
    await choose(settings, 'Xám tối');
    const fontSize = settings.getByRole('slider', { name: 'Cỡ chữ' });
    await fontSize.focus();
    await page.keyboard.press('ArrowLeft');
    expect(await rootVar(page, '--reader-font-size')).toBe('18px');

    await settings.getByRole('button', { name: 'Khôi phục mặc định' }).click();
    await expect(html(page)).not.toHaveAttribute('data-reader-theme', /.*/);
    await expect(fontSize).toHaveValue('19');
    expect(await rootVar(page, '--reader-font-size')).toBe('19px');
  });

  test('the column width only applies on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHydrated(page, story.chapterPath(1));
    const settings = await openSettings(page);
    await choose(settings, 'Hẹp');
    await expect(html(page)).toHaveAttribute('data-reader-width', 'narrow');
    expect(await rootVar(page, '--reader-column')).toBe('60ch');

    await page.setViewportSize({ width: 375, height: 800 });
    expect(await rootVar(page, '--reader-column')).toBe('68ch');
    await expect(settings.getByText('Độ rộng cột chữ')).toBeHidden();
  });

  test('a signed-in reader gets their settings on another device', async ({ page, browser }) => {
    await signUp(page);
    await gotoHydrated(page, story.chapterPath(1));
    const settings = await openSettings(page);
    const saved = page.waitForResponse(
      (res) => res.url().endsWith('/api/v1/me/preferences') && res.request().method() === 'PATCH',
    );
    await choose(settings, 'Đen OLED');
    expect((await saved).status()).toBe(200);

    // Same account, empty localStorage: the server copy is newer and wins.
    const { cookies } = await page.context().storageState();
    const other = await browser.newContext({ storageState: { cookies, origins: [] } });
    const otherPage = await other.newPage();
    await gotoHydrated(otherPage, story.chapterPath(1));
    await expect(html(otherPage)).toHaveAttribute('data-reader-theme', 'oled-black');
    const stored = await otherPage.evaluate(() => localStorage.getItem('nh:reader'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ theme: 'oled-black' });
    await other.close();
  });
});

test.describe('turning 18+ content on from the warning screen', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ isMature: true });
  });

  test('requires the age confirmation, then shows the chapter without the screen on reload', async ({
    page,
  }) => {
    await signUp(page);
    await gotoHydrated(page, story.chapterPath(1));
    const gate = page.getByRole('alertdialog');
    const enable = gate.getByRole('button', { name: 'Hiện nội dung 18+' });
    await expect(enable).toBeDisabled();

    await gate.getByRole('checkbox', { name: 'Tôi xác nhận đã đủ 18 tuổi' }).click();
    await enable.click();
    await expect(gate).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.locator('.reader-content')).toContainText('Mở đầu chương 1.');
    expect(await page.evaluate(() => localStorage.getItem('nh:mature'))).toBe('1');

    const me = await page.request.get('/api/v1/me');
    expect(await me.json()).toMatchObject({ user: { preferences: { showMature: true } } });

    // Before any script file runs, the stored hint already hides the screen.
    await blockScriptFiles(page);
    await page.reload();
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });
});
