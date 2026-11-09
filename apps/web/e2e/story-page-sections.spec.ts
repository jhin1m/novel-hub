import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUp, signUpVerified } from './helpers/accounts';
import { type PublishedStory, createPublishedStory } from './helpers/content';
import { makeModerator } from './helpers/moderation';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

async function query<T = unknown>(sql: string, params: unknown[]): Promise<T[]> {
  const { pool } = createTestDb();
  try {
    return (await pool.query(sql, params)).rows as T[];
  } finally {
    await pool.end();
  }
}

const storyPath = (story: PublishedStory) => canonicalPath({ kind: 'story', ...story });

/** Hands `story` to the author of `owner`, so both count as the same author's. */
async function moveToAuthorOf(story: PublishedStory, owner: PublishedStory) {
  await query(
    `update stories set author_id = (select author_id from stories where public_id = $2)
     where public_id = $1`,
    [story.publicId, owner.publicId],
  );
}

/** An announcement on the story, by its author, `minutesAgo` minutes old. */
async function seedAnnouncement(publicId: string, body: string, minutesAgo: number) {
  await query(
    `insert into story_announcements (story_id, author_id, body, created_at)
     select id, author_id, $2, now() - make_interval(mins => $3) from stories where public_id = $1`,
    [publicId, body, minutesAgo],
  );
}

/** Hands the story to the signed-up account, so it may pin comments under it. */
async function makeAuthorOf(publicId: string, email: string) {
  await query(
    'update stories set author_id = (select id from users where email = $2) where public_id = $1',
    [publicId, email],
  );
}

/** Opens `/moderation` as a fresh moderator in a browser of their own, then runs `act` there. */
async function asModerator(browser: Browser, act: (modPage: Page) => Promise<void>) {
  const modContext = await browser.newContext();
  try {
    const modPage = await modContext.newPage();
    const mod = await signUp(modPage);
    await makeModerator(mod.email);
    await gotoHydrated(modPage, '/moderation');
    await act(modPage);
  } finally {
    await modContext.close();
  }
}

const discussionOf = (page: Page) => page.getByRole('region', { name: /^Thảo luận/ });

async function scrollToDiscussion(page: Page) {
  await page.getByRole('heading', { name: /^Thảo luận/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /^Thảo luận \(\d+\)$/ })).toBeVisible();
}

test.describe('story page sections', () => {
  test('related stories load in the browser only: the same author, then the same main tag, no 18+', async ({
    page,
  }) => {
    test.slow();
    const origin = await createPublishedStory({ title: `Gốc Liên Quan ${run}`, published: 1 });
    const sibling = await createPublishedStory({ title: `Cùng Tác Giả ${run}`, published: 1 });
    const matureSibling = await createPublishedStory({
      title: `Cùng Tác Giả 18 ${run}`,
      published: 1,
      isMature: true,
    });
    // The same-tag list wants stories past the home listing threshold.
    const sameTag = await createPublishedStory({
      title: `Cùng Tiên Hiệp ${run}`,
      published: 3,
      wordsPerChapter: 1_700,
    });
    const thin = await createPublishedStory({ title: `Mỏng Quá ${run}`, published: 1 });
    await moveToAuthorOf(sibling, origin);
    await moveToAuthorOf(matureSibling, origin);

    // The cached HTML has none of them, and stays the same for everyone.
    const res = await page.request.get(storyPath(origin));
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe(
      'public, s-maxage=86400, stale-while-revalidate=3600',
    );
    expect(res.headers()['set-cookie']).toBeUndefined();
    const html = await res.text();
    for (const other of [sibling, matureSibling, sameTag, thin]) {
      expect(html).not.toContain(other.title);
    }

    await gotoHydrated(page, storyPath(origin));
    await page.keyboard.press('End');
    const related = page.getByRole('region', { name: 'Truyện liên quan' });
    await expect(related).toBeVisible();
    const byAuthor = related.getByRole('region', { name: 'Cùng tác giả' });
    await expect(byAuthor.getByRole('link', { name: sibling.title })).toBeVisible();
    await expect(byAuthor.getByText(origin.title)).toHaveCount(0);
    const byTag = related.getByRole('region', { name: 'Cùng thể loại Tiên hiệp' });
    await expect(byTag.getByRole('link', { name: sameTag.title })).toBeVisible();
    await expect(related.getByText(matureSibling.title)).toHaveCount(0);
    await expect(related.getByText(thin.title)).toHaveCount(0);
  });

  test('the latest announcement is in the page; a reported one hidden by a moderator is gone', async ({
    page,
    browser,
  }) => {
    test.slow();
    const story = await createPublishedStory({ title: `Thông Báo Trang ${run}`, published: 1 });
    const latest = `Thứ Hai ra ba chương ${run}`;
    await seedAnnouncement(story.publicId, `Thông báo cũ ${run}`, 60);
    await seedAnnouncement(story.publicId, latest, 5);

    const html = await (await page.request.get(storyPath(story))).text();
    expect(html).toContain(latest);
    expect(html).not.toContain(`Thông báo cũ ${run}`);

    await signUp(page);
    await gotoHydrated(page, storyPath(story));
    const announcement = page.locator('#announcements');
    await expect(
      announcement.getByRole('heading', { name: 'Thông báo của tác giả' }),
    ).toBeVisible();
    await expect(announcement).toContainText(latest);
    await announcement.getByRole('button', { name: 'Báo cáo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Báo cáo thông báo của tác giả' });
    await dialog.getByLabel('Spam').check();
    await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Đã gửi báo cáo. Cảm ơn bạn!');

    await asModerator(browser, async (modPage) => {
      const card = modPage.getByRole('article').filter({ hasText: latest });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('Thông báo của tác giả');
      await card.getByRole('button', { name: 'Ẩn thông báo' }).click();
      await expect(card).toHaveCount(0);
    });

    // Rendered straight by the server (no CDN in e2e): the older one is the latest visible now.
    const after = await (await page.request.get(storyPath(story))).text();
    expect(after).not.toContain(latest);
    expect(after).toContain(`Thông báo cũ ${run}`);
  });

  test('the discussion: a guest is sent to sign in; readers post, reply and edit; the author pins', async ({
    page,
    browser,
  }) => {
    test.slow();
    const story = await createPublishedStory({ title: `Thảo Luận Trang ${run}`, published: 1 });

    await gotoHydrated(page, storyPath(story));
    await scrollToDiscussion(page);
    const discussion = discussionOf(page);
    await expect(discussion.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    await expect(discussion.getByRole('textbox')).toHaveCount(0);

    const reader = await signUpVerified(page);
    await gotoHydrated(page, storyPath(story));
    await scrollToDiscussion(page);
    const first = `Mở đầu thảo luận ${run}`;
    await discussion.getByLabel('Nội dung bình luận').fill(first);
    await discussion.getByRole('button', { name: 'Gửi' }).click();
    const thread = discussion.getByRole('article').filter({ hasText: first });
    await expect(thread).toBeVisible();
    await expect(discussion.getByRole('heading', { name: 'Thảo luận (1)' })).toBeVisible();

    await thread.getByRole('button', { name: 'Trả lời' }).click();
    await discussion.getByLabel(`Trả lời ${reader.name}`).fill(`Một phản hồi ${run}`);
    await discussion.getByRole('button', { name: 'Gửi' }).last().click();
    await expect(discussion.getByText(`Một phản hồi ${run}`)).toBeVisible();

    await thread.getByRole('button', { name: 'Sửa' }).first().click();
    await discussion.getByLabel('Sửa bình luận').fill(`${first} (đã bổ sung)`);
    await discussion.getByRole('button', { name: 'Lưu' }).click();
    const edited = discussion.getByRole('article').filter({ hasText: `${first} (đã bổ sung)` });
    await expect(edited.first()).toContainText('đã sửa');

    // A second, newer thread; the author pins the first one back on top.
    const second = `Thảo luận thứ hai ${run}`;
    await discussion.getByLabel('Nội dung bình luận').first().fill(second);
    await discussion.getByRole('button', { name: 'Gửi' }).first().click();
    await expect(discussion.getByRole('article').first()).toContainText(second);

    const authorContext = await browser.newContext();
    try {
      const authorPage = await authorContext.newPage();
      const author = await signUpVerified(authorPage);
      await makeAuthorOf(story.publicId, author.email);
      await gotoHydrated(authorPage, storyPath(story));
      await scrollToDiscussion(authorPage);
      const authorDiscussion = discussionOf(authorPage);
      const pinned = authorDiscussion.getByRole('article').filter({ hasText: first }).first();
      await pinned.getByRole('button', { name: 'Ghim', exact: true }).click();
      await expect(pinned).toContainText('Đã ghim');
      await expect(authorDiscussion.getByRole('article').first()).toContainText(first);
    } finally {
      await authorContext.close();
    }
  });

  test('a reported discussion comment shows as such to moderators, who hide it', async ({
    page,
    browser,
  }) => {
    test.slow();
    const story = await createPublishedStory({ title: `Báo Cáo Thảo Luận ${run}`, published: 1 });
    const body = `Quảng cáo trong thảo luận ${run}`;
    await query(
      `insert into comments (story_id, user_id, body)
       select id, author_id, $2 from stories where public_id = $1`,
      [story.publicId, body],
    );

    await signUp(page);
    await gotoHydrated(page, storyPath(story));
    await scrollToDiscussion(page);
    const comment = discussionOf(page).getByRole('article').filter({ hasText: body });
    await comment.getByRole('button', { name: 'Báo cáo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Báo cáo bình luận' });
    await dialog.getByLabel('Spam').check();
    await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Đã gửi báo cáo. Cảm ơn bạn!');

    await asModerator(browser, async (modPage) => {
      const card = modPage.getByRole('article').filter({ hasText: body });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('Thảo luận của truyện');
      await card.getByRole('button', { name: 'Ẩn bình luận' }).click();
      await expect(card).toHaveCount(0);
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await scrollToDiscussion(page);
    await expect(discussionOf(page).getByText(body)).toHaveCount(0);
  });

  test('an 18+ story keeps its discussion and top readers out of reach without the setting', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Thảo Luận 18 ${run}`, isMature: true });
    const discussionCalls: string[] = [];
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (path.startsWith('/api/v1/comments') || path.includes('/top-readers/')) {
        discussionCalls.push(path);
      }
    });

    await gotoHydrated(page, storyPath(story));
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Độc giả gắn bó' })).toHaveCount(0);
    expect(discussionCalls).toEqual([]);

    // Signed in without the setting, the API itself refuses the discussion.
    await signUpVerified(page);
    const res = await page.request.get(`/api/v1/comments/discussion?story=${story.publicId}`);
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'MATURE_CONTENT_DISABLED',
    );
  });

  test('top readers are ranked by their public trace and progress, without scores', async ({
    page,
  }) => {
    const story = await createPublishedStory({ title: `Xếp Hạng Người Đọc ${run}`, published: 3 });
    // Three commenters who reached chapters 3, 1 and 2, and one who only reads (not listed).
    const readers = [
      { name: `Xa Nhất ${run}`, chapter: 3, comments: true },
      { name: `Gần Nhất ${run}`, chapter: 1, comments: true },
      { name: `Giữa ${run}`, chapter: 2, comments: true },
      { name: `Chỉ Đọc ${run}`, chapter: 3, comments: false },
    ];
    for (const [i, reader] of readers.entries()) {
      const username = `tr_${run}_${i}`;
      await query(
        `with u as (
           insert into users (username, display_name, email, email_verified)
           values ($1, $2, $1 || '@example.com', true) returning id
         ), s as (select id from stories where public_id = $3)
         insert into reading_progress (user_id, story_id, chapter_id, scroll_pct)
         select u.id, s.id, c.id, 50 from u, s join chapters c on c.story_id = s.id and c.number = $4`,
        [username, reader.name, story.publicId, reader.chapter],
      );
      if (reader.comments) {
        await query(
          `insert into comments (chapter_id, story_id, user_id, body)
           select c.id, s.id, u.id, 'Hay' from stories s
           join chapters c on c.story_id = s.id and c.number = 1, users u
           where s.public_id = $1 and u.username = $2`,
          [story.publicId, username],
        );
      }
    }

    await gotoHydrated(page, storyPath(story));
    const section = page.getByRole('region', { name: 'Độc giả gắn bó', exact: true });
    await section.scrollIntoViewIfNeeded();
    const names = section.getByRole('listitem');
    await expect(names).toHaveCount(3);
    await expect(names.nth(0)).toContainText(`Xa Nhất ${run}`);
    await expect(names.nth(1)).toContainText(`Giữa ${run}`);
    await expect(names.nth(2)).toContainText(`Gần Nhất ${run}`);
    await expect(section).not.toContainText(`Chỉ Đọc ${run}`);
    await expect(section).not.toContainText(/điểm/i);
    // "Nominate" stays in the hero (a sign-in link for a guest).
    await expect(
      page
        .getByRole('region', { name: story.title })
        .getByRole('link', { name: 'Đề cử', exact: true }),
    ).toBeVisible();
  });
});
