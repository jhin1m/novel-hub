import { chapterContents, comments, reports, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { COMMENTS_PAGE_SIZE, COMMENT_PIN_MAX } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { updatePreferences } from '../users/preferences';
import { createComment } from './create-comment';
import { deleteComment } from './delete-comment';
import { editComment } from './edit-comment';
import { listChapterComments } from './list-comments';
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
  const ref = { publicId: story.publicId, chapterNumber: 1 };
  return { author, story, reader, other, ref };
}

type ChapterKey = { publicId: string; chapterNumber: number };

async function post(actor: CurrentUser, ref: ChapterKey, body: string, extra = {}) {
  const result = await createComment(db, actor, { ...ref, body, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function page(publicId: string, viewer: CurrentUser | null, cursor?: string) {
  const result = await listChapterComments(db, viewer, { publicId, number: 1, cursor });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function setStatus(id: string, status: CurrentUser['status']) {
  await db.update(users).set({ status }).where(eq(users.id, id));
}

async function hide(id: string) {
  await db.update(comments).set({ status: 'hidden_by_mod' }).where(eq(comments.id, id));
}

describe('editComment', () => {
  it('lets the writer edit and marks the comment edited', async () => {
    const { reader, ref, story } = await setup();
    const comment = await post(reader, ref, 'Bản đầu');
    const result = await editComment(db, reader, comment.id, 'Bản sửa');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ body: 'Bản sửa', isOwn: true, pinnedAt: null });
    expect(result.value.editedAt).not.toBeNull();

    const listed = await page(story.publicId, null);
    expect(listed.items[0]).toMatchObject({ body: 'Bản sửa', isOwn: false });
    expect(listed.items[0]?.editedAt).toBe(result.value.editedAt);
  });

  it('refuses another account, a muted writer and a deleted comment', async () => {
    const { reader, other, ref } = await setup();
    const comment = await post(reader, ref, 'Bản đầu');
    expect(await editComment(db, other, comment.id, 'x')).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    await setStatus(reader.id, 'muted');
    expect(await editComment(db, { ...reader, status: 'muted' }, comment.id, 'x')).toEqual({
      ok: false,
      error: 'USER_MUTED',
    });
    await setStatus(reader.id, 'active');

    expect((await deleteComment(db, reader, comment.id)).ok).toBe(true);
    expect(await editComment(db, reader, comment.id, 'x')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('refuses under an 18+ story once the writer turned 18+ off', async () => {
    const { reader, ref } = await setup({ isMature: true });
    const on = await updatePreferences(db, reader.id, { showMature: true, confirmAdult: true });
    if (!on.ok) throw new Error(on.error);
    const comment = await post(reader, ref, 'Bản đầu');
    const off = await updatePreferences(db, reader.id, { showMature: false });
    if (!off.ok) throw new Error(off.error);
    expect(await editComment(db, reader, comment.id, 'x')).toEqual({
      ok: false,
      error: 'MATURE_CONTENT_DISABLED',
    });
  });

  it('refuses while a report on the comment is open', async () => {
    const { reader, other, ref } = await setup();
    const comment = await post(reader, ref, 'Bản đầu');
    await db.insert(reports).values({
      reporterId: other.id,
      targetType: 'comment',
      targetId: comment.id,
      reason: 'spam',
    });
    expect(await editComment(db, reader, comment.id, 'x')).toEqual({
      ok: false,
      error: 'COMMENT_UNDER_REVIEW',
    });
    await db.update(reports).set({ status: 'resolved' });
    expect((await editComment(db, reader, comment.id, 'x')).ok).toBe(true);
  });

  it('drops the pin of an edited comment', async () => {
    const { author, reader, ref } = await setup();
    const comment = await post(reader, ref, 'Bản đầu');
    expect((await setCommentPinned(db, author, comment.id, true)).ok).toBe(true);
    expect((await editComment(db, reader, comment.id, 'Bản sửa')).ok).toBe(true);
    const [row] = await db.select().from(comments).where(eq(comments.id, comment.id));
    expect(row?.pinnedAt).toBeNull();
  });
});

describe('setCommentPinned', () => {
  it(`pins at most ${COMMENT_PIN_MAX} per chapter and lists them first, apart`, async () => {
    const { author, reader, ref, story } = await setup();
    const posted = [];
    for (let i = 0; i < 5; i++) posted.push(await post(reader, ref, `Bình luận ${i}`));
    for (const comment of posted.slice(0, 3)) {
      expect((await setCommentPinned(db, author, comment.id, true)).ok).toBe(true);
    }
    expect(await setCommentPinned(db, author, posted[3]?.id ?? '', true)).toEqual({
      ok: false,
      error: 'COMMENT_PIN_LIMIT',
    });

    const listed = await page(story.publicId, null);
    expect(listed.total).toBe(5);
    expect(listed.viewerCanPin).toBe(false);
    expect(listed.pinned.map((thread) => thread.body)).toEqual([
      'Bình luận 0',
      'Bình luận 1',
      'Bình luận 2',
    ]);
    expect(listed.pinned.every((thread) => thread.pinnedAt !== null)).toBe(true);
    expect(listed.items.map((thread) => thread.body)).toEqual(['Bình luận 4', 'Bình luận 3']);
    expect((await page(story.publicId, { ...reader })).viewerCanPin).toBe(false);
  });

  it('tells the story author they may pin', async () => {
    const { author, story } = await setup();
    const [row] = await db.select().from(users).where(eq(users.id, author.id));
    if (!row) throw new Error('author missing');
    const listed = await listChapterComments(
      db,
      { id: row.id, status: row.status },
      { publicId: story.publicId, number: 1 },
    );
    expect(listed.ok && listed.value.viewerCanPin).toBe(true);
  });

  it('never passes the limit under concurrent pins', async () => {
    const { author, reader, ref } = await setup();
    const posted = [];
    for (let i = 0; i < 4; i++) posted.push(await post(reader, ref, `Bình luận ${i}`));
    const results = await Promise.all(
      posted.map((comment) => setCommentPinned(db, author, comment.id, true)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(COMMENT_PIN_MAX);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: 'COMMENT_PIN_LIMIT' },
    ]);
  });

  it('keeps a hidden pinned comment counted, and frees the place on delete or unpin', async () => {
    const { author, reader, ref, story } = await setup();
    const posted = [];
    for (let i = 0; i < 4; i++) posted.push(await post(reader, ref, `Bình luận ${i}`));
    const [a, b, c, d] = posted.map((comment) => comment.id) as [string, string, string, string];
    for (const id of [a, b, c])
      expect((await setCommentPinned(db, author, id, true)).ok).toBe(true);

    await hide(a);
    expect((await page(story.publicId, null)).pinned).toHaveLength(2);
    expect(await setCommentPinned(db, author, d, true)).toEqual({
      ok: false,
      error: 'COMMENT_PIN_LIMIT',
    });

    expect((await deleteComment(db, reader, b)).ok).toBe(true);
    expect((await setCommentPinned(db, author, d, true)).ok).toBe(true);

    // The author may still unpin the hidden one to free its place.
    expect(await setCommentPinned(db, author, a, false)).toEqual({
      ok: true,
      value: { pinnedAt: null },
    });
    expect((await setCommentPinned(db, author, c, false)).ok).toBe(true);
    expect((await page(story.publicId, null)).pinned.map((thread) => thread.id)).toEqual([d]);
  });

  it('refuses replies, paragraph comments and anyone but the active author', async () => {
    const { author, reader, other, ref } = await setup();
    const thread = await post(reader, ref, 'Gốc');
    const reply = await post(other, ref, 'Trả lời', { parentId: thread.id });
    const [content] = await db.select().from(chapterContents);
    const pid = content?.paragraphIds[0];
    const aboutParagraph = await post(reader, ref, 'Về đoạn', { paragraphId: pid });

    expect(await setCommentPinned(db, author, reply.id, true)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await setCommentPinned(db, author, aboutParagraph.id, true)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await setCommentPinned(db, other, thread.id, true)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await setCommentPinned(db, { ...author, status: 'muted' }, thread.id, true)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    await hide(thread.id);
    expect(await setCommentPinned(db, other, thread.id, false)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('pins nothing under a story nobody may read, but lets the author unpin there', async () => {
    const { author, reader, ref, story } = await setup();
    const comment = await post(reader, ref, 'Bình luận');
    expect((await setCommentPinned(db, author, comment.id, true)).ok).toBe(true);
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.id, story.storyId));
    expect(await setCommentPinned(db, reader, comment.id, false)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await setCommentPinned(db, author, comment.id, false)).toEqual({
      ok: true,
      value: { pinnedAt: null },
    });
    expect(await setCommentPinned(db, author, comment.id, true)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('never repeats a pinned thread on the next pages', async () => {
    const { author, reader, ref, story } = await setup();
    const posted = [];
    for (let i = 0; i < COMMENTS_PAGE_SIZE + 2; i++) {
      posted.push(await post(reader, ref, `Bình luận ${i}`));
    }
    const oldest = posted[0]?.id ?? '';
    expect((await setCommentPinned(db, author, oldest, true)).ok).toBe(true);

    const first = await page(story.publicId, null);
    expect(first.pinned.map((thread) => thread.id)).toEqual([oldest]);
    expect(first.items).toHaveLength(COMMENTS_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await page(story.publicId, null, first.nextCursor ?? undefined);
    expect(second.pinned).toEqual([]);
    expect(second.total).toBeNull();
    const ids = [...first.items, ...second.items].map((thread) => thread.id);
    expect(ids).toHaveLength(COMMENTS_PAGE_SIZE + 1);
    expect(ids).not.toContain(oldest);
  });
});
