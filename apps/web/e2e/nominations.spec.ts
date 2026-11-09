import { canonicalPath } from '@novel-hub/shared';
import { type Page, expect, test } from '@playwright/test';
import { ageAccount, gotoHydrated, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { nominateStories } from './helpers/nominations';

const LIST_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';
const password = 'mat-khau-e2e-123';

// Titles unique to this run, so the HTML checks never match stories from other specs.
const run = Date.now().toString(36);

const storyPath = (story: PublishedStory) =>
  canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

/** Titles of this run's stories on the board, in rank order. */
async function boardTitles(page: Page): Promise<string[]> {
  const titles = await page
    .getByRole('list')
    .filter({ hasText: 'Hạng 1' })
    .getByRole('heading')
    .allTextContents();
  return titles.filter((title) => title.startsWith('Bảng Đề Cử') && title.includes(run));
}

test('a guest clicks "Đề cử", signs in, and lands back on the story page', async ({
  page,
  context,
}) => {
  const story = await createPublishedStory({ title: `Khách Đề Cử ${run}`, published: 1 });
  const account = await signUpVerified(page);
  await context.clearCookies();

  await gotoHydrated(page, storyPath(story));
  const nominate = page.getByRole('link', { name: 'Đề cử', exact: true });
  await expect(nominate).toHaveAttribute('href', /^\/sign-in\?redirect=[^&]+&reason=nominate$/);
  await nominate.click();
  await expect(page.getByRole('status')).toHaveText('Đăng nhập để đề cử truyện.');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await expect(page).toHaveURL(storyPath(story));
  // A brand-new account cannot nominate yet, and is told why.
  await expect(page.getByRole('button', { name: 'Đề cử', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Tài khoản cần ít nhất 7 ngày tuổi để dùng chức năng này.'),
  ).toBeVisible();
});

test('an account old enough spends its three weekly nominations', async ({ page }) => {
  const stories = [];
  for (let i = 1; i <= 4; i++) {
    stories.push(await createPublishedStory({ title: `Đề Cử Số ${i} ${run}`, published: 1 }));
  }
  const account = await signUpVerified(page);
  await ageAccount(account.email, 8);

  for (const [index, story] of stories.slice(0, 3).entries()) {
    await gotoHydrated(page, storyPath(story));
    await expect(page.getByText('Còn ' + String(3 - index) + ' phiếu tuần này')).toBeVisible();
    await page.getByRole('button', { name: 'Đề cử', exact: true }).click();
    await expect(
      page.getByText(`Đã đề cử. Còn ${String(2 - index)} phiếu tuần này.`),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đã đề cử', exact: true })).toBeDisabled();
  }

  await gotoHydrated(page, storyPath(stories[3]!));
  await expect(page.getByRole('button', { name: 'Hết phiếu tuần này' })).toBeDisabled();
});

test('the weekly board ranks nominated stories, without 18+, and is cached publicly', async ({
  page,
  request,
}) => {
  const first = await createPublishedStory({ title: `Bảng Đề Cử Nhất ${run}` });
  const second = await createPublishedStory({ title: `Bảng Đề Cử Nhì ${run}` });
  const mature = await createPublishedStory({
    title: `Bảng Đề Cử Người Lớn ${run}`,
    isMature: true,
    warningTags: ['noi-dung-18'],
  });
  await nominateStories([
    { publicId: second.publicId, votes: 2 },
    { publicId: first.publicId, votes: 4 },
    { publicId: mature.publicId, votes: 9 },
  ]);

  const res = await request.get('/rankings/nominations', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe(LIST_CACHE);
  expect(res.headers()['set-cookie']).toBeUndefined();
  const html = await res.text();
  expect(html).toContain(first.title);
  expect(html).not.toContain(mature.title);

  await gotoHydrated(page, '/rankings/nominations');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Được đề cử nhiều tuần này' }),
  ).toBeVisible();
  await expect.poll(() => boardTitles(page)).toEqual([first.title, second.title]);
  await expect(page.getByRole('link', { name: 'Đề cử', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The tab is on every ranking page.
  await gotoHydrated(page, '/rankings/week');
  await page.getByRole('link', { name: 'Đề cử', exact: true }).click();
  await expect(page).toHaveURL('/rankings/nominations');
});
