import { type Page, expect, test } from '@playwright/test';

// Hậu tố riêng mỗi lần chạy để chạy lại không đụng dữ liệu cũ.
const suffix = Date.now().toString(36);
const account = {
  name: 'Người Thử E2E',
  username: `e2e_${suffix}`,
  email: `e2e-${suffix}@example.com`,
  password: 'mat-khau-e2e-123',
};

/** Chờ React hydrate xong để submit đi qua handler JS, không phải submit HTML thuần. */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test('đăng ký → thấy trạng thái đăng nhập → đăng xuất → đăng nhập lại', async ({ page }) => {
  await gotoHydrated(page, '/sign-up');
  await page.getByLabel('Tên hiển thị').fill(account.name);
  await page.getByLabel('Tên người dùng').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText(`Xin chào, ${account.name}`)).toBeVisible();
  await expect(page.getByText(`Tên người dùng: ${account.username}`)).toBeVisible();

  await page.getByRole('button', { name: 'Gửi lại mail xác thực' }).click();
  await expect(page.getByText('Đã gửi mail xác thực')).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByText('Bạn chưa đăng nhập.')).toBeVisible();

  await gotoHydrated(page, '/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText(`Xin chào, ${account.name}`)).toBeVisible();
});

test('sai mật khẩu → báo lỗi, vẫn ở trang đăng nhập', async ({ page }) => {
  await gotoHydrated(page, '/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill('sai-mat-khau-999');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu không đúng.');
  await expect(page).toHaveURL('/sign-in');
});
