import { createTestDb } from '@novel-hub/db/testing';
import { slugify } from '@novel-hub/shared';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { chapterText } from './helpers/content';
import { createChapter, createStory, publishChapterViaApi } from './helpers/stories';

// Titles unique to this run, so lookups never match contests or stories from other runs.
const run = Date.now().toString(36);

async function sql(query: string, params: unknown[]): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(query, params);
  } finally {
    await pool.end();
  }
}

test('a moderator runs a contest: an author enters a new story, the moderator awards first place', async ({
  page,
  browser,
}) => {
  const contestTitle = `Mùa Thu ${run}`;
  const slug = slugify(contestTitle);

  // The moderator creates a contest open from now (the form's default period).
  const mod = await signUp(page);
  await sql("update users set role = 'mod' where email = $1", [mod.email]);
  await gotoHydrated(page, '/moderation?tab=contests');
  await expect(
    page
      .getByRole('navigation', { name: 'Khu kiểm duyệt' })
      .getByRole('link', { name: 'Cuộc thi' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('Tên cuộc thi').fill(contestTitle);
  await page.getByLabel('Chủ đề và thể lệ').fill('Chủ đề: mùa thu.\n\nLuật: truyện mới viết.');
  await page.getByRole('button', { name: 'Tạo cuộc thi' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo cuộc thi.' })).toBeVisible();
  const row = page.getByRole('article', { name: contestTitle });
  await expect(row.getByText('Đang diễn ra')).toBeVisible();

  // An author writes a new story and enters it from the story page.
  const authorContext = await browser.newContext();
  const storyTitle = `Truyện Dự Thi ${run}`;
  try {
    const author = await authorContext.newPage();
    await signUpVerified(author);
    const publicId = await createStory(author, storyTitle);
    const number = await createChapter(author, publicId);
    await publishChapterViaApi(author, publicId, number, chapterText(1));
    await gotoHydrated(author, `/write/stories/${publicId}`);
    const panel = author.getByRole('region', { name: 'Cuộc thi đang mở' });
    const entry = panel.getByRole('listitem').filter({ hasText: contestTitle });
    await entry.getByRole('button', { name: 'Tham gia' }).click();
    await expect(entry.getByText('Đã tham gia')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Rút khỏi cuộc thi' })).toBeVisible();
  } finally {
    await authorContext.close();
  }

  // No CDN in e2e: the public page lists the entry right away, and is publicly cacheable.
  const res = await page.goto(`/contests/${slug}`);
  expect(res?.headers()['cache-control']).toContain('public');
  await expect(page.getByRole('heading', { level: 1, name: contestTitle })).toBeVisible();
  const entries = page.getByRole('region', { name: /Bài dự thi/ });
  await expect(entries.getByRole('link', { name: storyTitle })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kết quả' })).toHaveCount(0);

  // The contest ends; the moderator awards first place.
  await sql(
    `update contests set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 second'
     where slug = $1`,
    [slug],
  );
  await gotoHydrated(page, '/moderation?tab=contests');
  await row.getByRole('button', { name: 'Bài dự thi và xếp hạng' }).click();
  const ranked = row.getByRole('listitem').filter({ hasText: storyTitle });
  await ranked.getByRole('button', { name: 'Hạng 1' }).click();
  await expect(ranked.getByRole('button', { name: 'Hạng 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.goto(`/contests/${slug}`);
  const results = page.getByRole('region', { name: 'Kết quả' });
  await expect(results.getByText('Hạng 1')).toBeVisible();
  await expect(results.getByRole('link', { name: storyTitle })).toBeVisible();

  // `/contests` lists it among the ended ones; the footer links there.
  await page.goto('/contests');
  await expect(
    page.getByRole('region', { name: 'Đã kết thúc' }).getByRole('link', { name: contestTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Cuộc thi', exact: true }),
  ).toHaveAttribute('href', '/contests');
});
