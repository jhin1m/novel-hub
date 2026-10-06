import { follows, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import {
  followAuthor,
  followStory,
  getFollowStatus,
  unfollowAuthor,
  unfollowStory,
} from './follows';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup() {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1);
  const reader = await makeUser(db, 'doc_gia');
  return { author, story, reader };
}

describe('following stories', () => {
  it('follows idempotently, reports the status and unfollows idempotently', async () => {
    const { story, reader } = await setup();
    expect(await followStory(db, reader, story.publicId)).toEqual({ ok: true, value: undefined });
    expect(await followStory(db, reader, story.publicId)).toEqual({ ok: true, value: undefined });
    expect(await db.select().from(follows)).toHaveLength(1);
    expect(await getFollowStatus(db, reader.id, { storyPublicId: story.publicId })).toEqual({
      story: true,
    });

    await unfollowStory(db, reader, story.publicId);
    await unfollowStory(db, reader, story.publicId);
    expect(await db.select().from(follows)).toHaveLength(0);
    expect(await getFollowStatus(db, reader.id, { storyPublicId: story.publicId })).toEqual({
      story: false,
    });
  });

  it("refuses the author's own story", async () => {
    const { author, story } = await setup();
    expect(await followStory(db, author, story.publicId)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('does not find unknown, draft, hidden or banned-author stories', async () => {
    const { author, story, reader } = await setup();
    expect(await followStory(db, reader, 'zzzzzzzz')).toEqual({ ok: false, error: 'NOT_FOUND' });

    const draft = await makePublishedStory(db, author, 0, 'Bản Nháp');
    expect(await followStory(db, reader, draft.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });

    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(await followStory(db, reader, story.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });

    await db.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.storyId));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await followStory(db, reader, story.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('follows 18+ stories', async () => {
    const { story, reader } = await setup();
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, story.storyId));
    expect((await followStory(db, reader, story.publicId)).ok).toBe(true);
  });

  it('still unfollows a story that was hidden since', async () => {
    const { story, reader } = await setup();
    await followStory(db, reader, story.publicId);
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    await unfollowStory(db, reader, story.publicId);
    expect(await db.select().from(follows)).toHaveLength(0);
  });
});

describe('following authors', () => {
  it('follows idempotently, reports the status and unfollows', async () => {
    const { reader } = await setup();
    expect((await followAuthor(db, reader, 'tac_gia')).ok).toBe(true);
    expect((await followAuthor(db, reader, 'tac_gia')).ok).toBe(true);
    const [row] = await db.select().from(follows);
    expect(row?.targetType).toBe('user');
    expect(await getFollowStatus(db, reader.id, { username: 'tac_gia' })).toEqual({
      author: true,
    });
    await unfollowAuthor(db, reader, 'tac_gia');
    await unfollowAuthor(db, reader, 'tac_gia');
    expect(await getFollowStatus(db, reader.id, { username: 'tac_gia' })).toEqual({
      author: false,
    });
  });

  it('refuses following oneself', async () => {
    const { author } = await setup();
    expect(await followAuthor(db, author, 'tac_gia')).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('does not find unknown users, banned authors or users without a public chapter', async () => {
    const { author, reader } = await setup();
    expect(await followAuthor(db, reader, 'khong_co')).toEqual({ ok: false, error: 'NOT_FOUND' });

    const other = await makeUser(db, 'chua_viet');
    expect(await followAuthor(db, reader, other.username)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const drafter = await makeAuthor(db, 'chi_nhap');
    const draft = await makePublishedStory(db, drafter, 0, 'Bản Nháp');
    await addChapter(db, drafter, draft.publicId, true);
    expect(await followAuthor(db, reader, 'chi_nhap')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await followAuthor(db, reader, 'tac_gia')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('answers only the keys asked', async () => {
    const { story, reader } = await setup();
    expect(await getFollowStatus(db, reader.id, {})).toEqual({});
    expect(
      await getFollowStatus(db, reader.id, { storyPublicId: story.publicId, username: 'tac_gia' }),
    ).toEqual({ story: false, author: false });
  });
});
