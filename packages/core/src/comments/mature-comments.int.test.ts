import { chapterContents, chapters, comments, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { updatePreferences } from '../users/preferences';
import { createComment } from './create-comment';
import { createDiscussionComment, listStoryDiscussion } from './discussion';
import { editComment } from './edit-comment';
import { listChapterComments } from './list-comments';
import { listCommentReplies } from './list-replies';
import { countParagraphComments } from './paragraph-counts';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** An 18+ story with one chapter, a reader who turned 18+ on and one who did not. */
async function setup() {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1, 'Truyện 18+', { isMature: true });
  const adult = await makeUser(db, 'doc_gia_bat');
  const reader = await makeUser(db, 'doc_gia_tat');
  const turnedOn = await updatePreferences(db, adult.id, { showMature: true, confirmAdult: true });
  if (!turnedOn.ok) throw new Error(turnedOn.error);
  const [content] = await db.select().from(chapterContents);
  const pid = content?.paragraphIds[0];
  if (!pid) throw new Error('chapter has no paragraph');
  const ref = { publicId: story.publicId, chapterNumber: 1 };
  return { story, adult, reader, ref, pid };
}

async function post(actor: CurrentUser, input: Parameters<typeof createComment>[2]) {
  const result = await createComment(db, actor, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const denied = { ok: false, error: 'MATURE_CONTENT_DISABLED' };

describe('comments under an 18+ story', () => {
  it('shows comments, paragraph counts and replies only to a viewer who turned 18+ on', async () => {
    const { story, adult, reader, ref, pid } = await setup();
    const thread = await post(adult, { ...ref, body: 'Bình luận đầu' });
    await post(adult, { ...ref, body: 'Trả lời', parentId: thread.id });
    await post(adult, { ...ref, body: 'Về đoạn này', paragraphId: pid });
    const key = { publicId: story.publicId, number: 1 };

    for (const viewer of [null, reader]) {
      expect(await listChapterComments(db, viewer, key)).toEqual(denied);
      expect(await listChapterComments(db, viewer, { ...key, paragraphId: pid })).toEqual(denied);
      expect(await countParagraphComments(db, viewer, key)).toEqual(denied);
      expect(await listCommentReplies(db, viewer, { commentId: thread.id })).toEqual(denied);
    }

    const list = await listChapterComments(db, adult, key);
    // The chapter's own thread and its reply; the paragraph's thread lists with its paragraph.
    expect(list.ok && list.value.total).toBe(2);
    expect(await countParagraphComments(db, adult, key)).toEqual({ ok: true, value: { [pid]: 1 } });
    const replies = await listCommentReplies(db, adult, { commentId: thread.id });
    expect(replies.ok && replies.value.items.map((item) => item.body)).toEqual(['Trả lời']);
  });

  it('lets only a viewer who turned 18+ on post, reply or comment on a paragraph', async () => {
    const { adult, reader, ref, pid } = await setup();
    const thread = await post(adult, { ...ref, body: 'Bình luận đầu' });

    expect(await createComment(db, reader, { ...ref, body: 'Gốc' })).toEqual(denied);
    expect(
      await createComment(db, reader, { ...ref, body: 'Trả lời', parentId: thread.id }),
    ).toEqual(denied);
    expect(await createComment(db, reader, { ...ref, body: 'Đoạn', paragraphId: pid })).toEqual(
      denied,
    );

    const turnedOn = await updatePreferences(db, reader.id, {
      showMature: true,
      confirmAdult: true,
    });
    expect(turnedOn.ok).toBe(true);
    expect((await createComment(db, reader, { ...ref, body: 'Gốc' })).ok).toBe(true);
    expect(
      (await createComment(db, reader, { ...ref, body: 'Trả lời', parentId: thread.id })).ok,
    ).toBe(true);
    expect((await createComment(db, reader, { ...ref, body: 'Đoạn', paragraphId: pid })).ok).toBe(
      true,
    );
  });

  it('lets the story author comment, list and edit under their own 18+ story with the preference off', async () => {
    const { story, adult, reader, ref, pid } = await setup();
    const author = await makeUser(db, 'tac_gia_hai');
    const own = await makePublishedStory(db, author, 1, 'Truyện 18+ của tôi', { isMature: true });
    const ownRef = { publicId: own.publicId, chapterNumber: 1 };
    const key = { publicId: own.publicId, number: 1 };

    const thread = await post(author, { ...ownRef, body: 'Lời tác giả' });
    await post(author, { ...ownRef, body: 'Trả lời', parentId: thread.id });
    const edited = await editComment(db, author, thread.id, 'Đã sửa');
    expect(edited.ok).toBe(true);
    const list = await listChapterComments(db, author, key);
    expect(list.ok && list.value.total).toBe(2);
    expect((await countParagraphComments(db, author, key)).ok).toBe(true);
    expect((await listCommentReplies(db, author, { commentId: thread.id })).ok).toBe(true);
    const discussion = await createDiscussionComment(db, author, {
      publicId: own.publicId,
      body: 'Thảo luận',
    });
    expect(discussion.ok).toBe(true);
    expect((await listStoryDiscussion(db, author, { publicId: own.publicId })).ok).toBe(true);

    // Someone else without the preference stays out, and the author's access is for their own story only.
    expect(await listChapterComments(db, reader, key)).toEqual(denied);
    expect(await createComment(db, reader, { ...ownRef, body: 'Gốc' })).toEqual(denied);
    expect(await listStoryDiscussion(db, reader, { publicId: own.publicId })).toEqual(denied);
    expect(await createComment(db, author, { ...ref, body: 'Của người khác' })).toEqual(denied);
    expect(await listChapterComments(db, author, { publicId: story.publicId, number: 1 })).toEqual(
      denied,
    );
    expect(adult.id).not.toBe(author.id);
    expect(pid).toBeTruthy();
  });

  it('refuses a muted account as muted before checking 18+', async () => {
    const { reader, ref } = await setup();
    await db.update(users).set({ status: 'muted' }).where(eq(users.id, reader.id));
    const muted = { ...reader, status: 'muted' as const };
    expect(await createComment(db, muted, { ...ref, body: 'Gốc' })).toEqual({
      ok: false,
      error: 'USER_MUTED',
    });
  });

  it('answers NOT_FOUND, not 18+, for what nobody may see', async () => {
    const { story, adult, reader, ref } = await setup();
    const hidden = await post(adult, { ...ref, body: 'Sẽ bị ẩn' });
    const thread = await post(adult, { ...ref, body: 'Bình luận đầu' });
    const reply = await post(adult, { ...ref, body: 'Trả lời', parentId: thread.id });
    const banned = await makeUser(db, 'bi_cam');
    await updatePreferences(db, banned.id, { showMature: true, confirmAdult: true });
    const bannedThread = await post(banned, { ...ref, body: 'Của người bị cấm' });
    await db.update(comments).set({ status: 'hidden_by_mod' }).where(eq(comments.id, hidden.id));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    const notFound = { ok: false, error: 'NOT_FOUND' };
    for (const commentId of [hidden.id, reply.id, bannedThread.id]) {
      expect(await listCommentReplies(db, reader, { commentId })).toEqual(notFound);
      expect(await listCommentReplies(db, null, { commentId })).toEqual(notFound);
    }

    await db
      .update(chapters)
      .set({ status: 'hidden_by_mod' })
      .where(eq(chapters.storyId, story.storyId));
    const key = { publicId: story.publicId, number: 1 };
    expect(await listChapterComments(db, reader, key)).toEqual(notFound);
    expect(await countParagraphComments(db, null, key)).toEqual(notFound);
    expect(await listCommentReplies(db, reader, { commentId: thread.id })).toEqual(notFound);
    expect(await createComment(db, reader, { ...ref, body: 'Gốc' })).toEqual(notFound);
  });

  it('leaves comments under a story that is not 18+ open to everyone', async () => {
    const author = await makeAuthor(db, 'tac_gia');
    const story = await makePublishedStory(db, author, 1);
    const reader = await makeUser(db, 'doc_gia');
    const thread = await post(reader, { publicId: story.publicId, chapterNumber: 1, body: 'Hay' });
    const key = { publicId: story.publicId, number: 1 };
    expect((await listChapterComments(db, null, key)).ok).toBe(true);
    expect(await countParagraphComments(db, null, key)).toEqual({ ok: true, value: {} });
    expect((await listCommentReplies(db, null, { commentId: thread.id })).ok).toBe(true);
  });
});
