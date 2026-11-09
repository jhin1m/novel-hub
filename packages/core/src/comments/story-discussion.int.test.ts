import { comments, stories } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { updatePreferences } from '../users/preferences';
import { createComment } from './create-comment';
import { deleteComment } from './delete-comment';
import { createDiscussionComment, listStoryDiscussion } from './discussion';
import { editComment } from './edit-comment';
import { listChapterComments } from './list-comments';
import { listCommentReplies } from './list-replies';
import { setCommentPinned } from './pin-comment';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup(opts: { isMature?: boolean } = {}) {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1, 'Kiếm Đạo', opts);
  const reader = await makeUser(db, 'doc_gia');
  const other = await makeUser(db, 'doc_gia_hai');
  return { author, story, reader, other };
}

async function discuss(actor: CurrentUser, publicId: string, body: string, parentId?: string) {
  const result = await createDiscussionComment(db, actor, {
    publicId,
    body,
    ...(parentId ? { parentId } : {}),
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function discussion(publicId: string, viewer: CurrentUser | null = null) {
  const result = await listStoryDiscussion(db, viewer, { publicId });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('story discussion', () => {
  it('posts, lists, replies, edits and deletes comments tied to no chapter', async () => {
    const { story, reader, other } = await setup();
    const thread = await discuss(reader, story.publicId, 'Truyện hay');
    const reply = await discuss(other, story.publicId, 'Đồng ý', thread.id);
    const nested = await discuss(reader, story.publicId, 'Cảm ơn', reply.id);

    const [row] = await db.select().from(comments).where(eq(comments.id, nested.id));
    expect(row).toMatchObject({ chapterId: null, parentId: thread.id, paragraphId: null });

    const listed = await discussion(story.publicId, reader);
    expect(listed.total).toBe(3);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ body: 'Truyện hay', isOwn: true, replyCount: 2 });
    expect(listed.items[0]?.replies.map((r) => r.body)).toEqual(['Đồng ý', 'Cảm ơn']);

    const replies = await listCommentReplies(db, null, { commentId: thread.id });
    expect(replies.ok && replies.value.items.map((r) => r.body)).toEqual(['Đồng ý', 'Cảm ơn']);

    expect((await editComment(db, reader, thread.id, 'Truyện rất hay')).ok).toBe(true);
    expect((await discussion(story.publicId)).items[0]?.body).toBe('Truyện rất hay');

    expect((await deleteComment(db, reader, thread.id)).ok).toBe(true);
    expect(await discussion(story.publicId)).toMatchObject({ total: 0, items: [] });
  });

  it('keeps chapter comments and the discussion apart', async () => {
    const { story, reader } = await setup();
    const ref = { publicId: story.publicId, chapterNumber: 1 };
    const chapterComment = await createComment(db, reader, { ...ref, body: 'Về chương' });
    if (!chapterComment.ok) throw new Error(chapterComment.error);
    const thread = await discuss(reader, story.publicId, 'Về truyện');

    expect((await discussion(story.publicId)).items.map((t) => t.body)).toEqual(['Về truyện']);
    const chapterList = await listChapterComments(db, null, {
      publicId: story.publicId,
      number: 1,
    });
    expect(chapterList.ok && chapterList.value.items.map((t) => t.body)).toEqual(['Về chương']);

    // A reply never crosses over to a thread of the other scope.
    expect(
      await createDiscussionComment(db, reader, {
        publicId: story.publicId,
        body: 'x',
        parentId: chapterComment.value.id,
      }),
    ).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await createComment(db, reader, { ...ref, body: 'x', parentId: thread.id })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('answers NOT_FOUND for a hidden or unpublished story, and its replies too', async () => {
    const { author, story, reader } = await setup();
    const thread = await discuss(reader, story.publicId, 'Truyện hay');
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));

    expect(await listStoryDiscussion(db, null, { publicId: story.publicId })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(
      await createDiscussionComment(db, reader, { publicId: story.publicId, body: 'x' }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await listCommentReplies(db, null, { commentId: thread.id })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });

    const draft = await makePublishedStory(db, author, 0, 'Bản nháp');
    expect(await listStoryDiscussion(db, null, { publicId: draft.publicId })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('keeps an 18+ discussion to accounts that turned 18+ on, and refuses muted ones', async () => {
    const { story, reader, other } = await setup({ isMature: true });
    const denied = { ok: false, error: 'MATURE_CONTENT_DISABLED' };
    expect(await listStoryDiscussion(db, null, { publicId: story.publicId })).toEqual(denied);
    expect(
      await createDiscussionComment(db, reader, { publicId: story.publicId, body: 'x' }),
    ).toEqual(denied);

    const on = await updatePreferences(db, reader.id, { showMature: true, confirmAdult: true });
    if (!on.ok) throw new Error(on.error);
    const thread = await discuss(reader, story.publicId, 'Truyện hay');
    expect((await discussion(story.publicId, reader)).items).toHaveLength(1);
    expect(await listCommentReplies(db, other, { commentId: thread.id })).toEqual(denied);

    expect(
      await createDiscussionComment(
        db,
        { ...reader, status: 'muted' },
        { publicId: story.publicId, body: 'x' },
      ),
    ).toEqual({ ok: false, error: 'USER_MUTED' });
  });

  it('pins in the discussion apart from the chapters', async () => {
    const { author, story, reader } = await setup();
    const ref = { publicId: story.publicId, chapterNumber: 1 };
    for (let i = 0; i < 3; i++) {
      const posted = await createComment(db, reader, { ...ref, body: `Chương ${i}` });
      if (!posted.ok) throw new Error(posted.error);
      expect((await setCommentPinned(db, author, posted.value.id, true)).ok).toBe(true);
    }
    const thread = await discuss(reader, story.publicId, 'Về truyện');
    const reply = await discuss(reader, story.publicId, 'Trả lời', thread.id);

    expect((await setCommentPinned(db, author, thread.id, true)).ok).toBe(true);
    expect(await setCommentPinned(db, author, reply.id, true)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    const listed = await discussion(story.publicId);
    expect(listed.pinned.map((t) => t.body)).toEqual(['Về truyện']);
    expect(listed.items).toEqual([]);
    expect(listed.total).toBe(2);
  });
});
