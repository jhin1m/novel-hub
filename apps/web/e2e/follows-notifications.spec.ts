import { canonicalPath } from '@novel-hub/shared';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import {
  createPublishedStory,
  deliverChapterNotifications,
  publishNextChapter,
} from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

test.describe('follows and notifications', () => {
  test('a reader follows a story and its author, is told of a new chapter once, then unfollows', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Theo Dõi ${run}`, published: 1 });
    const storyPath = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
    const authorPath = canonicalPath({ kind: 'author', username: story.username });

    // The cached story page is the same for everyone, follow button included.
    const html = await page.request.get(storyPath);
    expect(html.headers()['cache-control']).toContain('public');
    expect(html.headers()['set-cookie']).toBeUndefined();

    await signUp(page);
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();

    await gotoHydrated(page, storyPath);
    const followStory = page.getByRole('button', { name: 'Theo dõi' });
    await expect(followStory).toHaveAttribute('aria-pressed', 'false');
    await followStory.click();
    await expect(followStory).toHaveAttribute('aria-pressed', 'true');

    await gotoHydrated(page, authorPath);
    const followAuthor = page.getByRole('button', { name: 'Theo dõi' });
    await followAuthor.click();
    await expect(followAuthor).toHaveAttribute('aria-pressed', 'true');

    // Following both the story and its author still makes one notification.
    const chapter2 = await publishNextChapter(story);
    await deliverChapterNotifications(chapter2);
    await deliverChapterNotifications(chapter2);
    await page.reload();
    const bell = header.getByRole('link', { name: 'Thông báo (1 chưa đọc)' });
    await expect(bell).toBeVisible();

    await bell.click();
    await expect(page).toHaveURL('/notifications');
    const item = page.getByRole('link', {
      name: new RegExp(`Theo Dõi ${run} có chương mới: Chương 2`),
    });
    await expect(item).toHaveAttribute('href', chapter2);
    await item.click();
    await expect(page).toHaveURL(chapter2);
    // The reading page has its own toolbar; the site header shows the count is back to zero.
    await gotoHydrated(page, '/');
    await expect(header.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();

    // Unfollowing both: the next chapter tells this reader nothing.
    await gotoHydrated(page, storyPath);
    await page.getByRole('button', { name: 'Theo dõi' }).click();
    await expect(page.getByRole('button', { name: 'Theo dõi' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await gotoHydrated(page, authorPath);
    await page.getByRole('button', { name: 'Theo dõi' }).click();
    await expect(page.getByRole('button', { name: 'Theo dõi' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await deliverChapterNotifications(await publishNextChapter(story));
    await gotoHydrated(page, '/notifications');
    await expect(header.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /có chương mới/ })).toHaveCount(1);
  });

  test('guests see no bell and are sent to sign in to follow', async ({ page }) => {
    const story = await createPublishedStory({ title: `Khách Theo Dõi ${run}`, published: 1 });
    await gotoHydrated(
      page,
      canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId }),
    );
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    await expect(header.getByRole('link', { name: /^Thông báo/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Theo dõi' })).toHaveAttribute('href', '/sign-in');
  });
});
