import { createTestDb } from '@novel-hub/db/testing';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const { pool } = createTestDb();
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

test.describe('reports and the moderation queue', () => {
  test('a reader reports a chapter, a moderator hides it from the queue', async ({
    page,
    browser,
  }) => {
    const story = await createPublishedStory({ title: `Báo Cáo ${run}`, published: 1 });
    const chapterPath = story.chapterPath(1);

    // The reader files a report from the end of the chapter.
    await signUp(page);
    await gotoHydrated(page, chapterPath);
    await page.getByRole('button', { name: 'Báo cáo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Báo cáo chương' });
    await dialog.getByLabel('Đạo văn').check();
    await dialog.getByLabel('Mô tả thêm (không bắt buộc)').fill('Chép nguyên văn từ trang khác.');
    await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Đã gửi báo cáo. Cảm ơn bạn!');

    // A moderator, in another browser session, opens the queue from the account menu.
    const modContext = await browser.newContext();
    try {
      const modPage = await modContext.newPage();
      const mod = await signUp(modPage);
      await query("update users set role = 'mod' where email = $1", [mod.email]);
      await gotoHydrated(modPage, '/');
      await modPage.getByRole('button', { name: /Tài khoản/ }).click();
      await modPage.getByRole('menuitem', { name: 'Kiểm duyệt' }).click();
      await expect(modPage).toHaveURL(/\/moderation/);
      await expect(modPage.getByRole('heading', { name: 'Kiểm duyệt', level: 1 })).toBeVisible();

      const card = modPage.getByRole('article').filter({ hasText: story.title });
      await expect(card).toHaveCount(1);
      await expect(card.getByRole('heading', { name: 'Đạo văn' })).toBeVisible();
      await expect(card).toContainText('Chép nguyên văn từ trang khác.');
      await card.getByRole('button', { name: 'Ẩn chương', exact: true }).click();
      // Resolved: the report leaves the open queue.
      await expect(card).toHaveCount(0);
    } finally {
      await modContext.close();
    }

    // The chapter is gone for readers (no CDN in e2e), the report is resolved, and the purge and
    // search sync wait in the outbox (no worker runs in e2e).
    const res = await page.request.get(chapterPath);
    expect(res.status()).toBe(404);
    const [report] = await query<{ status: string; handled: boolean }>(
      `select r.status, r.handled_by is not null as handled
       from reports r join chapters c on c.id = r.target_id
       join stories s on s.id = c.story_id
       where s.public_id = $1`,
      [story.publicId],
    );
    expect(report).toEqual({ status: 'resolved', handled: true });
    const events = await query<{ action: string }>(
      `select payload->>'action' as action from content_events
       where processed_at is null and payload->>'entity' = 'chapter'
         and payload->>'storyId' = (select id::text from stories where public_id = $1)`,
      [story.publicId],
    );
    expect(events.map((e) => e.action)).toContain('hidden');
  });
});
