import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { syncSearch } from './helpers/search';

const LIST_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';

// A word unique to this run, so results never mix with stories from other specs or runs.
const run = `r${Date.now().toString(36)}`;
let ongoing: PublishedStory;
let completed: PublishedStory;
let mature: PublishedStory;

test.beforeAll(async () => {
  ongoing = await createPublishedStory({ title: `Kiếm Đạo Tìm Thấy ${run}` });
  completed = await createPublishedStory({ title: `Đường Về Hoàn Thành ${run}` });
  mature = await createPublishedStory({
    title: `Người Lớn Ẩn ${run}`,
    isMature: true,
    warningTags: ['noi-dung-18'],
  });
  const { pool } = createTestDb();
  try {
    await pool.query(`update stories set status = 'completed' where public_id = $1`, [
      completed.publicId,
    ]);
  } finally {
    await pool.end();
  }
  await syncSearch([ongoing.publicId, completed.publicId, mature.publicId]);
});

const storyPath = (s: PublishedStory) => canonicalPath({ kind: 'story', ...s });

test('the search page is a noindex shell, cached and the same for everyone', async ({
  request,
}) => {
  for (const path of ['/search', `/search?q=${run}`, `/search?q=${run}&status=completed&page=2`]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()['cache-control'], path).toBe(LIST_CACHE);
    expect(res.headers()['x-robots-tag'], path).toBe('noindex');
    expect(res.headers()['set-cookie'], path).toBeUndefined();
    expect(await res.text(), path).toMatch(/<meta name="robots" content="noindex"/);
  }
  // Values the page cannot use are dropped by the router (an uncached redirect), not an error.
  const junk = await request.get('/search?page=abc&status=xyz&minWords=-3');
  expect(junk.status()).toBe(200);
  expect(new URL(junk.url()).pathname + new URL(junk.url()).search).toBe('/search');

  const upper = await request.get(`/SEARCH?q=${run}`, { maxRedirects: 0 });
  expect(upper.status()).toBe(301);
  expect(upper.headers()['location']).toBe(`/search?q=${run}`);
});

test('finds a story without diacritics and links to its page; 18+ stays hidden for guests', async ({
  page,
}) => {
  await gotoHydrated(page, `/search?q=${encodeURIComponent(`kiem dao ${run}`)}`);
  const results = page.getByRole('region', { name: 'Truyện' });
  const link = results.getByRole('link', { name: ongoing.title });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', storyPath(ongoing));

  await gotoHydrated(page, `/search?q=${run}`);
  await expect(results.getByRole('link', { name: completed.title })).toBeVisible();
  await expect(results.getByRole('link', { name: ongoing.title })).toBeVisible();
  await expect(page.getByText('2 truyện phù hợp')).toBeVisible();
  await expect(page.getByText(mature.title)).toHaveCount(0);
});

test('filters by status from the form, keeping the query in the URL', async ({ page }) => {
  await gotoHydrated(page, `/search?q=${run}`);
  await page.getByLabel('Tình trạng').click();
  await page.getByRole('option', { name: 'Hoàn thành' }).click();
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();

  await expect(page).toHaveURL(`/search?q=${run}&status=completed`);
  const results = page.getByRole('region', { name: 'Truyện' });
  await expect(results.getByRole('link', { name: completed.title })).toBeVisible();
  await expect(results.getByRole('link', { name: ongoing.title })).toHaveCount(0);
});

test('shows matching authors above the stories', async ({ page }) => {
  await gotoHydrated(page, `/search?q=${encodeURIComponent('Tác Giả Đọc')}`);
  const authors = page.getByRole('region', { name: 'Tác giả' });
  await expect(authors.getByRole('link').first()).toBeVisible();
  const hrefs = await authors
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.some((href) => href?.startsWith('/authors/'))).toBe(true);
});

test('a query that looks like a number is kept', async ({ page }) => {
  await gotoHydrated(page, '/search?q=1984');
  await expect(page.getByRole('searchbox', { name: 'Từ khoá' })).toHaveValue('1984');
  await expect(page.getByRole('region', { name: 'Truyện' }).getByRole('status')).toBeVisible();
});

test('the header search field leads to the search page', async ({ page }) => {
  await gotoHydrated(page, '/');
  const field = page.getByRole('searchbox', { name: 'Tìm kiếm' });
  await field.fill(run);
  await field.press('Enter');
  await expect(page).toHaveURL(`/search?q=${run}`);
  await expect(
    page.getByRole('region', { name: 'Truyện' }).getByRole('link', { name: ongoing.title }),
  ).toBeVisible();
});
