import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
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

const isRatingsCall = (url: string) => new URL(url).pathname.startsWith('/api/v1/ratings');

const storyPath = (story: { slug: string; publicId: string }) =>
  `/stories/${story.slug}-${story.publicId}`;

/** Scrolls to the ratings section and waits until it has loaded (summary or empty state). */
async function scrollToRatings(page: Page) {
  const section = page.getByRole('region', { name: 'Đánh giá', exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText(/lượt đánh giá|Chưa có đánh giá nào/)).toBeVisible();
  return section;
}

test.describe('story ratings', () => {
  test('a verified reader rates with a review, edits it, and the cached page never carries it', async ({
    page,
  }) => {
    // Enough chapters to push the section well below the fold.
    const story = await createPublishedStory({ title: `Đánh Giá ${run}`, published: 15 });
    const path = storyPath(story);
    await signUpVerified(page);

    await page.setViewportSize({ width: 1280, height: 400 });
    const calls: string[] = [];
    page.on('request', (req) => {
      if (isRatingsCall(req.url())) calls.push(req.url());
    });
    const html = await page.request.get(path);
    expect(html.headers()['cache-control']).toContain('public');
    expect(html.headers()['set-cookie']).toBeUndefined();
    await gotoHydrated(page, path);
    expect(calls).toEqual([]);

    const section = await scrollToRatings(page);
    await expect(section).toContainText('Chưa có đánh giá nào');
    await section.getByRole('radio', { name: '4 sao' }).check({ force: true });
    await section.getByLabel('Review (không bắt buộc)').fill('Truyện cuốn, văn mượt.');
    await section.getByRole('button', { name: 'Lưu đánh giá' }).click();
    await expect(section.getByText('Đã lưu đánh giá.')).toBeVisible();
    await expect(section.getByText('1 lượt đánh giá')).toBeVisible();
    await expect(section.getByText('4,0', { exact: true })).toBeVisible();
    await expect(section.getByRole('article').filter({ hasText: 'Truyện cuốn' })).toBeVisible();

    await section.getByRole('radio', { name: '5 sao' }).check({ force: true });
    await section.getByRole('button', { name: 'Lưu đánh giá' }).click();
    await expect(section.getByText('5,0', { exact: true })).toBeVisible();
    await expect(section.getByText('1 lượt đánh giá')).toBeVisible();
    expect(await (await page.request.get(path)).text()).not.toContain('Truyện cuốn');

    // After a reload the form starts from the saved rating.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToRatings(page);
    await expect(section.getByRole('radio', { name: '5 sao' })).toBeChecked();
    await expect(section.getByLabel('Review (không bắt buộc)')).toHaveValue(
      'Truyện cuốn, văn mượt.',
    );

    await section.getByRole('button', { name: 'Xoá đánh giá' }).click();
    await page
      .getByRole('dialog', { name: 'Xoá đánh giá của bạn?' })
      .getByRole('button', { name: 'Xác nhận' })
      .click();
    await expect(section).toContainText('Chưa có đánh giá nào');
    await expect(section.getByRole('radio', { name: '5 sao' })).not.toBeChecked();
    await expect(section.getByLabel('Review (không bắt buộc)')).toHaveValue('');
  });

  test('the author sees the ratings without a form, a guest is sent to sign in', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Tác Giả Xem ${run}`, published: 1 });
    await gotoHydrated(page, storyPath(story));
    let section = await scrollToRatings(page);
    await expect(section.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    await expect(section.getByRole('radio')).toHaveCount(0);

    const author = await signUpVerified(page);
    await query(
      'update stories set author_id = (select id from users where email = $1) where public_id = $2',
      [author.email, story.publicId],
    );
    await gotoHydrated(page, storyPath(story));
    section = await scrollToRatings(page);
    await expect(section.getByRole('radio')).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Lưu đánh giá' })).toHaveCount(0);
  });

  test('a moderator hides a reported review: it leaves the summary and its writer sees it hidden', async ({
    page,
    browser,
  }) => {
    const story = await createPublishedStory({ title: `Ẩn Review ${run}`, published: 1 });
    const path = storyPath(story);
    const body = `Review rác ${run}`;

    await signUpVerified(page);
    await gotoHydrated(page, path);
    const section = await scrollToRatings(page);
    await section.getByRole('radio', { name: '1 sao' }).check({ force: true });
    await section.getByLabel('Review (không bắt buộc)').fill(body);
    await section.getByRole('button', { name: 'Lưu đánh giá' }).click();
    await expect(section.getByText('1 lượt đánh giá')).toBeVisible();

    const others = await browser.newContext();
    try {
      const reporter = await others.newPage();
      await signUp(reporter);
      await gotoHydrated(reporter, path);
      const reporterSection = await scrollToRatings(reporter);
      const review = reporterSection.getByRole('article').filter({ hasText: body });
      await review.getByRole('button', { name: 'Báo cáo' }).click();
      const dialog = reporter.getByRole('dialog', { name: 'Báo cáo review' });
      await dialog.getByLabel('Spam').check();
      await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
      await expect(dialog.getByRole('status')).toHaveText('Đã gửi báo cáo. Cảm ơn bạn!');
    } finally {
      await others.close();
    }

    const modContext = await browser.newContext();
    try {
      const modPage = await modContext.newPage();
      const mod = await signUp(modPage);
      await query("update users set role = 'mod' where email = $1", [mod.email]);
      await gotoHydrated(modPage, '/moderation');
      const card = modPage.getByRole('article').filter({ hasText: body });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(story.title);
      await card.getByRole('button', { name: 'Ẩn đánh giá' }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await modContext.close();
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToRatings(page);
    await expect(section).toContainText('Chưa có đánh giá nào');
    await expect(section.getByRole('article').filter({ hasText: body })).toHaveCount(0);
    await expect(section).toContainText('Đánh giá của bạn đang bị kiểm duyệt viên ẩn');
    await expect(section.getByRole('button', { name: 'Lưu đánh giá' })).toHaveCount(0);
  });
});
