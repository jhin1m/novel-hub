import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { addPastWarnings, makeModerator, reportAccount } from './helpers/moderation';

test('a moderator warns a reported user with a note, and suggests more only from 3 warnings', async ({
  page,
  browser,
}) => {
  const offender = await signUp(page);
  await reportAccount(offender.username);
  const note = `Không đăng link quảng cáo ${Date.now().toString(36)}`;

  const modContext = await browser.newContext();
  try {
    const modPage = await modContext.newPage();
    const mod = await signUp(modPage);
    await makeModerator(mod.email);
    await gotoHydrated(modPage, '/moderation');

    const card = modPage.getByRole('article').filter({ hasText: `@${offender.username}` });
    await expect(card).toHaveCount(1);
    const warn = card.getByRole('button', { name: 'Cảnh cáo', exact: true });
    // The user reads the note, so the warning waits for one.
    await expect(warn).toBeDisabled();
    await expect(card).toContainText('Cảnh cáo cần ghi chú ở ô trên');
    await card.getByLabel('Ghi chú').fill(note);
    await warn.click();
    const dialog = modPage.getByRole('dialog', { name: `Cảnh cáo @${offender.username}?` });
    await expect(dialog).toContainText(note);
    await dialog.getByRole('button', { name: 'Xác nhận' }).click();
    // Resolved: the report leaves the open queue.
    await expect(card).toHaveCount(0);

    // The user finds the warning, with the note as its reason.
    await gotoHydrated(page, '/notifications');
    await expect(page.getByText(`Bạn nhận một cảnh cáo từ ban kiểm duyệt: ${note}`)).toBeVisible();

    // Two more in the log make three: a new report on them suggests muting or banning.
    await addPastWarnings(offender.username, mod.email, 2);
    await reportAccount(offender.username);
    await gotoHydrated(modPage, '/moderation');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('3 cảnh cáo trong 90 ngày');
    await expect(card).toContainText('Đã có từ 3 cảnh cáo trong 90 ngày');
    // Only a suggestion: the account is still active and can still be muted.
    await expect(card.getByRole('button', { name: 'Cấm bình luận' })).toBeVisible();
  } finally {
    await modContext.close();
  }
});
