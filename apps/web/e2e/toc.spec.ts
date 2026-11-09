import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

const storyPath = (story: PublishedStory) =>
  canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });

/** Chapter numbers of the links in a list, top to bottom. */
async function listedNumbers(links: Locator): Promise<number[]> {
  const labels = await links.allTextContents();
  return labels.map((label) => Number(/Chương (\d+)/.exec(label)?.[1]));
}

/** Requests the page sends from now on, besides static assets. */
function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (req) => {
    if (['fetch', 'xhr', 'document'].includes(req.resourceType())) urls.push(req.url());
  });
  return urls;
}

test.describe('table of contents search, order and jump', () => {
  let story: PublishedStory;

  test.beforeAll(async () => {
    story = await createPublishedStory({ title: `Mục Lục ${run}`, published: 12 });
    const { pool } = createTestDb();
    try {
      await pool.query(
        `update chapters set title = $1
         where number = 7 and story_id = (select id from stories where public_id = $2)`,
        ['Kiếm Đạo Đêm Mưa', story.publicId],
      );
    } finally {
      await pool.end();
    }
  });

  test('the story page filters by number or title, reverses the order and jumps to the chapter being read', async ({
    page,
  }) => {
    // The server HTML is the plain list, without the controls.
    const res = await page.request.get(storyPath(story));
    const html = await res.text();
    expect(html).toContain('id="toc-chapter-12"');
    expect(html).not.toContain('Số hoặc tên chương');

    await signUp(page);
    const saved = await page.request.put('/api/v1/reading/progress', {
      data: { publicId: story.publicId, number: 9, scrollPct: 40 },
    });
    expect(saved.status()).toBe(204);

    await gotoHydrated(page, storyPath(story));
    const toc = page.locator('section[aria-labelledby="toc-title"]');
    const links = toc.locator('ol a');
    await expect(links).toHaveCount(12);
    const requests = trackRequests(page);

    const search = toc.getByRole('searchbox', { name: 'Tìm chương' });
    await search.fill('1');
    await expect.poll(() => listedNumbers(links)).toEqual([1, 10, 11, 12]);
    await expect(toc.getByText('4 chương khớp')).toBeVisible();
    // The pinned newest chapter steps aside while searching.
    await expect(toc.getByText('Mới nhất')).toHaveCount(0);

    await search.fill('kiem dao');
    await expect.poll(() => listedNumbers(links)).toEqual([7]);
    await search.fill('rồng');
    await expect(links).toHaveCount(0);
    await expect(toc.getByText('Không có chương nào khớp.')).toBeVisible();

    await search.fill('');
    await expect(toc.getByText('Mới nhất')).toBeVisible();
    const newest = toc.getByRole('button', { name: 'Mới trước' });
    await newest.click();
    await expect(newest).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await listedNumbers(links))[0]).toBe(12);
    await toc.getByRole('button', { name: 'Cũ trước' }).click();
    await expect.poll(async () => (await listedNumbers(links))[0]).toBe(1);

    await search.fill('3');
    await toc.getByRole('button', { name: 'Đến chương đang đọc' }).click();
    await expect(search).toHaveValue('');
    const current = toc.locator('#toc-chapter-9');
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute('href', story.chapterPath(9));
    await expect(current).toBeInViewport();

    // Everything happened on the list already loaded.
    expect(requests).toEqual([]);
  });

  test('the reader table of contents filters and jumps to the open chapter', async ({ page }) => {
    await gotoHydrated(page, story.chapterPath(9));
    await page.getByRole('button', { name: 'Mục lục' }).click();
    const sheet = page.getByRole('dialog');
    const links = sheet.locator('ol a');
    await expect(links).toHaveCount(12);
    // Opening the panel does not pull focus into the search box.
    const search = sheet.getByRole('searchbox', { name: 'Tìm chương' });
    await expect(search).not.toBeFocused();

    await search.fill('1');
    await expect.poll(() => listedNumbers(links)).toEqual([1, 10, 11, 12]);
    await sheet.getByRole('button', { name: 'Mới trước' }).click();
    await expect.poll(() => listedNumbers(links)).toEqual([12, 11, 10, 1]);

    // Jumping scrolls the list only, never the chapter text behind the panel.
    const pageScroll = await page.evaluate(() => window.scrollY);
    await sheet.getByRole('button', { name: 'Đến chương đang đọc' }).click();
    await expect(search).toHaveValue('');
    const current = sheet.locator('a[aria-current="page"]');
    await expect(current).toHaveAttribute('href', story.chapterPath(9));
    await expect(current).toBeFocused();
    await expect(current).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  });

  test('the reader table of contents starts over each time it opens', async ({ page }) => {
    await gotoHydrated(page, story.chapterPath(9));
    const open = page.getByRole('button', { name: 'Mục lục' });
    await open.click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('searchbox', { name: 'Tìm chương' }).fill('1');
    await expect(sheet.locator('ol a')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await open.click();
    await expect(sheet.getByRole('searchbox', { name: 'Tìm chương' })).toHaveValue('');
    await expect(sheet.locator('ol a')).toHaveCount(12);
  });
});
