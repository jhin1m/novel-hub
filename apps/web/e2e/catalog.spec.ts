import { canonicalPath } from '@novel-hub/shared';
import { expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, allowMatureContent, createPublishedStory } from './helpers/content';

const LIST_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600';
const PAGE_CACHE = 'public, s-maxage=86400, stale-while-revalidate=3600';

// Titles unique to this run, so the HTML checks never match stories from other specs.
const run = Date.now().toString(36);
let normal: PublishedStory;
let other: PublishedStory;
let mature: PublishedStory;
let draft: PublishedStory;
let latest: PublishedStory;
let completed: PublishedStory;
let matureCompleted: PublishedStory;

/** Past the home listing threshold: 3 published chapters, 5,100 words. */
const LISTED = { published: 3, wordsPerChapter: 1_700 };

test.beforeAll(async () => {
  normal = await createPublishedStory({ title: `Truyện Thường ${run}`, ...LISTED });
  // One short chapter: on the tag and author pages, never in the home lists.
  other = await createPublishedStory({ title: `Truyện Khác ${run}` });
  mature = await createPublishedStory({
    title: `Truyện Người Lớn ${run}`,
    isMature: true,
    warningTags: ['noi-dung-18'],
    ...LISTED,
  });
  draft = await createPublishedStory({ title: `Truyện Nháp ${run}`, published: 0, drafts: 1 });
  // Three titled chapters and a draft after them: the home rows show the third one.
  latest = await createPublishedStory({
    title: `Truyện Có Tên Chương ${run}`,
    ...LISTED,
    drafts: 1,
    chapterTitles: ['Khởi đầu', 'Gặp gỡ', `Đỉnh núi ${run}`, `Bản nháp ${run}`],
  });
  completed = await createPublishedStory({
    title: `Truyện Hoàn Thành ${run}`,
    ...LISTED,
    status: 'completed',
  });
  matureCompleted = await createPublishedStory({
    title: `Truyện Hoàn Thành Người Lớn ${run}`,
    isMature: true,
    ...LISTED,
    status: 'completed',
  });
  // A second new story past the threshold: one becomes the hero, the spotlight keeps the other.
  await createPublishedStory({ title: `Truyện Mới ${run}`, ...LISTED });
});

const storyPath = (s: PublishedStory) => canonicalPath({ kind: 'story', ...s });

test('home, tag and author pages list public stories, never 18+ or drafts, and are cached', async ({
  request,
}) => {
  for (const path of ['/', '/tags/tien-hiep', `/authors/${normal.username}`]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()['cache-control'], path).toBe(LIST_CACHE);
    expect(res.headers()['set-cookie'], path).toBeUndefined();
    const html = await res.text();
    expect(html, path).toContain(normal.title);
    expect(html, path).not.toContain(mature.title);
    expect(html, path).not.toContain(draft.title);
  }
  const home = await (await request.get('/')).text();
  expect(home).not.toContain(other.title);
  expect(home).toContain('Mới cập nhật');
  expect(home).not.toContain('Biên tập chọn');
  // Loaded in the browser for signed-in readers only.
  expect(home).not.toContain('id="continue-title"');
});

test('"new stories that need readers" lists new stories past the threshold, never the hero', async ({
  page,
}) => {
  await gotoHydrated(page, '/');
  const heroTitle = (await page.locator('#featured-title').textContent()) ?? '';
  expect(heroTitle).not.toBe('');
  const spotlight = page.getByRole('region', { name: 'Truyện mới cần độc giả' });
  await expect(spotlight.getByText('Truyện mới ra, đổi mỗi giờ')).toBeVisible();
  // Which qualifying stories make the 8 depends on the hour; the int tests pin the selection.
  const cards = spotlight.getByRole('listitem');
  await expect(cards.first()).toBeVisible();
  for (const title of [heroTitle, other.title, mature.title]) {
    await expect(cards.filter({ hasText: title })).toHaveCount(0);
  }
});

test('"recently updated" rows show the latest readable chapter and link to the full list', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain(`Chương 3 · Đỉnh núi ${run}`);
  expect(html).not.toContain(`Bản nháp ${run}`);
  expect(html).toMatch(
    /<a [^>]*href="\/search\?sort=updated"[^>]*>Xem thêm truyện mới cập nhật<\/a>/,
  );
});

test('"recently completed" lists completed stories, never 18+, and links to all of them', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toContain(matureCompleted.title);
  expect(html).toMatch(
    /<a [^>]*href="\/search\?status=completed"[^>]*>Xem truyện đã hoàn thành<\/a>/,
  );

  await gotoHydrated(page, '/');
  const section = page.getByRole('region', { name: 'Vừa hoàn thành' });
  await expect(section.getByText('Truyện đã ra đủ, đọc một mạch')).toBeVisible();
  const link = (id: string) =>
    page
      .locator(`section[aria-labelledby="${id}"]`)
      .getByRole('link', { name: completed.title, exact: true });
  // The hero comes first: a section never repeats it (the notable list may pick any new story).
  const isHero = (await page.locator('#featured-title').textContent()) === completed.title;
  await expect(link('completed-title')).toHaveCount(isHero ? 0 : 1);
  for (const id of ['spotlight-title', 'notable-title']) await expect(link(id)).toHaveCount(0);
});

test('a story shows in at most one of the hero, picks, completed, "need readers" and notable sections', async ({
  page,
}) => {
  await gotoHydrated(page, '/');
  const sections = [
    'featured-title',
    'picks-title',
    'completed-title',
    'spotlight-title',
    'notable-title',
  ].map((id) => page.locator(`section[aria-labelledby="${id}"]`));
  for (const title of [normal.title, latest.title, completed.title, `Truyện Mới ${run}`]) {
    let shownIn = 0;
    for (const section of sections) {
      if ((await section.getByRole('link', { name: title, exact: true }).count()) > 0) shownIn += 1;
    }
    expect(shownIn, title).toBeLessThanOrEqual(1);
  }
});

test('the story page is cached and shows the story; drafts are 404', async ({ request }) => {
  const res = await request.get(storyPath(normal), { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe(PAGE_CACHE);
  expect(res.headers()['set-cookie']).toBeUndefined();
  const html = await res.text();
  expect(html).toContain(normal.title);
  expect(html).toContain('Đọc từ đầu');
  expect(html).toContain(`href="${normal.chapterPath(2)}"`);
  expect(html).toContain(`href="/authors/${normal.username}"`);

  expect((await request.get(storyPath(draft), { maxRedirects: 0 })).status()).toBe(404);
});

test('non-canonical URLs answer 301 to the canonical one', async ({ request }) => {
  const story = storyPath(normal);
  const cases: [string, string, string][] = [
    // [requested, location, cache-control]
    [`/stories/sai-slug-${normal.publicId}`, story, 'public, s-maxage=3600'],
    [`/stories/${normal.slug}-${normal.publicId.toUpperCase()}`, story, 'no-store'],
    [`${story}?ref=a`, story, 'no-store'],
    [`/authors/${normal.username.toUpperCase()}`, `/authors/${normal.username}`, 'no-store'],
    ['/?utm_source=x', '/', 'no-store'],
    ['/tags/Tien-Hiep', '/tags/tien-hiep', 'no-store'],
    ['/tags/tien-hiep?page=1', '/tags/tien-hiep', 'no-store'],
    ['/tags/tien-hiep?page=02', '/tags/tien-hiep?page=2', 'no-store'],
    ['/tags/tien-hiep?page=abc', '/tags/tien-hiep', 'no-store'],
    ['/tags/tien-hiep?foo=1', '/tags/tien-hiep', 'no-store'],
    // A merged tag moved for good, keeping the page.
    ['/tags/tu-tien?page=2', '/tags/tien-hiep?page=2', 'public, s-maxage=3600'],
    ['/terms?x=1', '/terms', 'no-store'],
  ];
  for (const [url, location, cache] of cases) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), url).toBe(301);
    expect(res.headers()['location'], url).toBe(location);
    expect(res.headers()['cache-control'], url).toBe(cache);
  }
});

test('unknown authors and tags, and tag pages past the end, are 404', async ({ request }) => {
  for (const url of ['/authors/khong_ton_tai', '/tags/khong-co-tag', '/tags/tien-hiep?page=9999']) {
    expect((await request.get(url, { maxRedirects: 0 })).status(), url).toBe(404);
  }
});

test('moving between public pages loads documents, never server functions', async ({ page }) => {
  const serverFnCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/_serverFn/')) serverFnCalls.push(req.url());
  });
  await gotoHydrated(page, '/');
  await page.getByRole('link', { name: normal.title }).first().click();
  await expect(page).toHaveURL(storyPath(normal));
  await expect(page.getByRole('heading', { level: 1, name: normal.title })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Tiên hiệp' }).first().click();
  await expect(page).toHaveURL('/tags/tien-hiep');
  await page.waitForLoadState('networkidle');
  expect(serverFnCalls).toEqual([]);
});

test('pages hydrate without mismatches', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  for (const path of ['/', storyPath(normal), '/tags/tien-hiep', `/authors/${normal.username}`]) {
    await gotoHydrated(page, path);
  }
  expect(errors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test('a guest opening an 18+ story sees the warning, and the page is noindex', async ({
  page,
  request,
}) => {
  const res = await request.get(storyPath(mature));
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toBe('noindex');
  expect(await res.text()).toMatch(/<meta name="robots" content="noindex"/);

  await gotoHydrated(page, storyPath(mature));
  const gate = page.getByRole('alertdialog');
  await expect(gate).toContainText('Truyện có nội dung 18+');
  await expect(gate).toContainText('Nội dung 18+');
});

test('the 18+ screen fully covers the story and chapter pages for a guest', async ({ page }) => {
  for (const path of [storyPath(mature), mature.chapterPath(1)]) {
    await gotoHydrated(page, path);
    const gate = page.getByRole('alertdialog');
    await expect(gate, path).toBeVisible();
    const { centreInGate, background } = await gate.evaluate((el) => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return {
        centreInGate: !!hit && el.contains(hit),
        background: getComputedStyle(el).backgroundColor,
      };
    });
    expect(centreInGate, path).toBe(true);
    // Opaque: `rgb(...)`, never `rgba(..., <1)` or `transparent`.
    expect(background, path).toMatch(/^rgb\(/);
  }
});

test('turning 18+ on in settings (with the age statement) adds 18+ stories to the lists', async ({
  page,
}) => {
  await signUp(page);
  await gotoHydrated(page, '/settings');
  const toggle = page.getByRole('checkbox', { name: 'Hiện nội dung 18+' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();

  const dialog = page.getByRole('dialog');
  const enable = dialog.getByRole('button', { name: 'Hiện nội dung 18+' });
  await expect(enable).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Tôi xác nhận đã đủ 18 tuổi' }).click();
  await enable.click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeChecked();

  await gotoHydrated(page, '/');
  await expect(page.getByRole('link', { name: mature.title }).first()).toBeVisible();
  await gotoHydrated(page, storyPath(mature));
  await expect(page.getByRole('alertdialog')).toBeHidden();

  // Off again: applies at once, and the lists go back to the server-rendered ones.
  await gotoHydrated(page, '/settings');
  await page.getByRole('checkbox', { name: 'Hiện nội dung 18+' }).click();
  await expect(page.getByRole('checkbox', { name: 'Hiện nội dung 18+' })).not.toBeChecked();
  await gotoHydrated(page, '/');
  await expect(page.getByRole('link', { name: mature.title })).toHaveCount(0);
});

test('"continue reading" on the home page hides 18+ stories unless the account shows them', async ({
  page,
}) => {
  const account = await signUp(page);
  for (const story of [normal, mature]) {
    const res = await page.request.put('/api/v1/reading/progress', {
      data: { publicId: story.publicId, number: 1, scrollPct: 20 },
    });
    expect(res.status()).toBe(204);
  }

  await gotoHydrated(page, '/');
  const aside = page.getByRole('complementary', { name: 'Đọc tiếp' });
  await expect(aside).toContainText(normal.title);
  await expect(aside).not.toContainText(mature.title);
  await expect(page.getByText(mature.title)).toHaveCount(0);

  await allowMatureContent(account.email);
  await gotoHydrated(page, '/');
  await expect(aside).toContainText(mature.title);
});

test('terms and content policy are public pages linked from the footer', async ({
  page,
  request,
}) => {
  for (const path of ['/terms', '/content-policy', '/privacy']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()['cache-control'], path).toBe(PAGE_CACHE);
    expect(await res.text(), path).toContain('Bản nháp');
  }
  await gotoHydrated(page, '/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Điều khoản' })).toHaveAttribute('href', '/terms');
  await expect(footer.getByRole('link', { name: 'Quy định nội dung' })).toHaveAttribute(
    'href',
    '/content-policy',
  );
  await expect(footer.getByRole('link', { name: 'Chính sách bảo mật' })).toHaveAttribute(
    'href',
    '/privacy',
  );
});
