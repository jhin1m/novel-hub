import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, allowMatureContent, createPublishedStory } from './helpers/content';
import { rankStories } from './helpers/rankings';

const LIST_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';

// Titles unique to this run, so the HTML checks never match stories from other specs.
const run = Date.now().toString(36);
let first: PublishedStory;
let second: PublishedStory;
let third: PublishedStory;
let mature: PublishedStory;

test.beforeAll(async () => {
  third = await createPublishedStory({ title: `Hạng Ba ${run}` });
  first = await createPublishedStory({ title: `Hạng Nhất ${run}` });
  second = await createPublishedStory({ title: `Hạng Nhì ${run}` });
  mature = await createPublishedStory({
    title: `Hạng Người Lớn ${run}`,
    isMature: true,
    warningTags: ['noi-dung-18'],
  });
  await rankStories([
    { publicId: first.publicId, readers: 50 },
    { publicId: second.publicId, readers: 30 },
    { publicId: third.publicId, readers: 10 },
    { publicId: mature.publicId, readers: 90 },
  ]);
});

/** Titles of the ranked stories on the page, in rank order. */
async function rankedTitles(page: Page): Promise<string[]> {
  return page
    .getByRole('list')
    .filter({ hasText: 'Hạng 1' })
    .getByRole('heading')
    .allTextContents();
}

test('the weekly ranking lists stories by readers, without 18+, and is cached publicly', async ({
  page,
  request,
}) => {
  const res = await request.get('/rankings/week', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe(LIST_CACHE);
  expect(await res.text()).not.toContain(mature.title);

  await gotoHydrated(page, '/rankings/week');
  await expect(page.getByRole('heading', { level: 1, name: 'Bảng xếp hạng' })).toBeVisible();
  await expect.poll(() => rankedTitles(page)).toEqual([first.title, second.title, third.title]);
  await expect(page.getByRole('link', { name: 'Tuần' })).toHaveAttribute('aria-current', 'page');

  // Another period through the tabs.
  await page.getByRole('link', { name: 'Ngày' }).click();
  await expect(page).toHaveURL('/rankings/day');
  await expect(page.getByRole('link', { name: 'Ngày' })).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => rankedTitles(page)).toEqual([first.title, second.title, third.title]);
  // No readers the week before: every story with 20+ readers this week is rising.
  await page.getByRole('link', { name: 'Đang lên' }).click();
  await expect(page).toHaveURL('/rankings/rising');
  await expect.poll(() => rankedTitles(page)).toEqual([first.title, second.title]);
});

test('/rankings redirects to the weekly ranking; an unknown period is a 404', async ({
  request,
}) => {
  const res = await request.get('/rankings', { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe('/rankings/week');
  expect((await request.get('/rankings/abc', { maxRedirects: 0 })).status()).toBe(404);
});

test('a reader who allowed 18+ content sees 18+ stories ranked too', async ({ page }) => {
  const account = await signUp(page);
  await allowMatureContent(account.email);
  await gotoHydrated(page, '/rankings/week');
  await expect
    .poll(() => rankedTitles(page))
    .toEqual([mature.title, first.title, second.title, third.title]);
});

test('the footer and the desktop header link to the rankings', async ({ page }) => {
  await gotoHydrated(page, '/');
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Bảng xếp hạng' }),
  ).toHaveAttribute('href', '/rankings/week');
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Bảng xếp hạng' }),
  ).toHaveAttribute('href', '/rankings/week');
});
