import { type Page, expect, test } from '@playwright/test';

// A suffix per run, so reruns never collide with earlier data.
const suffix = Date.now().toString(36);
const account = {
  name: 'Người Thử E2E',
  username: `e2e_${suffix}`,
  email: `e2e-${suffix}@example.com`,
  password: 'mat-khau-e2e-123',
};

/** Waits for hydration so submits go through the React handlers, not a plain HTML post. */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test('sign up → see the account on settings → sign out → sign in again', async ({ page }) => {
  await gotoHydrated(page, '/sign-up');
  await page.getByLabel('Tên hiển thị').fill(account.name);
  await page.getByLabel('Tên người dùng').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  await expect(page).toHaveURL('/');
  // The home page is cached for everyone: the account shows in the header and on /settings.
  await expect(page.getByRole('button', { name: `Tài khoản: ${account.name}` })).toBeVisible();
  await gotoHydrated(page, '/settings');
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
  await gotoHydrated(page, '/settings');
  await expect(page.getByText(`Xin chào, ${account.name}`)).toBeVisible();
});

test('a wrong password shows an error and stays on the sign-in page', async ({ page }) => {
  await gotoHydrated(page, '/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill('sai-mat-khau-999');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu không đúng.');
  await expect(page).toHaveURL('/sign-in');
});
