import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { createChapter, createStory, publishChapterViaApi } from './helpers/stories';

const editorBox = (page: Page) => page.getByRole('textbox', { name: 'Nội dung chương' });
// Open sheets and dialogs hide the page from the accessibility tree, hence a CSS locator.
const editorContent = (page: Page) => page.locator('.chapter-editor-content');
const header = (page: Page) => page.getByRole('banner');
const words = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');

/** A chapter published twice: first with `cũ…` words, then with `mới…` words. */
async function chapterPublishedTwice(page: Page): Promise<string> {
  await signUpVerified(page);
  const publicId = await createStory(page);
  const number = await createChapter(page, publicId);
  await publishChapterViaApi(page, publicId, number, words(320, 'cũ'));
  await publishChapterViaApi(page, publicId, number, words(320, 'mới'));
  await gotoHydrated(page, `/write/stories/${publicId}/chapters/${number}`);
  await expect(editorBox(page)).toContainText('mới0');
  return publicId;
}

/** Opens the history and restores the older of the two versions, confirming the dialog. */
async function restoreOldest(page: Page) {
  await page.getByRole('button', { name: 'Lịch sử' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lịch sử phiên bản' });
  const items = sheet.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Đang đăng');
  await items.last().getByRole('button').click();
  await expect(sheet.locator('.chapter-preview-content')).toContainText('cũ0 cũ1');
  await sheet.getByRole('button', { name: 'Khôi phục vào bản nháp' }).click();
  const confirm = page.getByRole('dialog', { name: 'Khôi phục phiên bản này?' });
  await expect(confirm).toContainText('Bản nháp hiện tại sẽ được lưu vào lịch sử phiên bản');
  await confirm.getByRole('button', { name: 'Khôi phục', exact: true }).click();
  return sheet;
}

test('a writer restores an older version into the draft; the published chapter stays', async ({
  page,
}) => {
  await chapterPublishedTwice(page);
  const sheet = await restoreOldest(page);

  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Đã khôi phục bản lúc \d{2}:\d{2} \d{2}\/\d{2}\.$/)).toBeVisible();
  await expect(editorBox(page)).toContainText('cũ0');
  await expect(editorBox(page)).not.toContainText('mới0');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible();
  await expect(header(page).getByText('Đã đăng', { exact: true })).toBeVisible();
  await expect(page.getByText('Có thay đổi chưa đăng')).toBeVisible();

  await page.reload();
  await expect(editorBox(page)).toContainText('cũ0');
  await expect(header(page).getByText('Đã đăng', { exact: true })).toBeVisible();
  await expect(page.getByText('Có thay đổi chưa đăng')).toBeVisible();
  // The restored draft matches the server, so there is no local copy to offer back.
  await expect(page.getByText(/^Có bản chưa lưu trên máy này/)).toHaveCount(0);
});

test('keystrokes typed right before a restore are saved first and do not cause a conflict', async ({
  page,
}) => {
  await chapterPublishedTwice(page);
  const savedTyping = page.waitForRequest(
    (req) =>
      req.method() === 'PUT' && req.url().endsWith('/draft') && /gõthêm/.test(req.postData() ?? ''),
  );

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/revisions/*/restore', async (route) => {
    await held;
    await route.continue();
  });

  await editorBox(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' gõthêm');
  // Restore well before the 2-second autosave debounce fires.
  const sheet = await restoreOldest(page);
  await savedTyping;
  await expect(editorContent(page)).toHaveAttribute('contenteditable', 'false');
  release();

  await expect(sheet).toBeHidden();
  await expect(editorBox(page)).toHaveAttribute('contenteditable', 'true');
  await expect(editorBox(page)).toContainText('cũ0');
  await expect(editorBox(page)).not.toContainText('gõthêm');
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);
  await page.unroute('**/revisions/*/restore');

  // The replaced draft, typing included, is kept as the newest version.
  await page.getByRole('button', { name: 'Lịch sử' }).click();
  const history = page.getByRole('dialog', { name: 'Lịch sử phiên bản' });
  const items = history.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.first()).not.toContainText('Đang đăng');
  await expect(items.nth(1)).toContainText('Đang đăng');
  await items.first().getByRole('button').click();
  await expect(history.locator('.chapter-preview-content')).toContainText('gõthêm');
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();

  // Autosave continues from the restored version.
  await editorBox(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' sau');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(editorBox(page)).toContainText('sau');
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);
});

test('a restore refused because another tab saved shows the conflict; keeping mine saves the editor', async ({
  page,
}) => {
  const publicId = await chapterPublishedTwice(page);
  // Another tab saves on top of the version this editor holds.
  const path = `/api/v1/stories/${publicId}/chapters/1/draft`;
  const latest = (await (await page.request.get(path)).json()) as { updatedAt: string };
  const other = await page.request.put(path, {
    data: {
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text: 'tabkhác' }] },
        ],
      },
      baseUpdatedAt: latest.updatedAt,
    },
  });
  expect(other.status()).toBe(200);

  const sheet = await restoreOldest(page);
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toBeVisible();
  await expect(editorBox(page)).toContainText('mới0');

  await page.getByRole('button', { name: 'Giữ bản của tôi' }).click();
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible();
  await page.reload();
  await expect(editorBox(page)).toContainText('mới0');
  await expect(editorBox(page)).not.toContainText('tabkhác');
});
