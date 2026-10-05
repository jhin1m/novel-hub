import { canonicalPath } from '@novel-hub/shared';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

const PAGE_CACHE = 'public, s-maxage=86400, stale-while-revalidate=3600';
const PROGRESS = '/api/v1/reading/progress';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

const storyPath = (story: PublishedStory) =>
  canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

/** Reading position in the chapter text, computed like the progress tracker does. */
function readingPct(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.reader-content');
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const pct = ((window.innerHeight - rect.top) / rect.height) * 100;
    return Math.min(100, Math.max(0, pct));
  });
}

/** Saves progress for the signed-in account of `page`, as the reader page does. */
async function saveProgress(page: Page, story: PublishedStory, number: number, scrollPct: number) {
  const res = await page.request.put(PROGRESS, {
    data: { publicId: story.publicId, number, scrollPct },
  });
  expect(res.status()).toBe(204);
}

test.describe('library and reading history', () => {
  test.beforeEach(async ({ page }) => {
    // A narrow screen so the chapter text is several screens long.
    await page.setViewportSize({ width: 390, height: 600 });
  });

  test('"continue reading" reopens the chapter at the saved position; a direct link starts at the top', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Đọc Tiếp ${run}`, published: 2 });
    await signUp(page);

    // Read chapter 2 down to about the middle, until the position is saved.
    await gotoHydrated(page, story.chapterPath(2));
    const saved = page.waitForResponse(
      (res) => new URL(res.url()).pathname === PROGRESS && res.request().method() === 'PUT',
    );
    await page.evaluate(() => {
      const el = document.querySelector('.reader-content');
      if (!el) throw new Error('no chapter text');
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      window.scrollTo(0, top + rect.height * 0.5 - window.innerHeight);
    });
    const body = (await saved).request().postDataJSON() as { scrollPct: number };
    expect(body.scrollPct).toBeGreaterThan(35);
    expect(body.scrollPct).toBeLessThan(65);

    // The story page offers to continue there.
    await gotoHydrated(page, storyPath(story));
    const resume = page.getByRole('link', { name: 'Đọc tiếp chương 2' });
    await expect(resume).toBeVisible();
    const putsAfter: number[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === PROGRESS && req.method() !== 'GET') {
        putsAfter.push((req.postDataJSON() as { scrollPct: number }).scrollPct);
      }
    });
    await resume.click();
    await expect(page).toHaveURL(story.chapterPath(2));
    await page.waitForLoadState('networkidle');
    await expect.poll(() => readingPct(page)).toBeGreaterThan(body.scrollPct - 10);
    expect(await readingPct(page)).toBeLessThan(body.scrollPct + 10);

    // The top of the chapter is never saved over the position while it is being restored.
    await page.waitForTimeout(3_500);
    for (const pct of putsAfter) expect(pct).toBeGreaterThan(body.scrollPct - 10);

    // Opening the chapter URL directly (from another page, not a reload) starts from the top.
    await gotoHydrated(page, '/');
    await gotoHydrated(page, story.chapterPath(2));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('add from the story page, move between shelves and remove', async ({ page }) => {
    const story = await createPublishedStory({ title: `Tủ Truyện ${run}` });
    await signUp(page);

    await gotoHydrated(page, storyPath(story));
    await page.getByRole('button', { name: 'Thêm vào tủ' }).click();
    await expect(page.getByRole('button', { name: 'Trong tủ: Đang đọc' })).toBeVisible();

    // The story page stays publicly cacheable and sets no cookie for a signed-in reader.
    const html = await page.request.get(storyPath(story), { maxRedirects: 0 });
    expect(html.headers()['cache-control']).toBe(PAGE_CACHE);
    expect(html.headers()['set-cookie']).toBeUndefined();

    await page.getByRole('link', { name: 'Tủ truyện' }).click();
    await expect(page).toHaveURL('/library?shelf=reading&page=1');
    const title = page.getByRole('link', { name: story.title });
    await expect(title).toBeVisible();

    await page.getByRole('button', { name: `Tuỳ chọn cho ${story.title}` }).click();
    await page.getByRole('menuitemradio', { name: 'Đã xong' }).click();
    await expect(title).toHaveCount(0);
    await expect(page.getByText('Kệ này chưa có truyện nào.')).toBeVisible();

    await page.getByRole('link', { name: 'Đã xong' }).click();
    await expect(title).toBeVisible();
    await page.getByRole('button', { name: `Tuỳ chọn cho ${story.title}` }).click();
    await page.getByRole('menuitem', { name: 'Bỏ khỏi tủ' }).click();
    await expect(title).toHaveCount(0);

    await gotoHydrated(page, storyPath(story));
    await expect(page.getByRole('button', { name: 'Thêm vào tủ' })).toBeVisible();
  });

  test('the history lists the most recently read first; an entry can be removed', async ({
    page,
  }) => {
    const stories = [
      await createPublishedStory({ title: `Lịch Sử Một ${run}` }),
      await createPublishedStory({ title: `Lịch Sử Hai ${run}` }),
      await createPublishedStory({ title: `Lịch Sử Ba ${run}` }),
    ];
    await signUp(page);
    for (const story of stories) await saveProgress(page, story, 1, 20);

    await gotoHydrated(page, '/library?shelf=history');
    const headings = page.getByRole('main').getByRole('heading', { level: 3 });
    await expect(headings).toHaveText(
      [...stories].reverse().map((s) => s.title),
      { timeout: 10_000 },
    );
    await expect(page.getByRole('link', { name: 'Đọc tiếp chương 1' })).toHaveCount(3);

    await page
      .getByRole('listitem')
      .filter({ hasText: stories[1]?.title ?? '' })
      .getByRole('button', { name: 'Xoá khỏi lịch sử' })
      .click();
    await expect(headings).toHaveText([stories[2]?.title ?? '', stories[0]?.title ?? '']);
  });

  test('guests are invited to sign in', async ({ page }) => {
    const res = await page.goto('/library?shelf=plan');
    expect(res?.headers()['cache-control']).toBe('no-store');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Đăng nhập để dùng tủ truyện và xem lịch sử đọc.')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});
