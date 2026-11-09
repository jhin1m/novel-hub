import { storyAnnouncements, stories, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getStoryPage } from '../catalog/story-page';
import type { StoryActor } from '../policies/story';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listRelatedStories } from './list-related-stories';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T12:00:00Z');

async function tagId(slug: string): Promise<string> {
  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug));
  if (!row) throw new Error(`tag ${slug} missing`);
  return row.id;
}

/**
 * A published story (main tag `tien-hiep`) past the home listing threshold, updated `hoursAgo`
 * hours before NOW, unless `values` says otherwise. Returns its public id.
 */
async function story(
  author: StoryActor,
  title: string,
  hoursAgo: number,
  values: Partial<typeof stories.$inferInsert> = {},
): Promise<string> {
  const s = await makePublishedStory(db, author, 1, title);
  await db
    .update(stories)
    .set({
      chapterCount: 3,
      wordCount: 5_000,
      lastChapterAt: new Date(NOW - hoursAgo * HOUR_MS),
      ...values,
    })
    .where(eq(stories.id, s.storyId));
  return s.publicId;
}

const titles = (list: { title: string }[]) => list.map((s) => s.title);

describe('listRelatedStories', () => {
  it('lists up to 4 other stories of the author, most recently updated first', async () => {
    const author = await makeAuthor(db);
    const origin = await story(author, 'Gốc', 0);
    for (let i = 1; i <= 5; i++) await story(author, `Cùng Tác Giả ${i}`, i);
    // The author's own suggestions need no threshold.
    await story(author, 'Mỏng', 6, { chapterCount: 1, wordCount: 320 });

    const related = await listRelatedStories(db, origin);
    expect(titles(related?.sameAuthor ?? [])).toEqual([
      'Cùng Tác Giả 1',
      'Cùng Tác Giả 2',
      'Cùng Tác Giả 3',
      'Cùng Tác Giả 4',
    ]);
  });

  it('lists up to 6 stories of the same main tag past the threshold, none from the author list', async () => {
    const author = await makeAuthor(db);
    const other = await makeAuthor(db, 'other_author');
    const origin = await story(author, 'Gốc', 0);
    await story(author, 'Cùng Tác Giả', 1);
    for (let i = 1; i <= 7; i++) await story(other, `Cùng Tag ${i}`, i);
    await story(other, 'Dưới Ngưỡng', 0, { wordCount: 4_999 });
    await story(other, 'Khác Tag', 0, { mainTagId: await tagId('do-thi') });

    const related = await listRelatedStories(db, origin);
    expect(titles(related?.sameAuthor ?? [])).toEqual(['Cùng Tác Giả']);
    expect(titles(related?.sameMainTag ?? [])).toEqual([
      'Cùng Tag 1',
      'Cùng Tag 2',
      'Cùng Tag 3',
      'Cùng Tag 4',
      'Cùng Tag 5',
      'Cùng Tag 6',
    ]);
  });

  it('matches a merged main tag through its canonical tag', async () => {
    const author = await makeAuthor(db);
    const other = await makeAuthor(db, 'other_author');
    const origin = await story(author, 'Gốc', 0, { mainTagId: await tagId('tu-tien') });
    await story(other, 'Tiên Hiệp', 1);
    await story(other, 'Tu Tiên', 2, { mainTagId: await tagId('tu-tien') });

    const related = await listRelatedStories(db, origin);
    expect(titles(related?.sameMainTag ?? [])).toEqual(['Tiên Hiệp', 'Tu Tiên']);
    // And the other way round: under the canonical tag, a story on the merged tag.
    const canonical = await listRelatedStories(db, await story(author, 'Gốc Chuẩn', 0));
    expect(titles(canonical?.sameMainTag ?? [])).toEqual(['Tiên Hiệp', 'Tu Tiên']);
  });

  it('leaves out 18+, draft, hidden, chapterless and banned-author stories', async () => {
    const author = await makeAuthor(db);
    const other = await makeAuthor(db, 'other_author');
    const banned = await makeAuthor(db, 'banned_author');
    const origin = await story(author, 'Gốc', 0);
    await story(author, 'Mười Tám', 1, { isMature: true });
    await story(author, 'Nháp', 1, { visibility: 'draft' });
    await story(other, 'Bị Ẩn', 1, { visibility: 'hidden_by_mod' });
    await story(other, 'Chưa Có Chương', 1, { lastChapterAt: null });
    await story(other, 'Mười Tám Khác', 1, { isMature: true });
    await story(banned, 'Tác Giả Bị Cấm', 1);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));
    await story(other, 'Được Gợi Ý', 2);

    const related = await listRelatedStories(db, origin);
    expect(related).toEqual({ sameAuthor: [], sameMainTag: [expect.anything()] });
    expect(titles(related?.sameMainTag ?? [])).toEqual(['Được Gợi Ý']);
  });

  it('suggests only stories for everyone under an 18+ story', async () => {
    const author = await makeAuthor(db);
    const origin = await story(author, 'Gốc Mười Tám', 0, { isMature: true });
    await story(author, 'Mười Tám', 1, { isMature: true });
    await story(author, 'Thường', 2);

    const related = await listRelatedStories(db, origin);
    expect(titles(related?.sameAuthor ?? [])).toEqual(['Thường']);
  });

  it('returns null for a story that cannot be seen', async () => {
    const author = await makeAuthor(db);
    const hidden = await story(author, 'Bị Ẩn', 0, { visibility: 'hidden_by_mod' });
    const draft = await story(author, 'Nháp', 0, { visibility: 'draft' });
    const banned = await makeAuthor(db, 'banned_author');
    const ofBanned = await story(banned, 'Tác Giả Bị Cấm', 0);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    expect(await listRelatedStories(db, hidden)).toBeNull();
    expect(await listRelatedStories(db, draft)).toBeNull();
    expect(await listRelatedStories(db, ofBanned)).toBeNull();
    expect(await listRelatedStories(db, 'zzzzzzzz')).toBeNull();
  });
});

describe('getStoryPage announcement', () => {
  it('returns the latest visible announcement, skipping deleted and hidden ones', async () => {
    const author = await makeAuthor(db);
    const s = await makePublishedStory(db, author, 1);
    await addChapter(db, author, s.publicId);
    expect((await getStoryPage(db, s.publicId))?.announcement).toBeNull();

    const at = (h: number) => new Date(NOW - h * HOUR_MS);
    const [visible] = await db
      .insert(storyAnnouncements)
      .values([
        { storyId: s.storyId, authorId: author.id, body: 'Cũ hơn', createdAt: at(5) },
        { storyId: s.storyId, authorId: author.id, body: 'Mới nhất', createdAt: at(3) },
      ])
      .returning({ id: storyAnnouncements.id })
      .then((rows) => rows.slice(1));
    await db.insert(storyAnnouncements).values([
      {
        storyId: s.storyId,
        authorId: author.id,
        body: 'Đã xoá',
        status: 'deleted',
        createdAt: at(2),
      },
      {
        storyId: s.storyId,
        authorId: author.id,
        body: 'Bị ẩn',
        status: 'hidden_by_mod',
        createdAt: at(1),
      },
    ]);

    const page = await getStoryPage(db, s.publicId);
    expect(page?.announcement).toEqual({
      id: visible?.id,
      body: 'Mới nhất',
      createdAt: at(3).toISOString(),
    });
  });
});
