import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { createStory } from './helpers/stories';

const editorBox = (page: Page) => page.getByRole('textbox', { name: 'Nội dung chương' });
const header = (page: Page) => page.getByRole('banner');

/** Puts the caret at the end of the chapter. `End` only reaches the end of the wrapped visual line on Linux. */
async function caretToEnd(page: Page) {
  await editorBox(page).click();
  await editorBox(page).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
}

/** Creates chapter 1 and stores a draft of `words` words through the API, as autosave would. */
async function chapterWithWords(page: Page, publicId: string, words: number) {
  // A body-less POST counts as a form submit for the CSRF check, which wants a same-origin header.
  const created = await page.request.post(`/api/v1/stories/${publicId}/chapters`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(created.status()).toBe(201);
  const { chapter } = (await created.json()) as { chapter: { draftUpdatedAt: string } };
  const text = Array.from({ length: words }, (_, i) => `chữ${i}`).join(' ');
  const saved = await page.request.put(`/api/v1/stories/${publicId}/chapters/1/draft`, {
    data: {
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
      },
      baseUpdatedAt: chapter.draftUpdatedAt,
    },
  });
  expect(saved.status()).toBe(200);
  await gotoHydrated(page, `/write/stories/${publicId}/chapters/1`);
  await expect(editorBox(page)).toBeVisible();
}

test('a writer publishes a chapter, then updates it; the editor is locked while publishing', async ({
  page,
}) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await chapterWithWords(page, publicId, 320);
  await expect(header(page).getByText('Nháp', { exact: true })).toBeVisible();

  // Hold the publish response to observe the editor during the request.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/chapters/1/publish', async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole('button', { name: 'Đăng', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('320 chữ');
  await dialog.getByRole('button', { name: 'Đăng chương' }).click();
  // The modal hides the rest of the page from the accessibility tree, hence a CSS locator.
  await expect(page.locator('.chapter-editor-content')).toHaveAttribute('contenteditable', 'false');
  release();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Đã đăng chương.')).toBeVisible();
  await expect(header(page).getByText('Đã đăng', { exact: true })).toBeVisible();
  await expect(editorBox(page)).toHaveAttribute('contenteditable', 'true');
  await page.unroute('**/chapters/1/publish');

  // The server assigned the paragraph id; the next edit saves on top of that version.
  await caretToEnd(page);
  await page.keyboard.type(' thêm');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Có thay đổi chưa đăng')).toBeVisible();
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cập nhật' }).click();
  await expect(page.getByText('Đã cập nhật chương.')).toBeVisible();
  await expect(page.getByText('Có thay đổi chưa đăng')).toHaveCount(0);

  await page.reload();
  await expect(editorBox(page)).toContainText('thêm');
  await expect(header(page).getByText('Đã đăng', { exact: true })).toBeVisible();
});

test('short chapters cannot be published; scheduling, unscheduling and deleting', async ({
  page,
}) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await chapterWithWords(page, publicId, 299);
  const publish = page.getByRole('button', { name: 'Đăng', exact: true });
  await expect(publish).toBeDisabled();
  const reason = page.getByText('Cần ít nhất 300 chữ để đăng, còn thiếu 1 chữ.');
  await expect(reason).toBeVisible();
  const reasonId = await reason.getAttribute('id');
  expect(reasonId).toBeTruthy();
  await expect(publish).toHaveAttribute('aria-describedby', reasonId ?? '');

  // The locked button stays in the tab order so the reason is read, but it does not open.
  await publish.focus();
  await expect(publish).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await caretToEnd(page);
  await page.keyboard.type(' đủ');
  await expect(page.getByText('300 chữ', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Cần ít nhất/)).toHaveCount(0);
  await expect(publish).toBeEnabled();
  await expect(publish).not.toHaveAttribute('aria-describedby');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Đăng', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Hẹn giờ').check();
  await expect(dialog.getByLabel('Giờ đăng')).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Hẹn giờ đăng' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Hẹn đăng lúc/)).toBeVisible();
  await expect(header(page).getByText('Hẹn giờ', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Huỷ hẹn' }).click();
  await expect(page.getByText('Đã huỷ hẹn giờ, chương trở về nháp.')).toBeVisible();
  await expect(header(page).getByText('Nháp', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Hẹn đăng lúc/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Về trang truyện' }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'Chương 1' });
  await expect(item).toContainText('Nháp');
  await expect(item.getByRole('link')).toHaveAccessibleName('Chương 1: Chưa đặt tên');
  await item.getByRole('button', { name: 'Xoá chương 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá chương' }).click();
  await expect(page.getByText('Chưa có chương nào.')).toBeVisible();
});

test('below the wide layout the publish-lock reason sits under the header row', async ({
  page,
}) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await page.setViewportSize({ width: 800, height: 900 });
  await chapterWithWords(page, publicId, 1);

  for (const viewport of [
    { width: 800, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const reason = header(page).getByText('Cần ít nhất 300 chữ để đăng, còn thiếu 299 chữ.');
    await expect(reason).toBeVisible();
    await expect(header(page).getByRole('button', { name: 'Đăng', exact: true })).toBeVisible();
    const title = header(page).getByText('Chương 1', { exact: true });
    await expect(title).toBeVisible();
    const titleBox = await title.boundingBox();
    const reasonBox = await reason.boundingBox();
    expect(titleBox?.width ?? 0).toBeGreaterThan(0);
    // The reason takes its own line below the row holding the chapter heading.
    expect(reasonBox?.y ?? 0).toBeGreaterThanOrEqual((titleBox?.y ?? 0) + (titleBox?.height ?? 0));
  }
});
