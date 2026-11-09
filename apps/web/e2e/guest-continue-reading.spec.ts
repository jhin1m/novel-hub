import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const KEY = 'nh:guest-progress';
const BAR_LEAD = 'Bạn đang đọc dở';
const NOTE = 'Lưu trên máy này.';

interface SavedPosition {
  publicId: string;
  number: number;
  scrollPct: number;
  updatedAt: number;
}

const bar = (page: Page) => page.getByRole('complementary', { name: 'Đọc tiếp' });

function position(story: PublishedStory, number: number, updatedAt = Date.now()): SavedPosition {
  return { publicId: story.publicId, number, scrollPct: 40, updatedAt };
}

/** Stores positions from a page that does not track reading, so nothing overwrites them. */
async function seed(page: Page, items: SavedPosition[]) {
  await page.goto('/terms');
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [KEY, JSON.stringify({ v: 1, items })],
  );
}

function stored(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), KEY);
}

async function storedItems(page: Page): Promise<SavedPosition[]> {
  const raw = await stored(page);
  return raw ? (JSON.parse(raw) as { items: SavedPosition[] }).items : [];
}

async function scrollShare(page: Page, share: number) {
  await page.evaluate((s) => {
    window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * s);
  }, share);
}

/** Runs one statement against the test database. */
async function sql(text: string, values: unknown[]) {
  const { pool } = createTestDb();
  try {
    return await pool.query(text, values);
  } finally {
    await pool.end();
  }
}

/** The chapter number saved on the account for this story, or `null` without a row. */
async function accountChapter(email: string, publicId: string): Promise<number | null> {
  const { rows } = await sql(
    `select c.number from reading_progress rp
     join users u on u.id = rp.user_id
     join stories s on s.id = rp.story_id
     join chapters c on c.id = rp.chapter_id
     where u.email = $1 and s.public_id = $2`,
    [email, publicId],
  );
  return (rows[0] as { number: number } | undefined)?.number ?? null;
}

test.describe('continue reading for guests', () => {
  test.beforeEach(async ({ page }) => {
    // A narrow screen so the chapter text is several screens long.
    await page.setViewportSize({ width: 390, height: 600 });
  });

  test('a guest reads, goes home, and continues from the same place', async ({ page }) => {
    const story = await createPublishedStory({ title: 'Đọc Dở Của Khách', published: 2 });
    await gotoHydrated(page, story.chapterPath(2));
    await scrollShare(page, 0.5);
    await expect.poll(() => storedItems(page), { timeout: 6_000 }).toHaveLength(1);
    const [item] = await storedItems(page);
    expect(item).toMatchObject({ publicId: story.publicId, number: 2 });
    expect(item?.scrollPct).toBeGreaterThan(0);

    await gotoHydrated(page, '/');
    await expect(bar(page)).toContainText(BAR_LEAD);
    await expect(bar(page)).toContainText('Đọc Dở Của Khách');
    await expect(bar(page)).toContainText('Chương 2');

    await bar(page).getByRole('link', { name: 'Đọc tiếp chương 2' }).click();
    await expect(page).toHaveURL(story.chapterPath(2));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('the note about this device shows only on wide screens', async ({ page }) => {
    const story = await createPublishedStory({ published: 1 });
    await seed(page, [position(story, 1)]);
    await gotoHydrated(page, '/');
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).getByText(NOTE)).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(bar(page).getByText(NOTE)).toBeVisible();
    await expect(bar(page).getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('the home HTML stays the same for a guest with saved positions', async ({ page }) => {
    const story = await createPublishedStory({ published: 1 });
    await seed(page, [position(story, 1)]);
    await gotoHydrated(page, '/');
    await expect(bar(page)).toBeVisible();

    const html = await page.request.get('/');
    expect(html.status()).toBe(200);
    expect(html.headers()['set-cookie']).toBeUndefined();
    const body = await html.text();
    expect(body).not.toContain(BAR_LEAD);
    expect(body).not.toContain(NOTE);
  });

  test('opening an 18+ chapter saves nothing', async ({ page }) => {
    const story = await createPublishedStory({ published: 1, isMature: true });
    await gotoHydrated(page, story.chapterPath(1));
    await scrollShare(page, 0.5);
    await page.waitForTimeout(3_500);
    await page.goto('/terms');
    expect(await stored(page)).toBeNull();
  });

  test('without a confirmed guest nothing is saved and no bar shows', async ({ page }) => {
    await page.route('**/api/v1/me', (route) => route.fulfill({ status: 500, body: '{}' }));
    const story = await createPublishedStory({ published: 1 });
    await seed(page, [position(story, 1)]);
    await page.goto(story.chapterPath(1));
    const before = await stored(page);
    await scrollShare(page, 0.5);
    await page.waitForTimeout(3_500);
    expect(await stored(page)).toBe(before);

    await page.goto('/');
    // Failed account requests are retried with a backoff before the query gives up.
    await expect(page.locator('.continue-hint')).toHaveCount(0, { timeout: 15_000 });
    await expect(bar(page)).toHaveCount(0);
    expect(await stored(page)).toBe(before);
  });

  test('the bar goes away when a later account check fails', async ({ page }) => {
    const story = await createPublishedStory({ published: 1 });
    await seed(page, [position(story, 1)]);
    await page.clock.install();
    await gotoHydrated(page, '/');
    await expect(bar(page)).toBeVisible();

    let failures = 0;
    await page.route('**/api/v1/me', (route) => {
      failures += 1;
      return route.fulfill({ status: 500, body: '{}' });
    });
    // Past the account's freshness window, then back to the tab: it is asked for again.
    await page.clock.fastForward(61_000);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

    // The account request is retried with a backoff before the query gives up.
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });
    expect(failures).toBeGreaterThan(0);
    expect(await storedItems(page)).toHaveLength(1);
  });

  test('the placeholder holds the room after the 401 until the card arrives', async ({ page }) => {
    const story = await createPublishedStory({ published: 1 });
    await seed(page, [position(story, 1)]);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The home page calls no other server function from the browser; their URLs are opaque ids.
    await page.route('**/_serverFn/**', async (route) => {
      await held;
      await route.continue();
    });

    const me = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/v1/me');
    await page.goto('/');
    expect((await me).status()).toBe(401);

    const placeholder = page.locator('.continue-hint');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).not.toContainText(BAR_LEAD);
    const heightWhileWaiting = (await placeholder.boundingBox())?.height ?? 0;
    expect(heightWhileWaiting).toBeGreaterThan(40);

    release();
    await expect(bar(page)).toBeVisible();
    await expect(placeholder).toHaveCount(0);
    expect((await bar(page).boundingBox())?.height).toBeGreaterThanOrEqual(heightWhileWaiting - 12);
  });

  for (const [label, change] of [
    ['turns 18+', `update stories set is_mature = true where public_id = $1`],
    ['is hidden', `update stories set visibility = 'hidden_by_mod' where public_id = $1`],
  ] as const) {
    test(`a story that ${label} leaves the bar and the device`, async ({ page }) => {
      const story = await createPublishedStory({ title: 'Truyện Vừa Đổi', published: 1 });
      await seed(page, [position(story, 1)]);
      await sql(change, [story.publicId]);

      await gotoHydrated(page, '/');
      await expect(bar(page)).toHaveCount(0);
      await expect.poll(() => stored(page)).toBeNull();
    });
  }

  test('a dead position gives way to the next one without a reload', async ({ page }) => {
    const alive = await createPublishedStory({ title: 'Truyện Còn Đọc Được', published: 1 });
    const dead = await createPublishedStory({ title: 'Truyện Đã Ẩn', published: 1 });
    await seed(page, [position(dead, 1), position(alive, 1)]);
    await sql(`update stories set visibility = 'hidden_by_mod' where public_id = $1`, [
      dead.publicId,
    ]);

    await gotoHydrated(page, '/');
    await expect(bar(page)).toContainText('Truyện Còn Đọc Được');
    expect((await storedItems(page)).map((item) => item.publicId)).toEqual([alive.publicId]);
  });

  test('signing up moves the positions into the new account', async ({ page }) => {
    const story = await createPublishedStory({ title: 'Mang Sang Tài Khoản', published: 2 });
    await seed(page, [position(story, 2)]);

    const account = await signUp(page);

    await expect.poll(() => accountChapter(account.email, story.publicId)).toBe(2);
    await expect.poll(() => stored(page)).toBeNull();
    await expect(bar(page)).toContainText('Mang Sang Tài Khoản');
    await expect(bar(page).getByText(NOTE)).toHaveCount(0);
  });

  test('a position behind the account is dropped, even with a future clock', async ({ page }) => {
    const story = await createPublishedStory({ published: 3 });
    const account = await signUp(page);
    const saved = await page.request.put('/api/v1/reading/progress', {
      data: { publicId: story.publicId, number: 3, scrollPct: 70 },
    });
    expect(saved.status()).toBe(204);

    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    await page.goto('/terms');
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [KEY, JSON.stringify({ v: 1, items: [position(story, 1, farFuture)] })],
    );

    await gotoHydrated(page, '/');
    await expect.poll(() => stored(page)).toBeNull();
    expect(await accountChapter(account.email, story.publicId)).toBe(3);
  });
});
