import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { syncSearch } from './helpers/search';

// A word unique to this run: sort and filter assertions only look at this spec's stories, since
// the search index is shared with every other spec.
const run = `x${Date.now().toString(36)}`;
/** Past the home listing threshold (3 chapters, 5,000 words), so the entry rows may show them. */
const LISTED = { published: 3, wordsPerChapter: 1_700 };
let completed: PublishedStory;
let longest: PublishedStory;
let mature: PublishedStory;

test.beforeAll(async () => {
  completed = await createPublishedStory({
    ...LISTED,
    title: `Khám Phá Xong ${run}`,
    status: 'completed',
  });
  longest = await createPublishedStory({
    published: 3,
    wordsPerChapter: 2_500,
    title: `Khám Phá Dài ${run}`,
  });
  mature = await createPublishedStory({
    ...LISTED,
    title: `Khám Phá Người Lớn ${run}`,
    status: 'completed',
    isMature: true,
    warningTags: ['noi-dung-18'],
  });
  await syncSearch([completed.publicId, longest.publicId, mature.publicId]);
});

const resultTitles = async (page: Page) => {
  const names = await page
    .getByRole('region', { name: 'Truyện' })
    .getByRole('link')
    .allTextContents();
  return names.filter((name) => name.includes(run));
};

test('the bare explore page opens with entry rows, never 18+, cached for everyone', async ({
  page,
  request,
}) => {
  const res = await request.get('/search', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toBe('noindex');
  expect(res.headers()['set-cookie']).toBeUndefined();
  expect(res.headers()['cache-control']).toMatch(/^public, s-maxage=(600|60)\b/);
  expect(await res.text()).not.toContain(mature.title);

  // Queries that pick nothing fold into the bare page, the only one the CDN purge clears.
  for (const variant of ['/search?page=1', '/search?fbclid=abc', '/search?sort=bogus']) {
    const folded = await request.get(variant, { maxRedirects: 0 });
    // 301 from the loader; `page=1` is already stripped by the router (an uncached 307).
    expect([301, 307], variant).toContain(folded.status());
    expect(folded.headers()['location'], variant).toBe('/search');
  }

  await gotoHydrated(page, '/search');
  await expect(page).toHaveTitle(/^Khám phá · /);
  await expect(page.getByRole('heading', { level: 1, name: 'Khám phá' })).toBeVisible();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Khám phá', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  const entry = page.getByRole('navigation', { name: 'Gợi ý khám phá' });
  await expect(entry.getByRole('region', { name: 'Vừa hoàn thành' })).toBeVisible();
  await expect(entry.getByRole('region', { name: 'Truyện mới cần độc giả' })).toBeVisible();
  await expect(entry.getByText(mature.title)).toHaveCount(0);
});

test('a status chip filters in one tap, keeping the text; one current chip per group', async ({
  page,
}) => {
  await gotoHydrated(page, `/search?q=${run}`);
  await expect(page.getByRole('navigation', { name: 'Gợi ý khám phá' })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Tình trạng' })
    .getByRole('link', { name: 'Hoàn thành', exact: true })
    .click();
  await expect(page).toHaveURL(`/search?q=${run}&status=completed`);
  await expect.poll(() => resultTitles(page)).toEqual([completed.title]);
  for (const name of ['Sắp xếp', 'Thể loại', 'Tình trạng', 'Số chữ']) {
    await expect(
      page.getByRole('group', { name }).locator('[aria-current="page"]'),
      name,
    ).toHaveCount(1);
  }
  await expect(
    page.getByRole('group', { name: 'Tình trạng' }).locator('[aria-current="page"]'),
  ).toHaveText('Hoàn thành');

  await page.getByRole('link', { name: 'Bỏ lọc' }).click();
  await expect(page).toHaveURL(`/search?q=${run}`);
});

test('"longest" sorts the results and stays in the URL', async ({ page }) => {
  await gotoHydrated(page, `/search?q=${run}`);
  await page
    .getByRole('group', { name: 'Sắp xếp' })
    .getByRole('link', { name: 'Dài nhất', exact: true })
    .click();
  await expect(page).toHaveURL(`/search?q=${run}&sort=longest`);
  await expect.poll(() => resultTitles(page)).toEqual([longest.title, completed.title]);
  await expect(
    page.getByRole('group', { name: 'Sắp xếp' }).locator('[aria-current="page"]'),
  ).toHaveText('Dài nhất');
});

test('a text search is titled "Tìm kiếm" and ranks by relevance by default', async ({ page }) => {
  await gotoHydrated(page, '/search');
  await page.getByRole('searchbox', { name: 'Từ khoá' }).fill(run);
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  await expect(page).toHaveURL(`/search?q=${run}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tìm kiếm' })).toBeVisible();
  // Updated by a client-side navigation, not only in the server render.
  await expect(page).toHaveTitle(/^Tìm kiếm · /);
  await expect(
    page.getByRole('group', { name: 'Sắp xếp' }).locator('[aria-current="page"]'),
  ).toHaveText('Liên quan nhất');
  await expect(page.getByRole('navigation', { name: 'Gợi ý khám phá' })).toHaveCount(0);
});

test('the home page\'s "see more" order opens on "recently updated", without entry rows', async ({
  page,
}) => {
  await gotoHydrated(page, '/search?sort=updated');
  await expect(page.getByRole('heading', { level: 1, name: 'Khám phá' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Sắp xếp' }).locator('[aria-current="page"]'),
  ).toHaveText('Mới cập nhật');
  await expect(page.getByRole('navigation', { name: 'Gợi ý khám phá' })).toHaveCount(0);
});
