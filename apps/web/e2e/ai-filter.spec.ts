import { createTestDb } from '@novel-hub/db/testing';
import { expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { syncSearch } from './helpers/search';

const LIST_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';

/** A genre no other spec tags, so both stories sit on the first page of its tag page. */
const TAG = 'trinh-tham';
const TAG_PATH = `/tags/${TAG}`;

// A word unique to this run, so results never mix with stories from other specs or runs.
const run = `r${Date.now().toString(36)}`;
let human: PublishedStory;
let assisted: PublishedStory;

test.beforeAll(async () => {
  human = await createPublishedStory({ title: `Tự Tay Viết ${run}` });
  assisted = await createPublishedStory({ title: `Máy Giúp Viết ${run}` });
  const { pool } = createTestDb();
  try {
    await pool.query(`update stories set is_ai_assisted = true where public_id = $1`, [
      assisted.publicId,
    ]);
    await pool.query(
      `insert into story_tags (story_id, tag_id)
       select s.id, t.id from stories s, tags t where s.public_id = any($1) and t.slug = $2`,
      [[human.publicId, assisted.publicId], TAG],
    );
  } finally {
    await pool.end();
  }
  await syncSearch([human.publicId, assisted.publicId]);
});

test('the AI switch hides stories written with AI in one tap and keeps the filter in the URL', async ({
  page,
}) => {
  await gotoHydrated(page, `/search?q=${run}`);
  const results = page.getByRole('region', { name: 'Truyện' });
  await expect(results.getByRole('link', { name: assisted.title })).toBeVisible();
  // The card says the story was written with AI.
  await expect(results.getByText('Có dùng AI', { exact: true })).toHaveCount(1);

  const toggle = page.getByRole('switch', { name: 'Ẩn truyện có dùng AI' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();

  await expect(page).toHaveURL(`/search?q=${run}&noAi=1`);
  await expect(results.getByRole('link', { name: human.title })).toBeVisible();
  await expect(results.getByRole('link', { name: assisted.title })).toHaveCount(0);

  // Opened from the URL, the switch starts on and the filter applies.
  await gotoHydrated(page, `/search?q=${run}&noAi=1`);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(results.getByRole('link', { name: human.title })).toBeVisible();
  await expect(results.getByRole('link', { name: assisted.title })).toHaveCount(0);

  // Like any switch, Space turns it back off.
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(`/search?q=${run}`);
  await expect(results.getByRole('link', { name: assisted.title })).toBeVisible();
});

test('the filtered tag page is its own cached, noindex page without AI stories', async ({
  request,
}) => {
  const plain = await request.get(TAG_PATH, { maxRedirects: 0 });
  expect(plain.status()).toBe(200);
  const plainHtml = await plain.text();
  expect(plainHtml).toContain(assisted.title);
  expect(plainHtml).toContain(human.title);
  expect(plainHtml).toContain(`href="${TAG_PATH}?noAi=1"`);

  const res = await request.get(`${TAG_PATH}?noAi=1`, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe(LIST_CACHE);
  expect(res.headers()['set-cookie']).toBeUndefined();
  const html = await res.text();
  expect(html).toContain(human.title);
  expect(html).not.toContain(assisted.title);
  expect(html).toMatch(/<meta name="robots" content="noindex"/);
  expect(html).toContain(`href="${TAG_PATH}"`);
});

test('other spellings of the tag filter redirect to the canonical URL', async ({ request }) => {
  for (const [query, location] of [
    ['?noAi=true', `${TAG_PATH}?noAi=1`],
    ['?noAi=0', TAG_PATH],
    ['?page=1&noAi=1', `${TAG_PATH}?noAi=1`],
  ] as const) {
    const res = await request.get(`${TAG_PATH}${query}`, { maxRedirects: 0 });
    expect(res.status(), query).toBe(301);
    expect(res.headers()['location'], query).toBe(location);
  }
});

test('the tag page link turns the filter on and back off', async ({ page }) => {
  await gotoHydrated(page, TAG_PATH);
  await expect(page.getByRole('link', { name: assisted.title })).toBeVisible();

  await page.getByRole('link', { name: 'Ẩn truyện có dùng AI' }).click();
  await expect(page).toHaveURL(`${TAG_PATH}?noAi=1`);
  await expect(page.getByRole('link', { name: human.title })).toBeVisible();
  await expect(page.getByRole('link', { name: assisted.title })).toHaveCount(0);

  await page.getByRole('link', { name: 'Hiện cả truyện có dùng AI' }).click();
  await expect(page).toHaveURL(TAG_PATH);
  await expect(page.getByRole('link', { name: assisted.title })).toBeVisible();
});
