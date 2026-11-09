import { expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

const run = Date.now().toString(36);
const lastParagraph = `Đoạn cuối chương để bôi chọn ${run}.`;
const authorNote = `Lời nhắn của tác giả ${run}.`;

test('triple-clicking the last paragraph selects only that paragraph', async ({ page }) => {
  const story = await createPublishedStory({
    title: `Bôi Chọn Đoạn ${run}`,
    published: 2,
    authorNote,
    extraParagraphs: [lastParagraph],
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUpVerified(page);
  await gotoHydrated(page, story.chapterPath(1));

  const paragraph = page.locator('.reader-content p[data-pid]').last();
  await expect(paragraph).toHaveText(lastParagraph);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click({ clickCount: 3 });

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected.trim()).toBe(lastParagraph);
  expect(selected).not.toContain(authorNote);
  expect(selected).not.toContain('Chương tiếp');
  // The selection is still a paragraph of the text, so it can be commented on.
  await expect(page.getByRole('button', { name: 'Bình luận đoạn này' })).toBeVisible();

  // The author's note can still be selected and copied on its own.
  const note = page.locator('footer').getByText(authorNote);
  await note.click({ clickCount: 3 });
  const noteSelection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(noteSelection).toContain(authorNote);
  expect(noteSelection).not.toContain('Chương tiếp');
});
