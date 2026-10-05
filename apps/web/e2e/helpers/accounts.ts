import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect } from '@playwright/test';

let counter = 0;

/** Waits for hydration so submits go through the React handlers, not a plain HTML post. */
export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Signs up through the UI; the session cookie stays on `page`. */
export async function signUp(page: Page) {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const account = {
    name: 'Tác Giả E2E',
    username: `w_${suffix}`,
    email: `writer-${suffix}@example.com`,
    password: 'mat-khau-e2e-123',
  };
  await gotoHydrated(page, '/sign-up');
  await page.getByLabel('Tên hiển thị').fill(account.name);
  await page.getByLabel('Tên người dùng').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL('/');
  return account;
}

/**
 * Signs up, then marks the email verified straight in the test database. Not through
 * `markEmailVerified`: that also deletes every session, which would sign the page out.
 */
export async function signUpVerified(page: Page) {
  const account = await signUp(page);
  const { pool } = createTestDb();
  try {
    await pool.query('update users set email_verified = true where email = $1', [account.email]);
  } finally {
    await pool.end();
  }
  return account;
}
