import { createTestDb } from '@novel-hub/db/testing';
import { type Page, type Request, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const PROGRESS = '/api/v1/reading/progress';
const VIEW = '/api/v1/reading/view';

/** The saved scroll position of `email` in the story, or `null` when nothing is saved. */
async function savedProgress(email: string, publicId: string): Promise<number | null> {
  const { pool } = createTestDb();
  try {
    const { rows } = await pool.query<{ scroll_pct: number }>(
      `select rp.scroll_pct from reading_progress rp
       join users u on u.id = rp.user_id
       join stories s on s.id = rp.story_id
       where u.email = $1 and s.public_id = $2`,
      [email, publicId],
    );
    return rows[0]?.scroll_pct ?? null;
  } finally {
    await pool.end();
  }
}

const isPath = (path: string) => (req: Request) => new URL(req.url()).pathname === path;

/** Scrolls so the given share of the page height is above the top of the screen. */
async function scrollTo(page: Page, share: number) {
  await page.evaluate((s) => {
    window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * s);
  }, share);
}

test.describe('reading progress and counted reads', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ published: 2 });
  });

  test.beforeEach(async ({ page }) => {
    // A narrow screen so the chapter text is several screens long.
    await page.setViewportSize({ width: 390, height: 600 });
  });

  test('a signed-in reader saves progress while scrolling and once more when leaving', async ({
    page,
  }) => {
    const account = await signUp(page);
    await gotoHydrated(page, story.chapterPath(1));

    const saved = page.waitForResponse(
      (res) => isPath(PROGRESS)(res.request()) && res.request().method() === 'PUT',
    );
    await scrollTo(page, 0.4);
    expect((await saved).status()).toBe(204);
    const middle = await savedProgress(account.email, story.publicId);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(100);

    // Straight to the end and away before the 3 s debounce: the beacon carries the last position.
    await scrollTo(page, 1);
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => savedProgress(account.email, story.publicId)).toBe(100);
  });

  test('a guest never sends progress', async ({ page }) => {
    const progressCalls: string[] = [];
    page.on('request', (req) => {
      if (isPath(PROGRESS)(req)) progressCalls.push(req.method());
    });
    await gotoHydrated(page, story.chapterPath(1));
    await scrollTo(page, 0.5);
    await page.waitForTimeout(3_500);
    await page.goto(story.chapterPath(2));
    await page.waitForLoadState('networkidle');
    expect(progressCalls).toEqual([]);
  });

  test('a read is sent once after 30 s of visible time; hidden time does not count', async ({
    page,
  }) => {
    await page.clock.install();
    const views: Request[] = [];
    page.on('request', (req) => {
      if (isPath(VIEW)(req)) views.push(req);
    });
    await gotoHydrated(page, story.chapterPath(2));

    await page.clock.runFor(20_000);
    // The tab goes to the background for a minute.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(60_000);
    expect(views).toHaveLength(0);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const sent = page.waitForResponse((res) => isPath(VIEW)(res.request()));
    await page.clock.runFor(10_000);
    const res = await sent;
    expect(res.status()).toBe(204);
    expect(res.request().postDataJSON()).toEqual({ publicId: story.publicId, number: 2 });
    // The anonymous viewer cookie only lives on the reading API path.
    expect(await res.headerValue('set-cookie')).toContain('Path=/api/v1/reading');

    await page.clock.runFor(60_000);
    expect(views).toHaveLength(1);
  });

  test('the chapter HTML never sets a cookie, even once the viewer cookie exists', async ({
    page,
  }) => {
    await page.clock.install();
    await gotoHydrated(page, story.chapterPath(1));
    const sent = page.waitForResponse((res) => isPath(VIEW)(res.request()));
    await page.clock.runFor(30_000);
    await sent;
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'nh_vid')?.path).toBe('/api/v1/reading');

    const html = await page.request.get(story.chapterPath(1), { maxRedirects: 0 });
    expect(html.status()).toBe(200);
    expect(html.headers()['set-cookie']).toBeUndefined();
  });
});
