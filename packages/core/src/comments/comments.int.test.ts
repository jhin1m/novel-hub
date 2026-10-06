import { comments, moderationActions, reports, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { COMMENTS_PAGE_SIZE, type ModerationActionInput } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyModerationAction } from '../moderation/apply-action';
import { createReport } from '../reports/create-report';
import { listReports } from '../reports/list-reports';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { createComment } from './create-comment';
import { deleteComment } from './delete-comment';
import { listChapterComments } from './list-comments';
import { listCommentReplies } from './list-replies';

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
  const other = await makeUser(db, 'doc_gia_hai');
  const admin = await makeUser(db, 'quan_tri', 'admin');
  const ref = { publicId: story.publicId, chapterNumber: 1 };
  return { author, story, reader, other, admin, ref };
}

type ChapterKey = { publicId: string; chapterNumber: number };

async function post(actor: CurrentUser, ref: ChapterKey, body: string, parentId?: string) {
  const result = await createComment(db, actor, {
    ...ref,
    body,
    ...(parentId ? { parentId } : {}),
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const list = (publicId: string, viewer: CurrentUser | null = null, cursor?: string) =>
  listChapterComments(db, viewer, { publicId, number: 1, cursor });

async function page(publicId: string, viewer: CurrentUser | null = null, cursor?: string) {
  const result = await list(publicId, viewer, cursor);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const act = (actor: CurrentUser, input: ModerationActionInput) =>
  applyModerationAction(db, actor, input);

async function setStatus(user: CurrentUser, status: CurrentUser['status']) {
  await db.update(users).set({ status }).where(eq(users.id, user.id));
}

describe('comment threads', () => {
  it('lists threads newest first with replies oldest first, attaching a reply to a reply to its thread', async () => {
    const { reader, other, ref, story } = await setup();
    const first = await post(reader, ref, 'Chương hay');
    const second = await post(other, ref, 'Hóng chương sau');
    const reply = await post(other, ref, 'Đồng ý', first.id);
    const nested = await post(reader, ref, 'Cảm ơn', reply.id);

    const [row] = await db.select().from(comments).where(eq(comments.id, nested.id));
    expect(row?.parentId).toBe(first.id);

    const result = await page(story.publicId, reader);
    expect(result.total).toBe(4);
    expect(result.items.map((item) => item.body)).toEqual(['Hóng chương sau', 'Chương hay']);
    const thread = result.items[1];
    expect(thread?.replyCount).toBe(2);
    expect(thread?.replies.map((r) => r.body)).toEqual(['Đồng ý', 'Cảm ơn']);
    expect(thread?.moreRepliesCursor).toBeNull();
    expect(thread?.isOwn).toBe(true);
    expect(thread?.replies.map((r) => r.isOwn)).toEqual([false, true]);
    expect(result.items[0]).toMatchObject({
      id: second.id,
      author: { username: 'doc_gia_hai', displayName: 'Name doc_gia_hai' },
      isOwn: false,
    });
    // No internal user id or email in what readers get.
    expect(JSON.stringify(result)).not.toContain(reader.id);
    expect(JSON.stringify(result)).not.toContain('@example.com');
    const guest = await page(story.publicId);
    expect(guest.items.every((item) => !item.isOwn)).toBe(true);
  });

  it('pages threads with a keyset cursor and continues replies past the preview', async () => {
    const { reader, ref, story } = await setup();
    const bodies = Array.from({ length: 25 }, (_, i) => `Bình luận ${i}`);
    const ids: string[] = [];
    for (const body of bodies) ids.push((await post(reader, ref, body)).id);
    for (let i = 0; i < 24; i++) await post(reader, ref, `Trả lời ${i}`, ids[0]);

    const one = await page(story.publicId);
    expect(one.total).toBe(49);
    expect(one.items).toHaveLength(COMMENTS_PAGE_SIZE);
    expect(one.items[0]?.body).toBe('Bình luận 24');
    expect(one.nextCursor).not.toBeNull();
    const two = await page(story.publicId, null, one.nextCursor ?? undefined);
    expect(two.items.map((item) => item.body)).toEqual([4, 3, 2, 1, 0].map((i) => bodies[i]));
    expect(two.nextCursor).toBeNull();
    expect(two.total).toBeNull();

    const thread = two.items.at(-1);
    expect(thread?.replyCount).toBe(24);
    expect(thread?.replies.map((r) => r.body)).toEqual(['Trả lời 0', 'Trả lời 1', 'Trả lời 2']);
    const more = await listCommentReplies(db, null, {
      commentId: ids[0] ?? '',
      cursor: thread?.moreRepliesCursor ?? undefined,
    });
    if (!more.ok) throw new Error(more.error);
    expect(more.value.items).toHaveLength(COMMENTS_PAGE_SIZE);
    expect(more.value.items[0]?.body).toBe('Trả lời 3');
    const rest = await listCommentReplies(db, null, {
      commentId: ids[0] ?? '',
      cursor: more.value.nextCursor ?? undefined,
    });
    if (!rest.ok) throw new Error(rest.error);
    expect(rest.value.items.map((r) => r.body)).toEqual(['Trả lời 23']);
    expect(rest.value.nextCursor).toBeNull();
  });

  it('takes a hidden or deleted thread out with its replies, and the total with it', async () => {
    const { reader, other, admin, ref, story } = await setup();
    const thread = await post(reader, ref, 'Gốc');
    await post(other, ref, 'Trả lời', thread.id);
    await post(other, ref, 'Gốc khác');
    expect((await page(story.publicId)).total).toBe(3);

    expect((await act(admin, { action: 'hide_comment', commentId: thread.id })).ok).toBe(true);
    const hidden = await page(story.publicId);
    expect(hidden.total).toBe(1);
    expect(hidden.items.map((item) => item.body)).toEqual(['Gốc khác']);
    expect(await listCommentReplies(db, null, { commentId: thread.id })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    // Replying into a hidden thread is refused.
    const reply = await createComment(db, other, {
      ...ref,
      body: 'Còn ai không',
      parentId: thread.id,
    });
    expect(reply).toEqual({ ok: false, error: 'INVALID_STATE' });

    // Nor can a reply under it be reported.
    const replies = await db.select().from(comments).where(eq(comments.parentId, thread.id));
    expect(
      await createReport(db, reader, {
        target: { type: 'comment', commentId: replies[0]?.id ?? '' },
        reason: 'spam',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });

    expect((await act(admin, { action: 'restore_comment', commentId: thread.id })).ok).toBe(true);
    expect((await page(story.publicId)).total).toBe(3);
    expect(await deleteComment(db, reader, thread.id)).toEqual({ ok: true, value: undefined });
    expect((await page(story.publicId)).total).toBe(1);
    // Deleted stays deleted: neither the writer again nor a moderator brings it back.
    expect(await deleteComment(db, reader, thread.id)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await act(admin, { action: 'restore_comment', commentId: thread.id })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('leaves out what banned accounts wrote', async () => {
    const { reader, other, ref, story } = await setup();
    const thread = await post(other, ref, 'Gốc của người sẽ bị ban');
    await post(reader, ref, 'Trả lời', thread.id);
    await post(reader, ref, 'Gốc khác');
    const latest = (await page(story.publicId)).items[0]?.id;
    await post(other, ref, 'Trả lời của người sẽ bị ban', latest);
    expect((await page(story.publicId)).total).toBe(4);

    await setStatus(other, 'banned');
    const result = await page(story.publicId);
    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.body)).toEqual(['Gốc khác']);
    expect(result.items[0]?.replyCount).toBe(0);
  });

  it('answers NOT_FOUND for chapters nobody may read', async () => {
    const { author, reader, admin, ref, story } = await setup();
    const thread = await post(reader, ref, 'Gốc');
    const draft = await addChapter(db, author, story.publicId, true);
    expect(await list(story.publicId, null)).toMatchObject({ ok: true });
    expect(
      await listChapterComments(db, null, { publicId: story.publicId, number: draft }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(
      await createComment(db, reader, {
        publicId: story.publicId,
        chapterNumber: draft,
        body: 'x',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });

    const hidden = await act(admin, {
      action: 'hide_chapter',
      storyPublicId: story.publicId,
      number: 1,
    });
    expect(hidden.ok).toBe(true);
    expect(await list(story.publicId)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await listCommentReplies(db, null, { commentId: thread.id })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await createComment(db, reader, { ...ref, body: 'x' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('only opens replies of a top-level comment', async () => {
    const { reader, ref } = await setup();
    const thread = await post(reader, ref, 'Gốc');
    const reply = await post(reader, ref, 'Trả lời', thread.id);
    expect(await listCommentReplies(db, null, { commentId: reply.id })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('refuses muted and unverified accounts, and a parent from another chapter', async () => {
    const { author, reader, other, ref, story } = await setup();
    await setStatus(reader, 'muted');
    expect(await createComment(db, { ...reader, status: 'muted' }, { ...ref, body: 'x' })).toEqual({
      ok: false,
      error: 'USER_MUTED',
    });
    expect(
      await createComment(db, { ...other, emailVerified: false }, { ...ref, body: 'x' }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    const second = await addChapter(db, author, story.publicId);
    const elsewhere = await post(other, { publicId: story.publicId, chapterNumber: second }, 'x');
    expect(await createComment(db, other, { ...ref, body: 'y', parentId: elsewhere.id })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('lets only the writer delete a comment', async () => {
    const { reader, other, admin, ref } = await setup();
    const comment = await post(reader, ref, 'Của tôi');
    expect(await deleteComment(db, other, comment.id)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await deleteComment(db, admin, comment.id)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await deleteComment(db, reader, '01920000-0000-7000-8000-000000000001')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect((await deleteComment(db, reader, comment.id)).ok).toBe(true);
  });
});

describe('comment moderation', () => {
  it('reports a comment, then hides it from the report with the report resolved and logged', async () => {
    const { reader, other, ref } = await setup();
    const mod = await makeUser(db, 'kiem_duyet', 'mod');
    const comment = await post(other, ref, 'Spam spam '.repeat(40));
    const reported = await createReport(db, reader, {
      target: { type: 'comment', commentId: comment.id },
      reason: 'spam',
    });
    expect(reported).toEqual({ ok: true, value: { created: true } });

    const queue = await listReports(db, mod, { status: 'open', page: 1 });
    if (!queue.ok) throw new Error(queue.error);
    const [item] = queue.value.items;
    expect(item?.target).toMatchObject({
      type: 'comment',
      story: { publicId: ref.publicId },
      chapter: { number: 1 },
      comment: {
        status: 'visible',
        truncated: true,
        isReply: false,
        writer: { username: 'doc_gia_hai' },
      },
    });
    if (item?.target.type !== 'comment') throw new Error('not a comment target');
    expect([...item.target.comment.excerpt]).toHaveLength(200);

    const hidden = await act(mod, {
      action: 'hide_comment',
      commentId: comment.id,
      reportId: item.reportId,
    });
    expect(hidden).toEqual({ ok: true, value: { action: 'hide_comment' } });
    const [report] = await db.select().from(reports);
    expect(report?.status).toBe('resolved');
    const log = await db.select().from(moderationActions);
    expect(log).toMatchObject([
      { action: 'hide_comment', targetType: 'comment', targetId: comment.id },
    ]);
    // A hidden comment can no longer be reported.
    expect(
      await createReport(db, reader, {
        target: { type: 'comment', commentId: comment.id },
        reason: 'spam',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('keeps moderators off their own comments and off those of admins', async () => {
    const { reader, admin, ref } = await setup();
    const mod = await makeUser(db, 'kiem_duyet', 'mod');
    const own = await post(mod, ref, 'Của mod');
    const byAdmin = await post(admin, ref, 'Của admin');
    expect(await act(mod, { action: 'hide_comment', commentId: own.id })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await act(mod, { action: 'hide_comment', commentId: byAdmin.id })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await act(admin, { action: 'hide_comment', commentId: own.id })).ok).toBe(true);

    const second = await post(mod, ref, 'Của mod nữa');
    await createReport(db, reader, {
      target: { type: 'comment', commentId: second.id },
      reason: 'spam',
    });
    const [report] = await db.select().from(reports);
    expect(await act(mod, { action: 'dismiss_report', reportId: report?.id ?? '' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});
