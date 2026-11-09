import { chapters, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { getGuestContinueCard } from './guest-continue';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setChapter(
  storyId: string,
  number: number,
  set: Partial<typeof chapters.$inferInsert>,
) {
  await db
    .update(chapters)
    .set(set)
    .where(and(eq(chapters.storyId, storyId), eq(chapters.number, number)));
}

describe('getGuestContinueCard', () => {
  it('returns the public card of a readable chapter, without internal ids', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 2);

    const card = await getGuestContinueCard(db, story.publicId, 2);

    expect(card).toMatchObject({ publicId: story.publicId, slug: story.slug });
    expect(JSON.stringify(card)).not.toContain(story.storyId);
    expect(JSON.stringify(card)).not.toContain(author.id);
  });

  it('is null for an 18+ story', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1, 'Truyện Người Lớn', { isMature: true });
    expect(await getGuestContinueCard(db, story.publicId, 1)).toBeNull();
  });

  it('is null once a story turns 18+', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, story.storyId));
    expect(await getGuestContinueCard(db, story.publicId, 1)).toBeNull();
  });

  it('is null for a story hidden by a mod', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(await getGuestContinueCard(db, story.publicId, 1)).toBeNull();
  });

  it('is null when the author is banned', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await getGuestContinueCard(db, story.publicId, 1)).toBeNull();
  });

  it('is null for a soft-deleted chapter, a draft and a chapter that does not exist', async () => {
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 2);
    await addChapter(db, author, story.publicId, true);
    await setChapter(story.storyId, 2, { deletedAt: new Date() });

    expect(await getGuestContinueCard(db, story.publicId, 2)).toBeNull();
    expect(await getGuestContinueCard(db, story.publicId, 3)).toBeNull();
    expect(await getGuestContinueCard(db, story.publicId, 9)).toBeNull();
    expect(await getGuestContinueCard(db, story.publicId, 1)).not.toBeNull();
  });

  it('is null for a malformed public id', async () => {
    expect(await getGuestContinueCard(db, 'not-an-id', 1)).toBeNull();
  });
});
