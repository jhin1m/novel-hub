import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { createChapter, createStory, publishChapterViaApi } from './helpers/stories';

test('a verified writer creates a story, finds it as a draft and renames it', async ({ page }) => {
  await signUpVerified(page);
  await gotoHydrated(page, '/write');
  await page.getByRole('link', { name: 'Tạo truyện mới' }).click();
  await expect(page).toHaveURL('/write/stories/new');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Tên truyện').fill('Kiếm Đạo Thử Nghiệm');
  await page.getByLabel('Giới thiệu').fill('Một câu chuyện viết để thử luồng tạo truyện.');
  await page.getByRole('combobox', { name: 'Thể loại chính' }).click();
  await page.getByRole('option', { name: 'Tiên hiệp' }).click();
  await page.getByRole('checkbox', { name: 'Hệ thống' }).click();
  await expect(page.getByText('Đã chọn 2/10 tag')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Truyện có nội dung 18+' }).click();
  await page.getByRole('button', { name: 'Tạo truyện' }).click();

  await expect(page).toHaveURL(/\/write\/stories\/[a-z2-9]{8}$/);
  await expect(page.getByRole('heading', { name: 'Sửa truyện' })).toBeVisible();
  await expect(page.getByLabel('Tên truyện')).toHaveValue('Kiếm Đạo Thử Nghiệm');
  await expect(page.getByRole('checkbox', { name: 'Truyện có nội dung 18+' })).toBeChecked();
  await expect(page.getByText('Chưa có bìa')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Bìa truyện Kiếm Đạo Thử Nghiệm' })).toContainText(
    'Kiếm Đạo Thử Nghiệm',
  );

  await page.getByRole('link', { name: 'Truyện của tôi' }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'Kiếm Đạo Thử Nghiệm' });
  await expect(item).toBeVisible();
  await expect(item.getByText('Nháp')).toBeVisible();
  // No uploaded cover: the default text cover shows the title.
  const cover = item.getByRole('img', { name: 'Bìa truyện Kiếm Đạo Thử Nghiệm' });
  await expect(cover).toBeVisible();
  await expect(cover).toContainText('Kiếm Đạo Thử Nghiệm');

  await item.getByRole('link', { name: 'Kiếm Đạo Thử Nghiệm' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Tên truyện').fill('Kiếm Đạo Đổi Tên');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã lưu thay đổi.')).toBeVisible();

  await gotoHydrated(page, '/write');
  await expect(page.getByRole('link', { name: 'Kiếm Đạo Đổi Tên' })).toBeVisible();
});

test('a one-character title shows a field error without sending a request', async ({ page }) => {
  await signUpVerified(page);
  await gotoHydrated(page, '/write/stories/new');
  let posted = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/v1/stories')) posted = true;
  });
  await page.getByLabel('Tên truyện').fill('A');
  await page.getByRole('button', { name: 'Tạo truyện' }).click();
  await expect(page.getByText('Tên truyện phải có từ 2 đến 150 ký tự.')).toBeVisible();
  await expect(page.getByText('Hãy chọn thể loại chính.')).toBeVisible();
  expect(posted).toBe(false);
});

test('an unverified user sees the verification notice instead of the form', async ({ page }) => {
  await signUp(page);
  await gotoHydrated(page, '/write/stories/new');
  await expect(page.getByText(/Cần xác thực email trước khi đăng truyện/)).toBeVisible();
  await expect(page.getByLabel('Tên truyện')).toHaveCount(0);
});

test('guests are asked to sign in; writing pages are not indexed', async ({ page, request }) => {
  await gotoHydrated(page, '/write');
  await expect(page.getByText('Đăng nhập để viết và quản lý truyện của bạn.')).toBeVisible();
  const html = await (await request.get('/write')).text();
  expect(html).toMatch(/<meta name="robots" content="noindex"/);
});

test('the management page sums up the story and puts the cover beside the chapters', async ({
  page,
}) => {
  await signUpVerified(page);
  const title = 'Truyện Quản Lý Thử';
  const publicId = await createStory(page, title);
  await gotoHydrated(page, `/write/stories/${publicId}`);
  const number = await createChapter(page, publicId);
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  await publishChapterViaApi(page, publicId, number, text);
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Sửa truyện' })).toBeVisible();
  // The default cover also prints the title, inside its `img`.
  await expect(page.getByRole('paragraph').filter({ hasText: title })).toBeVisible();
  const band = page.locator('section').filter({ hasText: 'chương đã đăng' });
  await expect(band.getByText('Đang ra', { exact: true })).toBeVisible();
  const terms = page.getByRole('term');
  await expect(terms.filter({ hasText: 'chương đã đăng' })).toBeVisible();
  await expect(terms.filter({ hasText: 'cập nhật' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^1$/ })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^320$/ })).toBeVisible();

  // From 1024px the cover card sits to the right of the chapter list, not under it.
  const chapters = await page.getByRole('heading', { name: 'Danh sách chương' }).boundingBox();
  const cover = await page.getByRole('heading', { name: 'Bìa truyện', exact: true }).boundingBox();
  expect(cover?.x ?? 0).toBeGreaterThan((chapters?.x ?? 0) + 300);
  expect(Math.abs((cover?.y ?? 0) - (chapters?.y ?? 0))).toBeLessThan(80);

  await page.getByRole('link', { name: 'Số liệu', exact: true }).click();
  await expect(page).toHaveURL(`/write/stories/${publicId}/stats`);
});
