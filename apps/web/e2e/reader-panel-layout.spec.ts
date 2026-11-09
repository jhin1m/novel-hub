import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

/*
 * From `lg` up, the settings panel and the paragraph-comments panel sit on the right of the reading
 * page. Opening one never moves the text column or changes its width: the panel lies over the right
 * of the page (without dimming the text), over the column's right edge on narrower screens.
 * With Source Serif 4 at 19px, `ch` is 10px: Hẹp/Vừa/Rộng = 600/680/750px.
 */

const WIDTHS = ['Hẹp', 'Vừa', 'Rộng'] as const;
type Width = (typeof WIDTHS)[number];

const SETTINGS = { name: 'Cài đặt hiển thị' } as const;

let story: PublishedStory;

test.beforeAll(async () => {
  story = await createPublishedStory({
    published: 1,
    extraParagraphs: ['Đoạn thứ hai để chọn khi mở bình luận theo đoạn.'],
  });
});

const column = (page: Page) => page.locator('.reader-column');

async function columnBox(page: Page) {
  const box = await column(page).boundingBox();
  if (!box) throw new Error('text column not laid out');
  return box;
}

/** Where a sheet ends up once its slide-in animation is over. */
async function settledBox(sheet: Locator) {
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await sheet.boundingBox();
  if (!box) throw new Error('sheet not laid out');
  return box;
}

async function openSettings(page: Page) {
  await page
    .getByRole('navigation', { name: 'Điều hướng chương' })
    .getByRole('button', SETTINGS)
    .click();
  const settings = page.getByRole('dialog', SETTINGS);
  await expect(settings).toBeVisible();
  return settings;
}

/** Picks a segment of a choice group by clicking its visible label (the radio itself is hidden). */
async function choose(settings: Locator, name: Width) {
  await settings
    .locator('label')
    .filter({ has: settings.page().getByRole('radio', { name, exact: true }) })
    .click();
  await expect(settings.getByRole('radio', { name, exact: true })).toBeChecked();
}

async function closePanel(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Sets the column width through the panel, then closes it. */
async function pickWidth(page: Page, width: Width) {
  await choose(await openSettings(page), width);
  await closePanel(page);
}

/** Measured after the sheet's slide-in, so a 1px tolerance covers sub-pixel rounding only. */
function expectSameColumn(
  open: { x: number; width: number },
  closed: { x: number; width: number },
) {
  expect(Math.abs(open.width - closed.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(open.x - closed.x)).toBeLessThanOrEqual(1);
}

/** Opening the settings keeps the column where it was, as wide as it was. */
async function expectSettingsKeepColumn(page: Page, width: Width, { overlaps = false } = {}) {
  await gotoHydrated(page, story.chapterPath(1));
  await pickWidth(page, width);
  const closed = await columnBox(page);

  const panel = await settledBox(await openSettings(page));
  expectSameColumn(await columnBox(page), closed);
  // Still centred: on narrower screens the panel lies over the column's right edge.
  if (overlaps) expect(closed.x + closed.width).toBeGreaterThan(panel.x);
}

test.describe('reader side panels keep the text column in place', () => {
  test('1440px, Vừa: opening the settings keeps the column in place', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectSettingsKeepColumn(page, 'Vừa');
  });

  test('1024px, Vừa: the panel overlaps the column instead of moving it', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expectSettingsKeepColumn(page, 'Vừa', { overlaps: true });
  });

  test('1100px, Rộng: the panel overlaps the column instead of moving it', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await expectSettingsKeepColumn(page, 'Rộng', { overlaps: true });
  });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1100, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`${viewport.width}px: picking a width with the panel open shows it right away`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoHydrated(page, story.chapterPath(1));
      const settings = await openSettings(page);
      await settledBox(settings);
      await choose(settings, 'Hẹp');
      const narrow = await columnBox(page);
      await choose(settings, 'Rộng');
      const wide = await columnBox(page);
      expect(wide.width - narrow.width).toBeGreaterThan(100);
      await expect(settings).toBeVisible();
      for (const width of WIDTHS) {
        await choose(settings, width);
        const open = await columnBox(page);
        await closePanel(page);
        expectSameColumn(open, await columnBox(page));
        await settledBox(await openSettings(page));
      }
    });
  }

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`${viewport.width}px, Rộng: the paragraph-comments panel keeps the column in place`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoHydrated(page, story.chapterPath(1));
      await pickWidth(page, 'Rộng');
      const closed = await columnBox(page);

      const paragraph = page.locator('.reader-content p[data-pid]').nth(1);
      await paragraph.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      await page.getByRole('button', { name: 'Bình luận đoạn này' }).click();
      const sheet = page.getByRole('dialog', { name: /^Bình luận về đoạn/ });
      await expect(sheet).toBeVisible();
      await settledBox(sheet);
      expectSameColumn(await columnBox(page), closed);
    });
  }

  test('1024px, Rộng: the panel overlaps the column without dimming it', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expectSettingsKeepColumn(page, 'Rộng', { overlaps: true });
    const overlay = page.locator('.fixed.inset-0[data-state="open"]');
    await expect(overlay).toHaveCount(1);
    expect(await overlay.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
  });
});
