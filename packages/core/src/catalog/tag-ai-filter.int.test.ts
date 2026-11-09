import { stories } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listStories } from './lists';
import { getTagPage } from './tag-page';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function setStory(storyId: string, values: Partial<typeof stories.$inferInsert>) {
  await db.update(stories).set(values).where(eq(stories.id, storyId));
}

/** Three stories tagged `tien-hiep`, newest first: AI, human, human 18+. */
async function seedStories() {
  const author = await makeAuthor(db);
  const assisted = await makePublishedStory(db, author, 1, 'Có Dùng AI');
  const human = await makePublishedStory(db, author, 1, 'Tự Viết');
  const adult = await makePublishedStory(db, author, 1, 'Người Lớn', { isMature: true });
  await setStory(assisted.storyId, { isAiAssisted: true, lastChapterAt: daysAgo(1) });
  await setStory(human.storyId, { lastChapterAt: daysAgo(2) });
  await setStory(adult.storyId, { lastChapterAt: daysAgo(3) });
}

const tagPage = async (o: Parameters<typeof getTagPage>[2]) => {
  const result = await getTagPage(db, 'tien-hiep', o);
  if (result?.kind !== 'ok') throw new Error('expected a tag page');
  return result;
};

describe('getTagPage with noAi', () => {
  it('leaves out stories written with AI only when asked to', async () => {
    await seedStories();
    const all = await tagPage({ includeMature: false, page: 1 });
    expect(all.stories.items.map((s) => s.title)).toEqual(['Có Dùng AI', 'Tự Viết']);

    const filtered = await tagPage({ includeMature: false, page: 1, noAi: true });
    expect(filtered.stories.items.map((s) => s.title)).toEqual(['Tự Viết']);

    const withMature = await tagPage({ includeMature: true, page: 1, noAi: true });
    expect(withMature.stories.items.map((s) => s.title)).toEqual(['Tự Viết', 'Người Lớn']);
  });

  it('counts pages without the AI stories, for every reader', async () => {
    await seedStories();
    const guest = await tagPage({ includeMature: false, page: 1, pageSize: 1, noAi: true });
    expect(guest.stories).toMatchObject({ page: 1, totalPages: 1 });
    // The 18+ human story is the only one past the guest total.
    expect(guest.lastPage).toBe(2);

    const unfiltered = await tagPage({ includeMature: false, page: 1, pageSize: 1 });
    expect(unfiltered.stories.totalPages).toBe(2);
    expect(unfiltered.lastPage).toBe(3);

    const page2 = await tagPage({ includeMature: true, page: 2, pageSize: 1, noAi: true });
    expect(page2.stories).toMatchObject({ page: 2, totalPages: 2 });
    expect(page2.stories.items.map((s) => s.title)).toEqual(['Người Lớn']);
  });

  it('passes the filter through the client-reloaded tag list', async () => {
    await seedStories();
    const list = await listStories(
      db,
      { list: 'tag', tag: 'tien-hiep', noAi: true },
      { includeMature: true },
    );
    expect(list?.stories.map((s) => s.title)).toEqual(['Tự Viết', 'Người Lớn']);
  });
});
