import { expect, test } from '@playwright/test';
import { awardBadges } from './helpers/badges';
import { createPublishedStory } from './helpers/content';

test('the author page shows the milestone badges the author earned', async ({ page }) => {
  const story = await createPublishedStory({ title: `Mười Chương ${Date.now()}`, published: 10 });

  await page.goto(`/authors/${story.username}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Huy hiệu' })).toHaveCount(0);

  await awardBadges();
  // The author page is cached for a while at the CDN, not by the dev server: a reload is fresh.
  await page.reload();
  const badges = page.getByRole('list', { name: 'Huy hiệu' }).getByRole('listitem');
  await expect(badges).toHaveCount(2);
  await expect(badges.nth(0)).toContainText('Chương đầu tiên');
  await expect(badges.nth(1)).toContainText('10 chương');
  await expect(badges.nth(1)).toHaveAttribute('title', 'Đã đăng 10 chương');
});
