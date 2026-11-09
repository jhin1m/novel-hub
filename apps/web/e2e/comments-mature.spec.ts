import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { type PublishedStory, allowMatureContent, createPublishedStory } from './helpers/content';

/** Turns 18+ content back off for an account, as another tab's settings page would. */
async function disallowMatureContent(email: string): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(
      `update users set preferences = '{"showMature":false}'::jsonb where email = $1`,
      [email],
    );
  } finally {
    await pool.end();
  }
}

const isCommentsCall = (url: string) => new URL(url).pathname.startsWith('/api/v1/comments');

const commentsSection = (page: Page) => page.getByRole('region', { name: /^Bình luận/ });

test.describe('comments under an 18+ story', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ isMature: true });
  });

  test('a reader who turned 18+ on sees the comments and posts one', async ({ page }) => {
    const account = await signUpVerified(page);
    await allowMatureContent(account.email);
    await gotoHydrated(page, story.chapterPath(1));
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await page.getByRole('heading', { name: /^Bình luận/ }).scrollIntoViewIfNeeded();
    const section = commentsSection(page);
    await expect(section.getByRole('heading', { name: /^Bình luận \(\d+\)$/ })).toBeVisible();
    await section.getByLabel('Nội dung bình luận').fill('Bình luận ở truyện 18+.');
    await section.getByRole('button', { name: 'Gửi' }).click();
    await expect(
      section.getByRole('article').filter({ hasText: 'Bình luận ở truyện 18+.' }),
    ).toContainText(account.name);
  });

  test('an account without the setting is refused by the API', async ({ page }) => {
    await signUpVerified(page);
    const res = await page.request.get(`/api/v1/comments?story=${story.publicId}&chapter=1`);
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'MATURE_CONTENT_DISABLED',
    );
  });

  test('turning 18+ off elsewhere brings the warning back instead of a load error', async ({
    page,
  }) => {
    const account = await signUpVerified(page);
    await allowMatureContent(account.email);
    // A short window keeps the comments (at the end of the chapter) from loading on arrival.
    await page.setViewportSize({ width: 1280, height: 400 });
    const calls: string[] = [];
    page.on('request', (req) => {
      if (isCommentsCall(req.url())) calls.push(req.url());
    });
    await gotoHydrated(page, story.chapterPath(1));
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(calls).toEqual([]);

    await disallowMatureContent(account.email);
    const refused = page.waitForResponse(
      (res) => isCommentsCall(res.url()) && res.status() === 403,
    );
    await page.getByRole('heading', { name: /^Bình luận/ }).scrollIntoViewIfNeeded();
    await refused;

    const gate = page.getByRole('alertdialog');
    await expect(gate.getByRole('heading', { name: 'Truyện có nội dung 18+' })).toBeVisible();
    await expect(page.getByText('Không tải được bình luận.')).toHaveCount(0);
  });
});
