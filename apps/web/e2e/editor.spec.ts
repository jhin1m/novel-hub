import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { createStory } from './helpers/stories';

const editorBox = (page: Page) => page.getByRole('textbox', { name: 'Nội dung chương' });

async function typeInEditor(page: Page, text: string) {
  await editorBox(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

test('a writer adds a chapter, the draft autosaves and survives a reload', async ({ page }) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await gotoHydrated(page, `/write/stories/${publicId}`);
  await expect(page.getByText('Chưa có chương nào.')).toBeVisible();

  await page.getByRole('button', { name: 'Thêm chương' }).click();
  await expect(page).toHaveURL(`/write/stories/${publicId}/chapters/1`);
  await expect(editorBox(page)).toBeVisible();

  await typeInEditor(page, 'Lâm Phong ngồi xếp bằng');
  await expect(page.getByText('Chưa lưu')).toBeVisible();
  // Saving the title in the middle of unsaved text must not disturb autosave.
  await page.getByLabel('Tên chương').fill('Mở đầu');
  await editorBox(page).click();
  await typeInEditor(page, ' trên đỉnh núi');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('8 chữ')).toBeVisible();
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);

  await page.reload();
  await expect(editorBox(page)).toContainText('Lâm Phong ngồi xếp bằng trên đỉnh núi');
  await expect(page.getByLabel('Tên chương')).toHaveValue('Mở đầu');

  await page.getByRole('link', { name: 'Về trang truyện' }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'Chương 1' });
  await expect(item).toContainText('Mở đầu');
  await expect(item).toContainText('Nháp');
});

test('a save from another tab puts the stale tab into conflict', async ({ page, context }) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  const created = await page.request.post(`/api/v1/stories/${publicId}/chapters`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(created.status()).toBe(201);
  const url = `/write/stories/${publicId}/chapters/1`;

  const other = await context.newPage();
  await gotoHydrated(other, url);
  await gotoHydrated(page, url);

  await typeInEditor(page, 'Bản của tab thứ nhất');
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });

  await typeInEditor(other, 'Bản của tab thứ hai');
  await expect(other.getByText('Chương đang được sửa ở nơi khác.')).toBeVisible({
    timeout: 10_000,
  });
  await expect(other.getByText('Xung đột')).toBeVisible();

  await other.getByRole('button', { name: 'Tải bản mới nhất' }).click();
  await expect(editorBox(other)).toContainText('Bản của tab thứ nhất');
  await expect(other.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);
});

test('focus mode hides the toolbar and Esc leaves it', async ({ page }) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await gotoHydrated(page, `/write/stories/${publicId}`);
  await page.getByRole('button', { name: 'Thêm chương' }).click();
  await expect(editorBox(page)).toBeVisible();

  const toolbar = page.getByRole('toolbar', { name: 'Định dạng' });
  await expect(toolbar).toBeVisible();
  await page.getByRole('button', { name: 'Chế độ tập trung' }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(page.getByLabel('Tên chương')).toHaveCount(0);
  await expect(editorBox(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toolbar).toBeVisible();
});

test('a save whose response is lost is not reported as a conflict', async ({ page }) => {
  await signUpVerified(page);
  const publicId = await createStory(page);
  await gotoHydrated(page, `/write/stories/${publicId}`);
  await page.getByRole('button', { name: 'Thêm chương' }).click();
  await expect(editorBox(page)).toBeVisible();

  // The first save reaches the server, but the browser sees a gateway error.
  let dropped = false;
  await page.route('**/chapters/1/draft', async (route) => {
    if (route.request().method() !== 'PUT' || dropped) return route.fallback();
    dropped = true;
    await route.fetch();
    await route.fulfill({ status: 502, body: 'Bad Gateway' });
  });
  await typeInEditor(page, 'Câu chữ đã tới máy chủ');
  await expect(page.getByText(/Lỗi, thử lại sau 2s/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Đã lưu lúc/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Chương đang được sửa ở nơi khác.')).toHaveCount(0);
});
