import { type Page, expect, test } from '@playwright/test';
import { ageAccount, gotoHydrated, signUpVerified } from './helpers/accounts';
import { createStory } from './helpers/stories';

/** `count` chapters of `words` words each, with headings the import splits on. */
function chaptersText(count: number, words: number): string {
  return Array.from({ length: count }, (_, c) => {
    const body = Array.from({ length: words }, (_, i) => `chương${c}chữ${i}`).join(' ');
    return `Chương ${c + 1}: Phần ${c + 1}\n${body}`;
  }).join('\n\n');
}

async function openImport(page: Page, publicId: string) {
  await gotoHydrated(page, `/write/stories/${publicId}`);
  await page.getByRole('button', { name: 'Nhập nhiều chương' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('an author pastes three chapters and publishes them at once', async ({ page }) => {
  const account = await signUpVerified(page);
  await ageAccount(account.email, 8);
  const publicId = await createStory(page, 'Truyện Nhập Chương');
  const dialog = await openImport(page, publicId);

  await dialog.getByLabel('Văn bản').fill(chaptersText(3, 320));
  const preview = dialog.getByRole('table');
  await expect(preview.getByRole('row')).toHaveCount(4);
  await expect(preview.getByRole('row').nth(1)).toContainText('Phần 1');
  await expect(preview.getByRole('row').nth(1)).toContainText('320');

  await dialog.getByLabel('Đăng ngay').check();
  await dialog.getByRole('button', { name: 'Nhập 3 chương' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Đã nhập 3 chương.');
  await page.keyboard.press('Escape');

  const list = page.getByRole('region', { name: 'Danh sách chương' }).getByRole('listitem');
  await expect(list).toHaveCount(3);
  for (const item of await list.all()) await expect(item).toContainText('Đã đăng');

  await page.goto(`/stories/x-${publicId}/chapter-2`);
  await expect(page.getByText('chương1chữ0 chương1chữ1', { exact: false })).toBeVisible();
});

test('a .txt file fills the preview', async ({ page }) => {
  const account = await signUpVerified(page);
  await ageAccount(account.email, 8);
  const publicId = await createStory(page, 'Truyện Nhập File');
  const dialog = await openImport(page, publicId);

  await dialog.getByLabel('Chọn file .txt').setInputFiles({
    name: 'truyen.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`\uFEFF${chaptersText(2, 40)}`, 'utf-8'),
  });
  await expect(dialog.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Nhập 2 chương' })).toBeEnabled();

  await dialog.getByLabel('Chọn file .txt').setInputFiles({
    name: 'hong.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xff, 0xfe, 0x00, 0xd8]),
  });
  await expect(dialog.getByText('File không phải văn bản UTF-8.')).toBeVisible();
});

test('a new account is told it is too young to import', async ({ page }) => {
  await signUpVerified(page);
  const publicId = await createStory(page, 'Truyện Tài Khoản Mới');
  const dialog = await openImport(page, publicId);

  await dialog.getByLabel('Văn bản').fill(chaptersText(1, 10));
  await dialog.getByRole('button', { name: 'Nhập 1 chương' }).click();
  await expect(
    dialog.getByText('Tài khoản cần ít nhất 7 ngày tuổi để dùng chức năng này.'),
  ).toBeVisible();
});
