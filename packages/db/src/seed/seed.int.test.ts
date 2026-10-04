import { isValidPublicId, slugify } from '@novel-hub/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  accounts,
  chapterContents,
  chapterDrafts,
  chapters,
  stories,
  storyTags,
  tags,
  users,
} from '../schema/index';
import { createTestDb, truncateAll } from '../testing/index';
import { countWords, seedDatabase } from './seed';

const { db, pool } = createTestDb();
const NOW = new Date('2026-10-04T12:00:00Z');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

describe('seedDatabase', () => {
  it('nạp được vào DB trống', async () => {
    const summary = await seedDatabase(db, { now: NOW });
    expect(summary).toEqual({ users: 5, accounts: 0, tags: 13, stories: 3, chapters: 8 });
    expect(await db.select().from(accounts)).toHaveLength(0);
    const banned = await db.select().from(users).where(eq(users.status, 'banned'));
    expect(banned).toHaveLength(1);
    const all = await db.select({ emailVerified: users.emailVerified }).from(users);
    expect(all.every((u) => u.emailVerified)).toBe(true);
  });

  it('bộ đếm story khớp chương đã đăng chưa xoá', async () => {
    await seedDatabase(db, { now: NOW });
    const { rows } = await db.execute<{ title: string; ok: boolean }>(sql`
      select s.title,
        s.word_count = coalesce(sum(c.word_count), 0)
        and s.chapter_count = count(c.id)
        and s.last_chapter_at is not distinct from max(c.published_at) as ok
      from stories s
      left join chapters c
        on c.story_id = s.id and c.status = 'published' and c.deleted_at is null
      group by s.id
    `);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row, row.title).toMatchObject({ ok: true });

    const [first] = await db.select().from(stories).where(eq(stories.title, 'Kiếm Đạo Độc Tôn'));
    expect(first).toMatchObject({ chapterCount: 3, visibility: 'published' });
    expect(first?.lastChapterAt?.getTime()).toBe(NOW.getTime() - 24 * 60 * 60 * 1000);
  });

  it('story có public_id hợp lệ, slug sinh từ tiêu đề', async () => {
    await seedDatabase(db, { now: NOW });
    const rows = await db.select().from(stories);
    for (const story of rows) {
      expect(isValidPublicId(story.publicId)).toBe(true);
      expect(story.slug).toBe(slugify(story.title));
    }
  });

  it('chương đã đăng/hẹn giờ có nội dung ≥ 300 chữ, chương nháp có bản nháp', async () => {
    await seedDatabase(db, { now: NOW });
    const rows = await db
      .select({
        status: chapters.status,
        wordCount: chapters.wordCount,
        scheduledAt: chapters.scheduledAt,
        html: chapterContents.html,
        paragraphIds: chapterContents.paragraphIds,
        draft: chapterDrafts.docJson,
      })
      .from(chapters)
      .leftJoin(chapterContents, eq(chapterContents.chapterId, chapters.id))
      .leftJoin(chapterDrafts, eq(chapterDrafts.chapterId, chapters.id));

    expect(rows.filter((r) => r.status === 'published')).toHaveLength(5);
    expect(rows.filter((r) => r.status === 'draft')).toHaveLength(2);
    for (const row of rows) {
      if (row.status === 'draft') {
        expect(row.draft).not.toBeNull();
        expect(row.html).toBeNull();
        continue;
      }
      expect(row.wordCount).toBeGreaterThanOrEqual(300);
      expect(row.paragraphIds?.length).toBeGreaterThan(0);
      for (const pid of row.paragraphIds ?? []) expect(row.html).toContain(`data-pid="${pid}"`);
      if (row.status === 'scheduled')
        expect(row.scheduledAt?.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('truyện 18+ gắn tag warning; tag trùng trỏ về tag chuẩn', async () => {
    await seedDatabase(db, { now: NOW });
    const warningTags = await db
      .select({ slug: tags.slug })
      .from(storyTags)
      .innerJoin(stories, eq(stories.id, storyTags.storyId))
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(sql`${stories.isMature} and ${tags.kind} = 'warning'`);
    expect(warningTags.length).toBeGreaterThan(0);

    const { rows } = await db.execute<{ canonical: string }>(sql`
      select c.slug as canonical from tags t join tags c on c.id = t.canonical_id
      where t.slug = 'tu-tien'
    `);
    expect(rows[0]?.canonical).toBe('tien-hiep');
  });

  it('chạy lần 2 khi users có dữ liệu → từ chối, không ghi thêm gì', async () => {
    await seedDatabase(db, { now: NOW });
    await expect(seedDatabase(db, { now: NOW })).rejects.toThrow(/users đã có dữ liệu/);
    expect(await db.select().from(stories)).toHaveLength(3);
  });

  it('truncate rồi seed lại chạy được', async () => {
    await seedDatabase(db, { now: NOW });
    await truncateAll(db);
    const summary = await seedDatabase(db, { now: NOW });
    expect(summary.users).toBe(5);
  });

  it('có hashPassword + password → tạo account credential cho mọi user', async () => {
    const summary = await seedDatabase(db, {
      now: NOW,
      password: 'mat-khau-mau',
      hashPassword: (p) => Promise.resolve(`hashed:${p}`),
    });
    expect(summary.accounts).toBe(5);
    const rows = await db.select().from(accounts);
    for (const account of rows) {
      expect(account).toMatchObject({ providerId: 'credential', password: 'hashed:mat-khau-mau' });
      expect(account.accountId).toBe(account.userId);
    }
  });

  it('chỉ truyền một trong hashPassword/password → lỗi, không ghi gì', async () => {
    await expect(seedDatabase(db, { password: 'x' })).rejects.toThrow(/cùng nhau/);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe('countWords', () => {
  it('đếm theo khoảng trắng, bỏ khoảng trắng thừa', () => {
    expect(countWords('  Lâm   Phong\nngồi xếp bằng ')).toBe(5);
    expect(countWords('')).toBe(0);
  });
});
