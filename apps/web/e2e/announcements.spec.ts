import { canonicalPath } from '@novel-hub/shared';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { deliverAnnouncementNotifications } from './helpers/announcements';
import { createChapter, createStory, publishChapterViaApi } from './helpers/stories';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);
const chapterWords = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');

test.describe('author announcements', () => {
  test('the author posts an announcement, followers are told, the author page shows it until deleted', async ({
    page,
    browser,
  }) => {
    // Two accounts and five page loads, two of them the heavy management page.
    test.slow();
    const title = `Thông Báo ${run}`;
    const author = await signUpVerified(page);
    await gotoHydrated(page, '/write');
    const publicId = await createStory(page, title);
    await publishChapterViaApi(page, publicId, await createChapter(page, publicId), chapterWords);
    const storyRes = await page.request.get(`/api/v1/me/stories/${publicId}`);
    const { slug } = ((await storyRes.json()) as { story: { slug: string } }).story;
    const storyPath = canonicalPath({ kind: 'story', slug, publicId });
    const authorPath = canonicalPath({ kind: 'author', username: author.username });

    // A reader follows the story in a browser of their own.
    const readerContext = await browser.newContext();
    const reader = await readerContext.newPage();
    await signUp(reader);
    await gotoHydrated(reader, storyPath);
    await reader.getByRole('button', { name: 'Theo dõi' }).click();
    await expect(reader.getByRole('button', { name: 'Theo dõi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The author posts from the story's management page.
    await gotoHydrated(page, `/write/stories/${publicId}`);
    const manager = page.locator('#announcements');
    await manager.getByLabel('Thông báo mới').fill('Tạm nghỉ đến hết tuần, thứ Hai ra chương.');
    await manager.getByRole('button', { name: 'Đăng thông báo' }).click();
    await expect(manager.getByText('Đã đăng thông báo.')).toBeVisible();
    await expect(manager.getByText('Tạm nghỉ đến hết tuần, thứ Hai ra chương.')).toBeVisible();
    await expect(manager.getByLabel('Thông báo mới')).toHaveValue('');

    // The follower is told (the worker's job, run here twice: still one notification).
    await deliverAnnouncementNotifications(publicId);
    await deliverAnnouncementNotifications(publicId);
    await gotoHydrated(reader, '/notifications');
    const item = reader.getByRole('link', {
      name: new RegExp(`${title}: tác giả có thông báo mới`),
    });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Tạm nghỉ đến hết tuần');
    await item.click();
    await expect(reader).toHaveURL(`${storyPath}#announcements`);
    await readerContext.close();

    // The author page shows it, linked to the story.
    await gotoHydrated(page, authorPath);
    await expect(page.getByRole('heading', { name: 'Thông báo mới' })).toBeVisible();
    await expect(page.getByText('Tạm nghỉ đến hết tuần, thứ Hai ra chương.')).toBeVisible();
    await expect(page.getByRole('link', { name: `Truyện: ${title}` })).toHaveAttribute(
      'href',
      `${storyPath}#announcements`,
    );

    // Deleting it (after confirming) takes it off the author page.
    await gotoHydrated(page, `/write/stories/${publicId}`);
    await manager.getByRole('button', { name: 'Xoá' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xoá thông báo này?' });
    await dialog.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(manager.getByText('Chưa có thông báo nào.')).toBeVisible();
    await gotoHydrated(page, authorPath);
    await expect(page.getByText('Tạm nghỉ đến hết tuần, thứ Hai ra chương.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Thông báo mới' })).toHaveCount(0);
  });
});
