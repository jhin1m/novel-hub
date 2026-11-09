import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';
import {
  addLastMonthReaders,
  endFeaturedSlots,
  makeModerator,
  removeLastMonthReaders,
} from './helpers/moderation';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

test('a moderator features a story suggested from last month’s ranking', async ({ page }) => {
  const story = await createPublishedStory({ title: `Gợi Ý ${run}`, published: 1 });
  // Far ahead of any other spec's stats; ties go to the newest story, this one.
  await addLastMonthReaders(story.publicId, 1_000_000);

  const mod = await signUp(page);
  await makeModerator(mod.email);
  try {
    await gotoHydrated(page, '/moderation?tab=featured');
    const suggestions = page.getByRole('region', { name: /Gợi ý từ xếp hạng tháng/ });
    const row = suggestions.getByRole('listitem').filter({ hasText: story.title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('1000000 người đọc');

    // The suggestion only fills the form in; the moderator still creates the slot.
    await row.getByRole('link', { name: 'Đưa vào nổi bật' }).click();
    await expect(page).toHaveURL(new RegExp(`story=${story.publicId}`));
    await expect(page.getByLabel('Link hoặc mã truyện')).toHaveValue(story.publicId);
    await page.getByRole('button', { name: 'Thêm vào nổi bật' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã thêm' })).toBeVisible();
    // The prefill leaves the URL, so a reload starts from an empty form.
    await expect(page).not.toHaveURL(/story=/);

    // A running slot takes it out of the suggestions.
    await expect(row).toHaveCount(0);
    const active = page.getByRole('region', { name: 'Đang trong thời gian nổi bật' });
    await expect(active.getByRole('article').filter({ hasText: story.title })).toHaveCount(1);
  } finally {
    await endFeaturedSlots(story.publicId);
    await removeLastMonthReaders(story.publicId);
  }
});
