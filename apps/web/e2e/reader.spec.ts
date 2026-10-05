import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, allowMatureContent, createPublishedStory } from './helpers/content';

const PUBLIC_CACHE = 'public, s-maxage=86400, stale-while-revalidate=3600';
const content = (page: Page) => page.locator('.reader-content');

test.describe('reading a chapter', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    // Chapters 1-3 published, 4 still a draft.
    story = await createPublishedStory({
      published: 3,
      drafts: 1,
      authorNote: 'Cảm ơn <b>bạn</b>',
    });
  });

  test('the server sends the chapter text; it reads without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(story.chapterPath(2));
    await expect(page.locator('.reader-content p[data-pid]').first()).toContainText(
      'Mở đầu chương 2.',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chương 2');
    await expect(page).toHaveTitle('Chương 2 – Kiếm Đạo Độc Tôn');
    await context.close();
  });

  test('the page is publicly cacheable and never sets a cookie, even for a signed-in reader', async ({
    page,
    request,
  }) => {
    const guest = await request.get(story.chapterPath(1), { maxRedirects: 0 });
    expect(guest.status()).toBe(200);
    expect(guest.headers()['cache-control']).toBe(PUBLIC_CACHE);
    expect(guest.headers()['set-cookie']).toBeUndefined();
    expect(await guest.text()).toContain(
      `rel="canonical" href="http://localhost:3100${story.chapterPath(1)}"`,
    );

    await signUp(page);
    const signedIn = await page.request.get(story.chapterPath(1), { maxRedirects: 0 });
    expect(signedIn.status()).toBe(200);
    expect(signedIn.headers()['cache-control']).toBe(PUBLIC_CACHE);
    expect(signedIn.headers()['set-cookie']).toBeUndefined();
  });

  test('URL variants redirect to the canonical URL; none of them answers 200', async ({
    request,
  }) => {
    const canonical = story.chapterPath(2);
    const variants = [
      { url: `${canonical}?a=1`, cache: 'no-store' },
      { url: `${canonical}?utm_source=x`, cache: 'no-store' },
      { url: canonical.toUpperCase().replace('/STORIES/', '/Stories/'), cache: 'no-store' },
      { url: `/stories/ten-cu-${story.publicId}/chapter-2`, cache: 'public, s-maxage=3600' },
      { url: `/stories/${story.publicId}/chapter-2`, cache: 'public, s-maxage=3600' },
    ];
    for (const { url, cache } of variants) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(301);
      expect(res.headers()['location'], url).toBe(canonical);
      expect(res.headers()['cache-control'], url).toBe(cache);
    }
    // A trailing slash is redirected by the router before the loader runs, without cache headers.
    const slash = await request.get(`${canonical}/`, { maxRedirects: 0 });
    expect([301, 307, 308]).toContain(slash.status());
    expect(slash.headers()['location']).toBe(canonical);
    expect(slash.headers()['cache-control'] ?? '').not.toContain('s-maxage=86400');
  });

  test('missing, unpublished and misspelled chapters are short-cached 404s', async ({
    request,
  }) => {
    for (const url of [
      story.chapterPath(4),
      story.chapterPath(99),
      `/stories/${story.slug}-${story.publicId}/chapter-02`,
      `/stories/${story.slug}-${story.publicId}/chapter-0`,
      `/stories/${story.slug}-zzzzzzzz/chapter-1`,
    ]) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(404);
      expect(res.headers()['cache-control'], url).toBe('public, s-maxage=60');
    }
  });

  test('chapter links and arrow keys load the next chapter as a new document', async ({ page }) => {
    const serverFnCalls: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname.startsWith('/_serverFn')) serverFnCalls.push(req.url());
    });
    await gotoHydrated(page, story.chapterPath(1));

    const navigation = page.waitForRequest(
      (req) => req.isNavigationRequest() && req.url().endsWith(story.chapterPath(2)),
    );
    await page.getByRole('link', { name: 'Chương tiếp' }).click();
    expect((await navigation).resourceType()).toBe('document');
    await expect(content(page)).toContainText('Mở đầu chương 2.');

    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(story.chapterPath(3));
    await expect(content(page)).toContainText('Mở đầu chương 3.');
    // Chapter 4 is a draft: chapter 3 is the latest.
    await expect(page.getByText('Đã hết chương mới')).toBeVisible();

    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(story.chapterPath(2));
    expect(serverFnCalls).toEqual([]);
  });

  test('arrow keys do nothing while the table of contents is open', async ({ page }) => {
    await gotoHydrated(page, story.chapterPath(2));
    await page.getByRole('button', { name: 'Mục lục' }).click();
    const toc = page.getByRole('dialog');
    await expect(toc.getByRole('link', { name: /Chương 2/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The draft chapter is not listed.
    await expect(toc.getByRole('link', { name: /^Chương \d/ })).toHaveCount(3);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(story.chapterPath(2));

    await toc.getByRole('link', { name: /Chương 3/ }).click();
    await expect(page).toHaveURL(story.chapterPath(3));
  });

  test('scrolling past 70% prefetches the next chapter', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await gotoHydrated(page, story.chapterPath(1));
    const prefetch = page.locator(`link[rel="prefetch"][href="${story.chapterPath(2)}"]`);
    await expect(prefetch).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(prefetch).toHaveCount(1);
  });

  test("the author's note is plain text", async ({ page }) => {
    await gotoHydrated(page, story.chapterPath(1));
    await expect(page.getByText('Cảm ơn <b>bạn</b>')).toBeVisible();
    await expect(page.locator('footer b')).toHaveCount(0);
  });
});

test.describe('18+ stories', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ isMature: true, warningTags: ['bao-luc'] });
  });

  test('guests get the warning screen and the page is not indexed', async ({ page, request }) => {
    const res = await request.get(story.chapterPath(1), { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag']).toBe('noindex');
    expect(res.headers()['cache-control']).toBe(PUBLIC_CACHE);

    await gotoHydrated(page, story.chapterPath(1));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const gate = page.getByRole('alertdialog');
    await expect(gate.getByRole('heading', { name: 'Truyện có nội dung 18+' })).toBeVisible();
    await expect(gate.getByText('Bạo lực')).toBeVisible();
    await expect(gate.getByRole('link', { name: 'Đăng nhập để đọc' })).toBeVisible();
  });

  test('a signed-in reader without the setting is offered to turn it on; with it, the chapter', async ({
    page,
  }) => {
    const account = await signUp(page);
    await gotoHydrated(page, story.chapterPath(1));
    const gate = page.getByRole('alertdialog');
    await expect(gate.getByRole('checkbox', { name: 'Tôi xác nhận đã đủ 18 tuổi' })).toBeVisible();

    await allowMatureContent(account.email);
    await gotoHydrated(page, story.chapterPath(1));
    await expect(gate).toHaveCount(0);
    await expect(content(page)).toContainText('Mở đầu chương 1.');
    // The hint is stored so the next load hides the screen before paint.
    expect(await page.evaluate(() => localStorage.getItem('nh:mature'))).toBe('1');
  });
});
