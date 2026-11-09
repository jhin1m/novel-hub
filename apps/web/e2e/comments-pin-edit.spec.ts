import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

async function query(sql: string, params: unknown[]): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

/** Top-level comments on chapter 1 of `publicId`, oldest first, by the story's current author. */
async function seedComments(publicId: string, bodies: string[]) {
  for (const [i, body] of bodies.entries()) {
    await query(
      `insert into comments (chapter_id, story_id, user_id, body, created_at)
       select c.id, s.id, s.author_id, $2, now() - make_interval(mins => $3)
       from stories s join chapters c on c.story_id = s.id and c.number = 1
       where s.public_id = $1`,
      [publicId, body, bodies.length - i],
    );
  }
}

/** Hands the story to the signed-up account, so it may pin comments under it. */
async function makeAuthorOf(publicId: string, email: string) {
  await query(
    'update stories set author_id = (select id from users where email = $2) where public_id = $1',
    [publicId, email],
  );
}

async function scrollToComments(page: Page) {
  await page.getByRole('heading', { name: /^Bình luận/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /^Bình luận \(\d+\)$/ })).toBeVisible();
}

test.describe('pinned and edited comments', () => {
  test('a reader edits their comment and it shows as edited', async ({ page }) => {
    const story = await createPublishedStory({ title: `Sửa Bình Luận ${run}`, published: 1 });
    await signUpVerified(page);
    await gotoHydrated(page, story.chapterPath(1));
    await scrollToComments(page);

    const section = page.getByRole('region', { name: /^Bình luận/ });
    await section.getByLabel('Nội dung bình luận').fill('Bản đầu tiên');
    await section.getByRole('button', { name: 'Gửi' }).click();
    const comment = section.getByRole('article').filter({ hasText: 'Bản đầu tiên' });
    await expect(comment).toBeVisible();
    await expect(comment).not.toContainText('đã sửa');

    await comment.getByRole('button', { name: 'Sửa' }).click();
    const editor = section.getByLabel('Sửa bình luận');
    await expect(editor).toHaveValue('Bản đầu tiên');
    await editor.fill('Bản đã sửa lại');
    await section.getByRole('button', { name: 'Lưu' }).click();
    const edited = section.getByRole('article').filter({ hasText: 'Bản đã sửa lại' });
    await expect(edited).toContainText('đã sửa');
    await expect(section.getByText('Bản đầu tiên')).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToComments(page);
    await expect(edited).toContainText('đã sửa');
  });

  test('the story’s author pins up to three comments on top, then unpins one', async ({ page }) => {
    const story = await createPublishedStory({ title: `Ghim Bình Luận ${run}`, published: 1 });
    const bodies = ['Thứ nhất', 'Thứ hai', 'Thứ ba', 'Thứ tư'].map((b) => `${b} ${run}`);
    await seedComments(story.publicId, bodies);
    const account = await signUpVerified(page);
    await makeAuthorOf(story.publicId, account.email);
    await gotoHydrated(page, story.chapterPath(1));
    await scrollToComments(page);

    const section = page.getByRole('region', { name: /^Bình luận/ });
    const comment = (body: string) => section.getByRole('article').filter({ hasText: body });
    const [first, second, third, fourth] = bodies as [string, string, string, string];
    // Newest first before any pin.
    await expect(section.getByRole('article').first()).toContainText(fourth);

    for (const body of [first, second, third]) {
      await comment(body).getByRole('button', { name: 'Ghim', exact: true }).click();
      await expect(comment(body)).toContainText('Đã ghim');
    }
    // The pinned ones lead the list, in the order they were pinned.
    await expect(section.getByRole('article').first()).toContainText(first);
    await expect(section.getByRole('article').nth(3)).toContainText(fourth);

    await comment(fourth).getByRole('button', { name: 'Ghim', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Chỉ ghim được tối đa 3 bình luận');
    await expect(comment(fourth)).not.toContainText('Đã ghim');

    await comment(second).getByRole('button', { name: 'Bỏ ghim' }).click();
    await expect(comment(second)).not.toContainText('Đã ghim');
    await comment(fourth).getByRole('button', { name: 'Ghim', exact: true }).click();
    await expect(comment(fourth)).toContainText('Đã ghim');
    await expect(section.getByRole('alert')).toHaveCount(0);
  });
});
