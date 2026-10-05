import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { arrayOverlaps, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from './client';
import {
  chapterContents,
  chapterFingerprints,
  chapters,
  contentEvents,
  featuredSlots,
  ratings,
  readingProgress,
  reports,
  stories,
  storyTags,
  tags,
  users,
} from './schema/index';
import { catchPgError, createTestDb, truncateAll } from './testing/index';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function insertUser(username = 'nguoi_dung') {
  const [user] = await db
    .insert(users)
    .values({ username, displayName: 'Người dùng', email: `${username}@novelhub.local` })
    .returning();
  if (!user) throw new Error('insert user');
  return user;
}

/** Tạo user + tag + story + một chương có nội dung. */
async function insertStoryGraph() {
  const user = await insertUser();
  const [tag] = await db
    .insert(tags)
    .values({ slug: 'tien-hiep', name: 'Tiên hiệp', kind: 'genre' })
    .returning();
  if (!tag) throw new Error('insert tag');
  const [story] = await db
    .insert(stories)
    .values({
      publicId: 'k7m2xq9p',
      slug: 'truyen-thu',
      authorId: user.id,
      title: 'Truyện thử',
      mainTagId: tag.id,
    })
    .returning();
  if (!story) throw new Error('insert story');
  await db.insert(storyTags).values({ storyId: story.id, tagId: tag.id });
  const [chapter] = await db.insert(chapters).values({ storyId: story.id, number: 1 }).returning();
  if (!chapter) throw new Error('insert chapter');
  await db.insert(chapterContents).values({
    chapterId: chapter.id,
    docJson: { type: 'doc' },
    html: '<p data-pid="p1">Xin chào</p>',
    paragraphIds: ['p1'],
    contentHash: 'hash',
  });
  return { user, tag, story, chapter };
}

describe('migration', () => {
  it('creates all 25 tables in the public schema', async () => {
    const { rows } = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    expect(rows[0]?.count).toBe(25);
  });

  it('insert không truyền id → UUID version 7', async () => {
    const { user, tag, story, chapter } = await insertStoryGraph();
    for (const row of [user, tag, story, chapter]) expect(row.id).toMatch(UUID_V7);
  });

  it('giá trị mặc định: role, status, preferences, visibility', async () => {
    const { user, story, chapter } = await insertStoryGraph();
    expect(user).toMatchObject({
      role: 'reader',
      status: 'active',
      emailVerified: false,
      preferences: {},
    });
    expect(story).toMatchObject({ visibility: 'draft', status: 'ongoing', synopsis: '' });
    expect(chapter.status).toBe('draft');
  });

  it('content_events: defaults to pending with zero attempts and keeps the payload', async () => {
    const payload = { entity: 'story', action: 'updated', storyId: 'x' };
    const [row] = await db.insert(contentEvents).values({ payload }).returning();
    expect(row).toMatchObject({ payload, processedAt: null, attempts: 0 });
    expect(row?.id).toMatch(UUID_V7);
  });

  it('pool đặt statement_timeout 15 giây', async () => {
    const { rows } = await db.execute<{ statement_timeout: string }>(sql`show statement_timeout`);
    expect(rows[0]?.statement_timeout).toBe('15s');
  });
});

describe('pool', () => {
  it('Postgres cắt kết nối đang dùng trong transaction → chỉ transaction lỗi, process không crash', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const victim = createTestDb();
    try {
      const tx = victim.db.transaction(async (t) => {
        const { rows } = await t.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        await db.execute(sql`select pg_terminate_backend(${rows[0]?.pid})`);
        await t.execute(sql`select 1`);
      });
      await expect(tx).rejects.toThrow();
      // Pool vẫn dùng tiếp được với kết nối mới.
      const { rows } = await victim.db.execute<{ one: number }>(sql`select 1 as one`);
      expect(rows[0]?.one).toBe(1);
      expect(log).toHaveBeenCalledWith('[db] kết nối bị đứt:', expect.any(String));
    } finally {
      await victim.pool.end();
      log.mockRestore();
    }
  });
});

describe('ràng buộc', () => {
  it('trùng (story_id, number) → lỗi unique, kể cả khi chương cũ đã xoá mềm', async () => {
    const { story, chapter } = await insertStoryGraph();
    await db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, chapter.id));
    const err = await catchPgError(db.insert(chapters).values({ storyId: story.id, number: 1 }));
    expect(err.code).toBe('23505');
    expect(err.constraint).toBe('chapters_story_id_number_key');
  });

  it('number <= 0 → vi phạm CHECK', async () => {
    const { story } = await insertStoryGraph();
    const err = await catchPgError(db.insert(chapters).values({ storyId: story.id, number: 0 }));
    expect(err.constraint).toBe('chapters_number_positive');
  });

  it('username sai định dạng → vi phạm CHECK', async () => {
    for (const username of ['AB', 'Hoa_Thuong', 'có-dấu', 'ab', 'a'.repeat(31)]) {
      const err = await catchPgError(insertUser(username));
      expect(err.code).toBe('23514');
      expect(err.constraint).toBe('users_username_format');
    }
  });

  it('trùng username hoặc email → lỗi unique', async () => {
    await insertUser('trung_ten');
    const dupName = await catchPgError(
      db.insert(users).values({ username: 'trung_ten', displayName: 'X', email: 'x@a.local' }),
    );
    expect(dupName.constraint).toBe('users_username_key');
    const dupEmail = await catchPgError(
      db
        .insert(users)
        .values({ username: 'ten_khac', displayName: 'X', email: 'trung_ten@novelhub.local' }),
    );
    expect(dupEmail.constraint).toBe('users_email_key');
  });

  it('trùng public_id → lỗi unique stories_public_id_key', async () => {
    const { user, tag } = await insertStoryGraph();
    const err = await catchPgError(
      db.insert(stories).values({
        publicId: 'k7m2xq9p',
        slug: 'khac',
        authorId: user.id,
        title: 'Khác',
        mainTagId: tag.id,
      }),
    );
    expect(err.constraint).toBe('stories_public_id_key');
  });

  it('tag không được tự trỏ về chính nó', async () => {
    const { tag } = await insertStoryGraph();
    const err = await catchPgError(
      db.update(tags).set({ canonicalId: tag.id }).where(eq(tags.id, tag.id)),
    );
    expect(err.constraint).toBe('tags_canonical_not_self');
  });

  it('scroll_pct ngoài 0..100 → vi phạm CHECK', async () => {
    const { user, story, chapter } = await insertStoryGraph();
    const base = { userId: user.id, storyId: story.id, chapterId: chapter.id };
    for (const scrollPct of [150, -1]) {
      const err = await catchPgError(db.insert(readingProgress).values({ ...base, scrollPct }));
      expect(err.constraint).toBe('reading_progress_scroll_pct_range');
    }
    await db.insert(readingProgress).values({ ...base, scrollPct: 100 });
  });

  it('featured_slots: ends_at <= starts_at → vi phạm CHECK', async () => {
    const { story } = await insertStoryGraph();
    const startsAt = new Date('2026-10-01T00:00:00Z');
    for (const endsAt of [startsAt, new Date('2026-09-30T00:00:00Z')]) {
      const err = await catchPgError(
        db.insert(featuredSlots).values({ storyId: story.id, slot: 'home', startsAt, endsAt }),
      );
      expect(err.constraint).toBe('featured_slots_time_range');
    }
  });

  it('ratings.score ngoài 1..5 → vi phạm CHECK; 1 và 5 hợp lệ', async () => {
    const { user, story } = await insertStoryGraph();
    for (const score of [0, 6]) {
      const err = await catchPgError(
        db.insert(ratings).values({ userId: user.id, storyId: story.id, score }),
      );
      expect(err.constraint).toBe('ratings_score_range');
    }
    await db.insert(ratings).values({ userId: user.id, storyId: story.id, score: 1 });
    await db.update(ratings).set({ score: 5 }).where(eq(ratings.userId, user.id));
  });
});

describe('duplicate check', () => {
  it('finds overlapping LSH keys through the GIN index', async () => {
    const { chapter } = await insertStoryGraph();
    await db
      .insert(chapterFingerprints)
      .values({ chapterId: chapter.id, minhash: [1, 2], simhash: -5n, lshKeys: [7, -9] });
    const found = await db
      .select({ id: chapterFingerprints.chapterId, simhash: chapterFingerprints.simhash })
      .from(chapterFingerprints)
      .where(arrayOverlaps(chapterFingerprints.lshKeys, [-9, 100]));
    expect(found).toEqual([{ id: chapter.id, simhash: -5n }]);

    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const { rows } = await tx.execute<{ 'QUERY PLAN': string }>(
        sql`explain select chapter_id from chapter_fingerprints where lsh_keys && '{7}'::int[]`,
      );
      return rows.map((row) => row['QUERY PLAN']).join('\n');
    });
    expect(plan).toContain('chapter_fingerprints_lsh_keys_idx');
  });

  it('keeps one open automatic report per target and reason, any number of handled ones', async () => {
    const { user, chapter } = await insertStoryGraph();
    const auto = { targetType: 'chapter', targetId: chapter.id, reason: 'duplicate' };
    await db.insert(reports).values(auto);
    const err = await catchPgError(db.insert(reports).values(auto));
    expect(err.constraint).toBe('reports_open_auto_key');

    // Handled automatic reports and reports filed by users are not limited.
    await db.update(reports).set({ status: 'dismissed' });
    await db.insert(reports).values(auto);
    await db.insert(reports).values({ ...auto, reporterId: user.id });
    await db.insert(reports).values({ ...auto, reporterId: user.id });
    expect(await db.$count(reports)).toBe(4);
  });
});

describe('khoá ngoại', () => {
  it('xoá story → chapters, chapter_contents, story_tags bị xoá theo', async () => {
    const { story, chapter } = await insertStoryGraph();
    await db.delete(stories).where(eq(stories.id, story.id));
    expect(await db.select().from(chapters)).toHaveLength(0);
    expect(
      await db.select().from(chapterContents).where(eq(chapterContents.chapterId, chapter.id)),
    ).toHaveLength(0);
    expect(await db.select().from(storyTags)).toHaveLength(0);
    // Tag không bị xoá theo story.
    expect(await db.select().from(tags)).toHaveLength(1);
  });

  it('xoá user đang có story → bị chặn', async () => {
    const { user } = await insertStoryGraph();
    const err = await catchPgError(db.delete(users).where(eq(users.id, user.id)));
    // ON DELETE RESTRICT báo restrict_violation (23001), không phải 23503.
    expect(err.code).toBe('23001');
    expect(err.constraint).toBe('stories_author_id_users_id_fk');
  });

  it('xoá tag đang là tag chính của story → bị chặn', async () => {
    const { tag } = await insertStoryGraph();
    const err = await catchPgError(db.delete(tags).where(eq(tags.id, tag.id)));
    expect(err.code).toBe('23001');
    expect(err.constraint).toBe('stories_main_tag_id_tags_id_fk');
  });
});

describe('truncateAll', () => {
  it('DB không đuôi _test → throw, không chạy câu lệnh xoá nào', async () => {
    const calls: unknown[] = [];
    const fake = {
      execute: (query: unknown) => {
        calls.push(query);
        return Promise.resolve({ rows: [{ name: 'novel_hub' }] });
      },
    } as unknown as Parameters<typeof truncateAll>[0];
    await expect(truncateAll(fake)).rejects.toThrow(/Từ chối truncate/);
    expect(calls).toHaveLength(1);
  });

  it('trỏ vào DB dev thật → throw', async () => {
    const { DATABASE_URL } = loadServerEnv(dbEnvSchema);
    const dev = createDb(DATABASE_URL, { max: 1 });
    try {
      await expect(truncateAll(dev.db)).rejects.toThrow(/Từ chối truncate/);
    } finally {
      await dev.pool.end();
    }
  });
});
