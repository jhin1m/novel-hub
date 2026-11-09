import {
  chapters,
  comments,
  ratings,
  readingProgress,
  storyNominations,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { updatePreferences } from '../users/preferences';
import { getTopReaders } from './top-readers';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** A published story plus helpers writing each signal straight into its tables. */
async function setup(opts: { isMature?: boolean } = {}) {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1, 'Truyện Gắn Bó', opts);
  const { storyId } = story;

  const chapterId = async (number: number): Promise<string> => {
    const [existing] = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
    if (existing) return existing.id;
    const [row] = await db
      .insert(chapters)
      .values({ storyId, number, status: 'published', publishedAt: new Date() })
      .returning({ id: chapters.id });
    if (!row) throw new Error('chapter insert failed');
    return row.id;
  };

  return {
    author,
    story,
    read: async (userId: string, number: number) => {
      await db
        .insert(readingProgress)
        .values({ userId, storyId, chapterId: await chapterId(number) });
    },
    comment: async (userId: string, number: number, status = 'visible') => {
      await db
        .insert(comments)
        .values({ storyId, userId, chapterId: await chapterId(number), body: 'Hay', status });
    },
    rate: async (userId: string, status = 'visible') => {
      await db.insert(ratings).values({ storyId, userId, score: 4, status });
    },
    nominate: async (userId: string, weekStart = '2026-10-05') => {
      await db.insert(storyNominations).values({ storyId, userId, weekStart });
    },
  };
}

async function top(publicId: string, viewer: { id: string } | null = null) {
  const result = await getTopReaders(db, viewer, publicId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('getTopReaders', () => {
  it('scores chapters, commented chapters, rating and nominations, never exposing the score', async () => {
    const s = await setup();
    const fan = await makeUser(db, 'fan');
    // 7 (chapter) + 2 × 2 (two chapters commented) + 5 (rating) + 3 (one nomination) = 19.
    await s.read(fan.id, 7);
    await s.comment(fan.id, 1);
    await s.comment(fan.id, 1);
    await s.comment(fan.id, 2);
    await s.comment(fan.id, 3, 'hidden_by_mod');
    await s.comment(fan.id, 4, 'deleted');
    await s.rate(fan.id);
    await s.nominate(fan.id);

    // Chapter 2000 counts as the cap (100) + one nomination = 103.
    const binge = await makeUser(db, 'binge');
    await s.read(binge.id, 2000);
    await s.nominate(binge.id);

    // Reads a lot, but left no public trace (a hidden rating is not one): never listed.
    const silent = await makeUser(db, 'silent');
    await s.read(silent.id, 50);
    await s.rate(silent.id, 'hidden_by_mod');

    // The author and accounts that are not active are left out.
    await s.comment(s.author.id, 1);
    for (const [name, status] of [
      ['muted_one', 'muted'],
      ['banned_one', 'banned'],
    ] as const) {
      const user = await makeUser(db, name);
      await s.comment(user.id, 1);
      await db.update(users).set({ status }).where(eq(users.id, user.id));
    }

    const readers = await top(s.story.publicId);
    expect(readers).toEqual([
      { rank: 1, username: 'binge', displayName: 'Name binge' },
      { rank: 2, username: 'fan', displayName: 'Name fan' },
    ]);
    expect(JSON.stringify(readers)).not.toContain('score');
  });

  it('keeps ten readers and breaks ties by username', async () => {
    const s = await setup();
    for (let i = 11; i >= 0; i--) {
      const user = await makeUser(db, `reader_${String(i).padStart(2, '0')}`);
      await s.nominate(user.id);
    }
    const readers = await top(s.story.publicId);
    expect(readers.map((r) => r.username)).toEqual(
      Array.from({ length: 10 }, (_, i) => `reader_${String(i).padStart(2, '0')}`),
    );
    expect(readers.map((r) => r.rank)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it('never lists the readers of an 18+ story', async () => {
    const s = await setup({ isMature: true });
    const fan = await makeUser(db, 'fan');
    await s.rate(fan.id);
    expect(await getTopReaders(db, null, s.story.publicId)).toEqual({
      ok: false,
      error: 'MATURE_CONTENT_DISABLED',
    });
    expect(await getTopReaders(db, fan, s.story.publicId)).toEqual({
      ok: false,
      error: 'MATURE_CONTENT_DISABLED',
    });
    await updatePreferences(db, fan.id, { showMature: true, confirmAdult: true });
    expect(await top(s.story.publicId, fan)).toEqual([]);
  });

  it('answers NOT_FOUND for a story nobody can read', async () => {
    expect(await getTopReaders(db, null, 'zzzzzzzz')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});
