import { createTestDb } from '@novel-hub/db/testing';
import { type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { createPublishedStory } from './helpers/content';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const { pool } = createTestDb();
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

/** A top-level comment on chapter 1 of `publicId`, written by the story's author. */
async function seedComment(publicId: string, body: string) {
  await query(
    `insert into comments (chapter_id, story_id, user_id, body)
     select c.id, s.id, s.author_id, $2
     from stories s join chapters c on c.story_id = s.id and c.number = 1
     where s.public_id = $1`,
    [publicId, body],
  );
}

const isCommentsCall = (url: string) => new URL(url).pathname.startsWith('/api/v1/comments');

/**
 * Scrolls to the end of the chapter, where the comments load, and waits for them (the heading then
 * shows the count). After a reload the browser may restore the scroll and load them on its own.
 */
async function scrollToComments(page: Page) {
  await page.getByRole('heading', { name: /^Bình luận/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /^Bình luận \(\d+\)$/ })).toBeVisible();
}

test.describe('chapter comments', () => {
  test('a verified reader comments, replies, sees both after a reload, then deletes the thread', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Bình Luận ${run}`, published: 1 });
    const chapterPath = story.chapterPath(1);
    const account = await signUpVerified(page);

    // The cached page carries no comments and asks for none until the reader nears the end.
    await page.setViewportSize({ width: 1280, height: 400 });
    const calls: string[] = [];
    page.on('request', (req) => {
      if (isCommentsCall(req.url())) calls.push(req.url());
    });
    const html = await page.request.get(chapterPath);
    expect(html.headers()['cache-control']).toContain('public');
    expect(html.headers()['set-cookie']).toBeUndefined();
    await gotoHydrated(page, chapterPath);
    expect(calls).toEqual([]);
    await scrollToComments(page);

    const section = page.getByRole('region', { name: /^Bình luận/ });
    await expect(section.getByRole('heading', { name: 'Bình luận (0)' })).toBeVisible();
    await expect(section).toContainText('Chưa có bình luận nào.');
    await section.getByLabel('Nội dung bình luận').fill('Chương này hay quá!\nHóng chương sau.');
    await section.getByRole('button', { name: 'Gửi' }).click();
    const thread = section.getByRole('article').filter({ hasText: 'Chương này hay quá!' });
    await expect(thread).toContainText(account.name);
    await expect(section.getByRole('heading', { name: 'Bình luận (1)' })).toBeVisible();

    await thread.getByRole('button', { name: 'Trả lời' }).click();
    await section.getByLabel(`Trả lời ${account.name}`).fill('Tự trả lời chính mình.');
    await section.getByRole('button', { name: 'Gửi' }).last().click();
    await expect(section.getByText('Tự trả lời chính mình.')).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Bình luận (2)' })).toBeVisible();
    // The page itself never sees the comments: still the same cached HTML.
    expect(await (await page.request.get(chapterPath)).text()).not.toContain('Chương này hay quá!');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToComments(page);
    await expect(section.getByText('Chương này hay quá!')).toBeVisible();
    await expect(section.getByText('Tự trả lời chính mình.')).toBeVisible();

    await thread.getByRole('button', { name: 'Xoá' }).first().click();
    await page
      .getByRole('dialog', { name: 'Xoá bình luận này?' })
      .getByRole('button', {
        name: 'Xác nhận',
      })
      .click();
    await expect(section.getByRole('heading', { name: 'Bình luận (0)' })).toBeVisible();
    await expect(section.getByText('Tự trả lời chính mình.')).toHaveCount(0);
  });

  test('a guest reads the comments and is sent to sign in to write', async ({ page }) => {
    const story = await createPublishedStory({ title: `Khách Đọc ${run}`, published: 1 });
    await seedComment(story.publicId, 'Bình luận cho khách xem');
    await gotoHydrated(page, story.chapterPath(1));
    await scrollToComments(page);
    const section = page.getByRole('region', { name: /^Bình luận/ });
    await expect(section.getByText('Bình luận cho khách xem')).toBeVisible();
    await expect(section.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    await expect(section.getByRole('textbox')).toHaveCount(0);
  });

  test('a moderator hides a reported comment and readers no longer see it', async ({
    page,
    browser,
  }) => {
    const story = await createPublishedStory({ title: `Ẩn Bình Luận ${run}`, published: 1 });
    const body = `Quảng cáo rác ${run}`;
    await seedComment(story.publicId, body);

    await signUp(page);
    await gotoHydrated(page, story.chapterPath(1));
    await scrollToComments(page);
    const comment = page.getByRole('article').filter({ hasText: body });
    await comment.getByRole('button', { name: 'Báo cáo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Báo cáo bình luận' });
    await dialog.getByLabel('Spam').check();
    await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Đã gửi báo cáo. Cảm ơn bạn!');

    const modContext = await browser.newContext();
    try {
      const modPage = await modContext.newPage();
      const mod = await signUp(modPage);
      await query("update users set role = 'mod' where email = $1", [mod.email]);
      await gotoHydrated(modPage, '/moderation');
      const card = modPage.getByRole('article').filter({ hasText: body });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(story.title);
      await card.getByRole('button', { name: 'Ẩn bình luận' }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await modContext.close();
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToComments(page);
    await expect(page.getByRole('heading', { name: 'Bình luận (0)' })).toBeVisible();
    await expect(page.getByText(body)).toHaveCount(0);
  });

  test('a reader comments on a paragraph by selecting it; nothing is added to the text', async ({
    page,
  }) => {
    const second = `Đoạn thứ hai đáng bàn ${run}.`;
    const story = await createPublishedStory({
      title: `Bình Luận Đoạn ${run}`,
      published: 1,
      extraParagraphs: [second],
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await signUpVerified(page);
    await gotoHydrated(page, story.chapterPath(1));
    const content = page.locator('.reader-content');
    const html = await content.innerHTML();
    const paragraph = content.locator('p[data-pid]').nth(1);
    await expect(paragraph).toHaveText(second);

    // A tap in the middle of the screen, nothing selected, still toggles the reading bars.
    const topBar = page.locator('.reader-top-bar');
    await page.mouse.click(640, 400);
    await expect(topBar).toHaveAttribute('data-hidden');
    await page.mouse.click(640, 400);
    await expect(topBar).not.toHaveAttribute('data-hidden');

    const fab = page.getByRole('button', { name: 'Bình luận đoạn này' });
    await expect(fab).toHaveCount(0);
    await paragraph.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await fab.click();
    const sheet = page.getByRole('dialog', { name: /^Bình luận về đoạn/ });
    await expect(sheet).toContainText(second);
    await expect(paragraph).toHaveAttribute('data-pc-active');
    await sheet.getByLabel('Nội dung bình luận').fill('Câu này viết khéo.');
    await sheet.getByRole('button', { name: 'Gửi' }).click();
    await expect(
      sheet.getByRole('article').filter({ hasText: 'Câu này viết khéo.' }),
    ).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Bình luận về đoạn (1)' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(paragraph).not.toHaveAttribute('data-pc-active');
    // The text is exactly what the server sent: no badge, button or wrapper was put in it.
    expect(await content.innerHTML()).toBe(html);

    // The end of the chapter lists the paragraph, not its comment, and opens it again.
    await scrollToComments(page);
    const section = page.getByRole('region', { name: /^Bình luận/ });
    await expect(section.getByRole('heading', { name: 'Bình luận (0)' })).toBeVisible();
    await expect(section.getByText('Câu này viết khéo.')).toHaveCount(0);
    await section.getByRole('button', { name: 'Theo đoạn (1)' }).click();
    const entry = section.getByRole('button', { name: new RegExp(second) });
    await expect(entry).toContainText('1 bình luận');
    await entry.click();
    await expect(sheet.getByText('Câu này viết khéo.')).toBeVisible();
    await expect(paragraph).toBeInViewport();
  });
});
