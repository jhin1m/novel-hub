import { createTestDb } from '@novel-hub/db/testing';
import { statsDate } from '@novel-hub/shared';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { gotoHydrated, signUpVerified } from './helpers/accounts';
import { chapterText } from './helpers/content';
import { createChapter, createStory, publishChapterViaApi } from './helpers/stories';

// Titles unique to this run, so lookups never match stories from other specs.
const run = Date.now().toString(36);

/**
 * Writes what the worker and readers would have left for the story `publicId`: today's reads per
 * chapter and readers of the story, two readers stopped on chapter 1 and one on chapter 2, and a
 * story follower. E2E runs no worker, so the rows go straight into the test database.
 */
async function seedActivity(publicId: string): Promise<void> {
  const { pool } = createTestDb();
  const today = statsDate(new Date());
  try {
    const story = (
      await pool.query<{ id: string }>('select id from stories where public_id = $1', [publicId])
    ).rows[0];
    if (!story) throw new Error('story missing');
    const chapters = (
      await pool.query<{ id: string; number: number }>(
        'select id, number from chapters where story_id = $1',
        [story.id],
      )
    ).rows;
    const chapterId = (n: number) => chapters.find((c) => c.number === n)?.id;
    await pool.query(
      `insert into chapter_daily_stats (chapter_id, date, views) values ($1, $3, 30), ($2, $3, 12)`,
      [chapterId(1), chapterId(2), today],
    );
    await pool.query(
      `insert into story_daily_stats (story_id, date, unique_readers) values ($1, $2, 9)`,
      [story.id, today],
    );
    const readers = await pool.query<{ id: string }>(
      `insert into users (username, display_name, email, email_verified)
       select 'r_' || $1 || n, 'Độc Giả', 'r-' || $1 || n || '@example.com', true
       from generate_series(1, 3) n returning id`,
      [run],
    );
    const [r1, r2, r3] = readers.rows.map((r) => r.id);
    await pool.query(
      `insert into reading_progress (user_id, story_id, chapter_id)
       values ($1, $4, $5), ($2, $4, $5), ($3, $4, $6)`,
      [r1, r2, r3, story.id, chapterId(1), chapterId(2)],
    );
    await pool.query(
      `insert into follows (user_id, target_type, target_id) values ($1, 'story', $2)`,
      [r1, story.id],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Removes the story's readers again: rankings are recomputed from every story with stats, and the
 * ranking spec expects only its own stories there.
 */
async function clearStoryReaders(publicId: string): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(
      'delete from story_daily_stats where story_id = (select id from stories where public_id = $1)',
      [publicId],
    );
  } finally {
    await pool.end();
  }
}

test.describe('author dashboard', () => {
  test('the author opens the stats of a story from /write; nobody else can', async ({
    page,
    browser,
  }) => {
    await signUpVerified(page);
    const title = `Thống Kê ${run}`;
    const publicId = await createStory(page, title);
    for (const n of [1, 2]) {
      const number = await createChapter(page, publicId);
      await publishChapterViaApi(page, publicId, number, chapterText(n));
    }
    await seedActivity(publicId);
    try {
      await checkDashboard(page, browser, title, publicId);
    } finally {
      await clearStoryReaders(publicId);
    }
  });
});

async function checkDashboard(page: Page, browser: Browser, title: string, publicId: string) {
  await gotoHydrated(page, '/write');
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Số liệu', exact: true })
    .click();
  await expect(page).toHaveURL(`/write/stories/${publicId}/stats`);
  await expect(page.getByRole('heading', { level: 1, name: 'Số liệu truyện' })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  const totals = page.getByRole('definition');
  await expect(totals.filter({ hasText: /^42$/ })).toBeVisible();
  await expect(totals.filter({ hasText: /^9$/ })).toBeVisible();
  await expect(page.getByText('Tổng 1 người theo dõi truyện')).toBeVisible();

  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Bỏ dở' })).toBeVisible();
  const row = (n: number) => table.getByRole('row').filter({ hasText: `Chương ${n}` });
  // Chapter 1: 30 reads, all 3 readers reached it, 2 of them stopped there.
  await expect(row(1).getByRole('cell')).toHaveText(['30', '3', '66,7%']);
  await expect(row(2).getByRole('cell')).toHaveText(['12', '1', '—']);

  const res = await page.request.get(`/write/stories/${publicId}/stats`);
  expect(res.headers()['cache-control']).toBe('no-store');

  // Another writer gets the same answer as for a story that does not exist.
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signUpVerified(other);
    await gotoHydrated(other, `/write/stories/${publicId}/stats`);
    await expect(other.getByText('Không tìm thấy truyện')).toBeVisible();
    await expect(other.getByRole('table')).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
}
