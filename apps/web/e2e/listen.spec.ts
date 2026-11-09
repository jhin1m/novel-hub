import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { stubSpeech } from './helpers/speech-stub';

/*
 * Listening to a chapter through the browser's speech synthesis, replaced by a fake engine whose
 * utterances end only when the test says so (`window.__tts`).
 */

const CHAPTER_NAV = { name: 'Điều hướng chương' } as const;
const LISTEN = { name: 'Nghe truyện' } as const;
const PLAYER = { name: 'Trình nghe truyện' } as const;

const SECOND = 'Đoạn thứ hai của chương.';
const THIRD = 'Đoạn thứ ba của chương.';

let story: PublishedStory;
let mature: PublishedStory;

test.beforeAll(async () => {
  story = await createPublishedStory({ published: 2, extraParagraphs: [SECOND, THIRD] });
  mature = await createPublishedStory({ isMature: true });
});

const paragraphs = (page: Page) => page.locator('.reader-content [data-pid]');
const player = (page: Page) => page.getByRole('region', PLAYER);
const speaking = (page: Page) => page.evaluate(() => window.__tts.current());

async function startListening(page: Page, path: string) {
  await gotoHydrated(page, path);
  const listen = page.getByRole('navigation', CHAPTER_NAV).getByRole('button', LISTEN);
  await listen.click();
  await expect(player(page)).toBeVisible();
  await expect(listen).toHaveAttribute('aria-pressed', 'true');
  return listen;
}

test('without a Vietnamese voice there is no listen control, on any screen size', async ({
  page,
}) => {
  await stubSpeech(page, { vietnamese: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, story.chapterPath(1));
  const bar = page.getByRole('navigation', CHAPTER_NAV);
  await expect(bar.locator(':scope > *')).toHaveCount(4);
  await expect(page.locator('button[aria-label="Nghe truyện"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('button[aria-label="Nghe truyện"]')).toHaveCount(0);
});

test('nothing to listen to behind the 18+ screen', async ({ page }) => {
  await stubSpeech(page, { vietnamese: true });
  await gotoHydrated(page, mature.chapterPath(1));
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.locator('button[aria-label="Nghe truyện"]')).toHaveCount(0);
});

test('reads paragraph after paragraph, marking the one being read; pause, play, speed, stop', async ({
  page,
}) => {
  await stubSpeech(page, { vietnamese: true });
  const listen = await startListening(page, story.chapterPath(1));
  await expect(paragraphs(page).nth(0)).toHaveAttribute('data-tts-active', '');
  expect(await speaking(page)).toContain('Mở đầu chương 1.');

  await page.evaluate((text) => window.__tts.finishUntil(text), SECOND);
  await expect(paragraphs(page).nth(1)).toHaveAttribute('data-tts-active', '');
  await expect(page.locator('[data-tts-active]')).toHaveCount(1);

  await player(page).getByRole('button', { name: 'Tạm dừng' }).click();
  await expect.poll(() => speaking(page)).toBeNull();
  await player(page).getByRole('button', { name: 'Phát' }).click();
  await expect.poll(() => speaking(page)).toBe(SECOND);

  // The speed applies at once and is remembered on this device.
  await player(page).getByLabel('Tốc độ').selectOption('1.5');
  await expect.poll(() => speaking(page)).toBe(SECOND);
  expect(await page.evaluate(() => localStorage.getItem('nh:listen'))).toBe('{"rate":1.5}');

  await player(page).getByRole('button', { name: 'Dừng nghe' }).click();
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('[data-tts-active]')).toHaveCount(0);
  await expect.poll(() => speaking(page)).toBeNull();
  await expect(listen).toHaveAttribute('aria-pressed', 'false');
  await expect(listen).toBeFocused();
});

test('at the end of a chapter it goes on reading the next one, then says it is the last', async ({
  page,
}) => {
  await stubSpeech(page, { vietnamese: true });
  await startListening(page, story.chapterPath(1));
  await player(page).getByLabel('Tốc độ').selectOption('1.25');
  await page.evaluate(() => window.__tts.finishAll());

  await expect(page).toHaveURL(story.chapterPath(2));
  await expect(player(page)).toBeVisible();
  await expect(paragraphs(page).nth(0)).toHaveAttribute('data-tts-active', '');
  await expect.poll(() => speaking(page)).toContain('Mở đầu chương 2.');
  await expect(player(page).getByLabel('Tốc độ')).toHaveValue('1.25');

  // Chapter 2 is the latest.
  await page.evaluate(() => window.__tts.finishAll());
  await expect(player(page)).toContainText('Đã nghe hết chương mới nhất.');
  await expect(page.locator('[data-tts-active]')).toHaveCount(0);
  await expect(page).toHaveURL(story.chapterPath(2));
});

test('when the browser refuses to speak on the new page, one tap carries on', async ({ page }) => {
  await stubSpeech(page, { vietnamese: true, requireGesture: true });
  await startListening(page, story.chapterPath(1));
  await page.evaluate(() => window.__tts.finishAll());

  await expect(page).toHaveURL(story.chapterPath(2));
  await expect(player(page)).toContainText('Bấm “Nghe tiếp” để nghe chương này.');
  await player(page).getByRole('button', { name: 'Nghe tiếp' }).click();
  await expect.poll(() => speaking(page)).toContain('Mở đầu chương 2.');
  await expect(paragraphs(page).nth(0)).toHaveAttribute('data-tts-active', '');
});

test('arrow keys still turn the chapter while listening', async ({ page }) => {
  await stubSpeech(page, { vietnamese: true });
  await startListening(page, story.chapterPath(1));
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(story.chapterPath(2));
  await page.waitForLoadState('networkidle');
  // Turned by hand, not at the end of the text: the next chapter does not start reading.
  await expect(player(page)).toHaveCount(0);
  expect(await speaking(page)).toBeNull();
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('five controls fit the bottom bar; the player leaves the text column as it was', async ({
    page,
  }) => {
    await stubSpeech(page, { vietnamese: true });
    await gotoHydrated(page, story.chapterPath(1));
    const bar = page.getByRole('navigation', CHAPTER_NAV);
    const cells = bar.locator(':scope > *');
    await expect(cells).toHaveCount(5);
    await expect(cells.nth(3)).toHaveAccessibleName('Nghe truyện');
    const barBox = await bar.boundingBox();
    for (let i = 0; i < 5; i++) {
      const box = await cells.nth(i).boundingBox();
      expect(
        box && barBox && box.x >= barBox.x && box.x + box.width <= barBox.x + barBox.width,
      ).toBe(true);
    }
    const before = await page.locator('.reader-column').boundingBox();

    await bar.getByRole('button', LISTEN).click();
    await expect(player(page)).toBeVisible();
    const after = await page.locator('.reader-column').boundingBox();
    expect(after?.x).toBe(before?.x);
    expect(after?.width).toBe(before?.width);
    // Above the bottom bar, never over it.
    const playerBox = await player(page).boundingBox();
    expect(playerBox && barBox && playerBox.y + playerBox.height <= barBox.y).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
