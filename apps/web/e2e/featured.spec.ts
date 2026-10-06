import { createTestDb } from '@novel-hub/db/testing';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

async function makeMod(email: string): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query("update users set role = 'mod' where email = $1", [email]);
  } finally {
    await pool.end();
  }
}

test('a moderator features a story on the home page, then ends it', async ({ page }) => {
  const picked = await createPublishedStory({ title: `Nổi Bật ${run}`, published: 1 });
  // Newer than the pick, so the hero (newest stories fill it) is never the picked story.
  await createPublishedStory({ title: `Mới Hơn ${run}`, published: 1 });
  const mature = await createPublishedStory({
    title: `Người Lớn ${run}`,
    published: 1,
    isMature: true,
  });

  const mod = await signUp(page);
  await makeMod(mod.email);
  await gotoHydrated(page, '/moderation?tab=featured');
  await expect(page.getByRole('link', { name: 'Nổi bật', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // An 18+ story is refused with its own message.
  const storyInput = page.getByLabel('Link hoặc mã truyện');
  await storyInput.fill(`/stories/${mature.slug}-${mature.publicId}`);
  await page.getByRole('button', { name: 'Thêm vào nổi bật' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Truyện 18+ không được chọn vào khu Truyện nổi bật.',
  );

  // A link to the story, with the default period (from now, 7 days).
  await storyInput.fill(`http://localhost:3100/stories/${picked.slug}-${picked.publicId}`);
  await page.getByRole('button', { name: 'Thêm vào nổi bật' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã thêm' })).toBeVisible();
  const active = page.getByRole('region', { name: 'Đang trong thời gian nổi bật' });
  await expect(active.getByRole('article').filter({ hasText: picked.title })).toHaveCount(1);

  // No CDN in e2e: the home page shows the pick right away.
  await page.goto('/');
  const picks = page.getByRole('region', { name: 'Truyện nổi bật', exact: true });
  await expect(picks.getByRole('listitem').filter({ hasText: picked.title })).toHaveCount(1);
  await expect(picks.getByRole('listitem').filter({ hasText: mature.title })).toHaveCount(0);

  // Ending it now moves it to the ended group and out of the home page.
  await gotoHydrated(page, '/moderation?tab=featured');
  await active
    .getByRole('article')
    .filter({ hasText: picked.title })
    .getByRole('button', { name: 'Kết thúc ngay' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
  const ended = page.getByRole('region', { name: /Đã kết thúc/ });
  await expect(ended.getByRole('article').filter({ hasText: picked.title })).toHaveCount(1);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mới cập nhật' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Truyện nổi bật', exact: true })
      .getByRole('listitem')
      .filter({ hasText: picked.title }),
  ).toHaveCount(0);
});
