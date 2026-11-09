import {
  type CurrentUser,
  type RateLimiter,
  applyModerationAction,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
  updatePreferences,
} from '@novel-hub/core';
import { chapterContents, comments, reports, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { TEST_APP_URL, makeTestApiDeps } from '../testing';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function makeUser(
  username: string,
  role: CurrentUser['role'] = 'reader',
  emailVerified = true,
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Tên ${username}`,
      email: `${username}@example.com`,
      emailVerified,
      role,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

/** Creates the next chapter of `publicId` and publishes it unless `draft`; returns its number. */
async function addChapter(author: CurrentUser, publicId: string, draft = false): Promise<number> {
  const created = await createChapter(db, author, publicId);
  if (!created.ok) throw new Error(created.error);
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, author, publicId, created.value.number, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: created.value.draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  if (!draft) {
    const done = await publishChapter(db, author, publicId, created.value.number, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!done.ok) throw new Error(done.error);
  }
  return created.value.number;
}

async function makeStory(author: CurrentUser, isMature = false): Promise<string> {
  const story = await createStory(db, author, {
    title: 'Truyện Bình Luận',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  await addChapter(author, story.value.publicId);
  return story.value.publicId;
}

function appAs(user: CurrentUser | null, rateLimit: RateLimiter | null = null) {
  return createApp(
    makeTestApiDeps({
      db,
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user, setCookies: [] }),
      },
      rateLimit,
      clientIp: () => '203.0.113.9',
    }),
  );
}

const send = (method: string, body?: unknown) => ({
  method,
  headers: { origin: TEST_APP_URL, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('/api/v1/comments', () => {
  it('posts threads and replies, lists them for guests, and attaches a reply to a reply to its thread', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');

    const created = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: '  Hay quá  ' }),
    );
    expect(created.status).toBe(201);
    const { comment } = (await created.json()) as { comment: { id: string; body: string } };
    expect(comment).toMatchObject({ body: 'Hay quá', isOwn: true });

    const reply = await appAs(author).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Cảm ơn', parentId: comment.id }),
    );
    const replyId = ((await reply.json()) as { comment: { id: string } }).comment.id;
    const nested = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Hóng', parentId: replyId }),
    );
    expect(nested.status).toBe(201);
    const nestedId = ((await nested.json()) as { comment: { id: string } }).comment.id;
    const [row] = await db.select().from(comments).where(eq(comments.id, nestedId));
    expect(row?.parentId).toBe(comment.id);

    const listed = await appAs(null).request(`/api/v1/comments?story=${publicId}&chapter=1`);
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toContain('no-store');
    const body = (await listed.json()) as {
      total: number;
      items: { body: string; replyCount: number; isOwn: boolean }[];
    };
    expect(body.total).toBe(3);
    expect(body.items).toMatchObject([{ body: 'Hay quá', replyCount: 2, isOwn: false }]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(reader.id);
    expect(text).not.toContain('example.com');

    const replies = await appAs(null).request(`/api/v1/comments/${comment.id}/replies`);
    expect(replies.status).toBe(200);
    expect(((await replies.json()) as { items: unknown[] }).items).toHaveLength(2);
  });

  it('answers 400 on a broken query and 404 on a chapter nobody may read', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const draft = await addChapter(author, publicId, true);
    const reader = await makeUser('doc_gia');

    const broken = await appAs(null).request(
      `/api/v1/comments?story=${publicId}&chapter=1&cursor=abc`,
    );
    expect(broken.status).toBe(400);
    expect(await errorCode(broken)).toBe('VALIDATION_ERROR');
    const missing = await appAs(null).request(
      `/api/v1/comments?story=${publicId}&chapter=${draft}`,
    );
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('NOT_FOUND');
    const onDraft = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: draft, body: 'x' }),
    );
    expect(onDraft.status).toBe(404);
    const empty = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: ' \n ' }),
    );
    expect(empty.status).toBe(400);
  });

  it('refuses guests, unverified and muted accounts', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const input = { publicId, chapterNumber: 1, body: 'x' };

    const guest = await appAs(null).request('/api/v1/comments', send('POST', input));
    expect(guest.status).toBe(401);
    const unverified = await appAs(await makeUser('chua_xac_thuc', 'reader', false)).request(
      '/api/v1/comments',
      send('POST', input),
    );
    expect(unverified.status).toBe(403);
    expect(await errorCode(unverified)).toBe('EMAIL_NOT_VERIFIED');
    const muted = await makeUser('bi_cam');
    const mutedRes = await appAs({ ...muted, status: 'muted' }).request(
      '/api/v1/comments',
      send('POST', input),
    );
    expect(mutedRes.status).toBe(403);
    expect(await errorCode(mutedRes)).toBe('USER_MUTED');
  });

  it('rate limits posting per user and IP', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const check = vi.fn<RateLimiter['check']>(() =>
      Promise.resolve({ allowed: false, retryAfterSec: 60 }),
    );
    const limiter: RateLimiter = {
      check,
      recordFailure: () => Promise.resolve(),
      clearFailures: () => Promise.resolve(),
    };
    const reader = await makeUser('doc_gia');
    const res = await appAs(reader, limiter).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'x' }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(check).toHaveBeenCalledWith('comment', expect.objectContaining({ ip: '203.0.113.9' }));
  });

  it('deletes only the writer’s own comment', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const created = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Của tôi' }),
    );
    const { id } = ((await created.json()) as { comment: { id: string } }).comment;

    expect((await appAs(null).request(`/api/v1/comments/${id}`, send('DELETE'))).status).toBe(401);
    const other = await appAs(author).request(`/api/v1/comments/${id}`, send('DELETE'));
    expect(other.status).toBe(403);
    expect(await errorCode(other)).toBe('FORBIDDEN');
    expect((await appAs(reader).request(`/api/v1/comments/${id}`, send('DELETE'))).status).toBe(
      204,
    );
    expect((await appAs(reader).request(`/api/v1/comments/${id}`, send('DELETE'))).status).toBe(
      404,
    );
  });

  it('hides the replies of a thread whose chapter was hidden', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const admin = await makeUser('quan_tri', 'admin');
    const created = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Gốc' }),
    );
    const { id } = ((await created.json()) as { comment: { id: string } }).comment;
    const hidden = await applyModerationAction(db, admin, {
      action: 'hide_chapter',
      storyPublicId: publicId,
      number: 1,
    });
    expect(hidden.ok).toBe(true);
    expect((await appAs(null).request(`/api/v1/comments/${id}/replies`)).status).toBe(404);
  });

  it('hides a reported comment from the queue, closing the open report', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const mod = await makeUser('kiem_duyet', 'mod');
    const created = await appAs(author).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Quảng cáo' }),
    );
    const { id } = ((await created.json()) as { comment: { id: string } }).comment;

    const reported = await appAs(reader).request(
      '/api/v1/reports',
      send('POST', { target: { type: 'comment', commentId: id }, reason: 'spam' }),
    );
    expect(reported.status).toBe(201);
    const queue = await appAs(mod).request('/api/v1/moderation/reports?status=open');
    const { items } = (await queue.json()) as {
      items: { reportId: string; target: { type: string; comment: { excerpt: string } } }[];
    };
    expect(items[0]?.target).toMatchObject({ type: 'comment', comment: { excerpt: 'Quảng cáo' } });

    const acted = await appAs(mod).request(
      '/api/v1/moderation/actions',
      send('POST', { action: 'hide_comment', commentId: id, reportId: items[0]?.reportId }),
    );
    expect(acted.status).toBe(200);
    const [report] = await db.select().from(reports);
    expect(report?.status).toBe('resolved');
    const listed = await appAs(null).request(`/api/v1/comments?story=${publicId}&chapter=1`);
    expect(((await listed.json()) as { total: number }).total).toBe(0);
  });

  it('comments on a paragraph, lists and counts it apart from the chapter, and refuses unknown pids', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const draft = await addChapter(author, publicId, true);
    const reader = await makeUser('doc_gia');
    const [content] = await db.select().from(chapterContents);
    const pid = content?.paragraphIds[0] ?? '';

    const onParagraph = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Đoạn hay', paragraphId: pid }),
    );
    expect(onParagraph.status).toBe(201);
    const unknown = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Lạc', paragraphId: 'zz2k9xq2' }),
    );
    expect(unknown.status).toBe(422);
    expect(await errorCode(unknown)).toBe('COMMENT_PARAGRAPH_INVALID');
    const malformed = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Lạc', paragraphId: 'p[data-pid]' }),
    );
    expect(malformed.status).toBe(400);

    const counted = await appAs(null).request(
      `/api/v1/comments/paragraph-counts?story=${publicId}&chapter=1`,
    );
    expect(counted.status).toBe(200);
    expect(counted.headers.get('cache-control')).toContain('no-store');
    expect(await counted.json()).toEqual({ counts: { [pid]: 1 } });
    const thread = await appAs(null).request(
      `/api/v1/comments?story=${publicId}&chapter=1&paragraph=${pid}`,
    );
    expect(((await thread.json()) as { total: number }).total).toBe(1);
    const chapter = await appAs(null).request(`/api/v1/comments?story=${publicId}&chapter=1`);
    expect(((await chapter.json()) as { total: number }).total).toBe(0);

    const onDraft = await appAs(null).request(
      `/api/v1/comments/paragraph-counts?story=${publicId}&chapter=${draft}`,
    );
    expect(onDraft.status).toBe(404);
    expect(await errorCode(onDraft)).toBe('NOT_FOUND');
  });
});

describe('/api/v1/comments under an 18+ story', () => {
  it('answers 403 MATURE_CONTENT_DISABLED until the account turned 18+ on', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author, true);
    const adult = await makeUser('doc_gia_bat');
    const reader = await makeUser('doc_gia_tat');
    const turnedOn = await updatePreferences(db, adult.id, {
      showMature: true,
      confirmAdult: true,
    });
    if (!turnedOn.ok) throw new Error(turnedOn.error);

    const created = await appAs(adult).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Bình luận đầu' }),
    );
    expect(created.status).toBe(201);
    const { comment } = (await created.json()) as { comment: { id: string } };

    const reads = [
      `/api/v1/comments?story=${publicId}&chapter=1`,
      `/api/v1/comments/paragraph-counts?story=${publicId}&chapter=1`,
      `/api/v1/comments/${comment.id}/replies`,
    ];
    for (const viewer of [null, reader]) {
      for (const path of reads) {
        const res = await appAs(viewer).request(path);
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('MATURE_CONTENT_DISABLED');
      }
    }
    for (const path of reads) {
      expect((await appAs(adult).request(path)).status).toBe(200);
    }

    const refused = await appAs(reader).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Trả lời', parentId: comment.id }),
    );
    expect(refused.status).toBe(403);
    expect(await errorCode(refused)).toBe('MATURE_CONTENT_DISABLED');

    // A guest posting is stopped by the session check first.
    const guest = await appAs(null).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body: 'Khách' }),
    );
    expect(guest.status).toBe(401);
    expect(await errorCode(guest)).toBe('UNAUTHENTICATED');
  });
});

describe('/api/v1/comments edit, pin and discussion', () => {
  async function postComment(user: CurrentUser, publicId: string, body: string) {
    const res = await appAs(user).request(
      '/api/v1/comments',
      send('POST', { publicId, chapterNumber: 1, body }),
    );
    return ((await res.json()) as { comment: { id: string } }).comment.id;
  }

  it('edits the writer’s own comment and refuses anyone else', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const id = await postComment(reader, publicId, 'Bản đầu');

    const edited = await appAs(reader).request(
      `/api/v1/comments/${id}`,
      send('PATCH', { body: '  Bản sửa  ' }),
    );
    expect(edited.status).toBe(200);
    const { comment } = (await edited.json()) as {
      comment: { body: string; editedAt: string | null };
    };
    expect(comment.body).toBe('Bản sửa');
    expect(comment.editedAt).not.toBeNull();

    const other = await appAs(author).request(
      `/api/v1/comments/${id}`,
      send('PATCH', { body: 'x' }),
    );
    expect(other.status).toBe(403);
    expect(await errorCode(other)).toBe('FORBIDDEN');

    const empty = await appAs(reader).request(
      `/api/v1/comments/${id}`,
      send('PATCH', { body: ' ' }),
    );
    expect(empty.status).toBe(400);
    const guest = await appAs(null).request(`/api/v1/comments/${id}`, send('PATCH', { body: 'x' }));
    expect(guest.status).toBe(401);

    await db.insert(reports).values({
      reporterId: author.id,
      targetType: 'comment',
      targetId: id,
      reason: 'spam',
    });
    const reported = await appAs(reader).request(
      `/api/v1/comments/${id}`,
      send('PATCH', { body: 'Bản khác' }),
    );
    expect(reported.status).toBe(409);
    expect(await errorCode(reported)).toBe('COMMENT_UNDER_REVIEW');
  });

  it('lets the story’s author pin up to three comments, first in the list', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await postComment(reader, publicId, `Bình luận ${i}`));

    const notAuthor = await appAs(reader).request(
      `/api/v1/comments/${ids[0]}/pin`,
      send('PUT', { pinned: true }),
    );
    expect(notAuthor.status).toBe(403);
    for (const id of ids.slice(0, 3)) {
      const pinned = await appAs(author).request(
        `/api/v1/comments/${id}/pin`,
        send('PUT', { pinned: true }),
      );
      expect(pinned.status).toBe(200);
      expect(((await pinned.json()) as { pinnedAt: string | null }).pinnedAt).not.toBeNull();
    }
    const fourth = await appAs(author).request(
      `/api/v1/comments/${ids[3]}/pin`,
      send('PUT', { pinned: true }),
    );
    expect(fourth.status).toBe(409);
    expect(await errorCode(fourth)).toBe('COMMENT_PIN_LIMIT');

    const asAuthor = await appAs(author).request(`/api/v1/comments?story=${publicId}&chapter=1`);
    const page = (await asAuthor.json()) as {
      total: number;
      viewerCanPin: boolean;
      pinned: { body: string }[];
      items: { body: string }[];
    };
    expect(page).toMatchObject({ total: 4, viewerCanPin: true });
    expect(page.pinned.map((t) => t.body)).toEqual(['Bình luận 0', 'Bình luận 1', 'Bình luận 2']);
    expect(page.items.map((t) => t.body)).toEqual(['Bình luận 3']);

    const unpinned = await appAs(author).request(
      `/api/v1/comments/${ids[0]}/pin`,
      send('PUT', { pinned: false }),
    );
    expect(await unpinned.json()).toEqual({ pinnedAt: null });
    const broken = await appAs(author).request(
      `/api/v1/comments/${ids[0]}/pin`,
      send('PUT', { pinned: 'yes' }),
    );
    expect(broken.status).toBe(400);
  });

  it('posts to and lists the story discussion', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');

    const created = await appAs(reader).request(
      '/api/v1/comments/discussion',
      send('POST', { publicId, body: 'Truyện hay' }),
    );
    expect(created.status).toBe(201);
    const { comment } = (await created.json()) as { comment: { id: string } };
    const reply = await appAs(author).request(
      '/api/v1/comments/discussion',
      send('POST', { publicId, body: 'Cảm ơn', parentId: comment.id }),
    );
    expect(reply.status).toBe(201);

    const listed = await appAs(null).request(`/api/v1/comments/discussion?story=${publicId}`);
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toContain('no-store');
    expect(await listed.json()).toMatchObject({
      total: 2,
      pinned: [],
      viewerCanPin: false,
      items: [{ body: 'Truyện hay', replyCount: 1, replies: [{ body: 'Cảm ơn' }] }],
    });
    const chapterList = await appAs(null).request(`/api/v1/comments?story=${publicId}&chapter=1`);
    expect(((await chapterList.json()) as { total: number }).total).toBe(0);

    const missing = await appAs(null).request('/api/v1/comments/discussion?story=k7m2xq9p');
    expect(missing.status).toBe(404);
    const broken = await appAs(null).request('/api/v1/comments/discussion?story=x');
    expect(broken.status).toBe(400);
    const guest = await appAs(null).request(
      '/api/v1/comments/discussion',
      send('POST', { publicId, body: 'x' }),
    );
    expect(guest.status).toBe(401);
  });

  it('rate limits editing and discussion posts as comments', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author);
    const reader = await makeUser('doc_gia');
    const id = await postComment(reader, publicId, 'Bản đầu');
    const check = vi.fn<RateLimiter['check']>(() =>
      Promise.resolve({ allowed: false, retryAfterSec: 60 }),
    );
    const limiter: RateLimiter = {
      check,
      recordFailure: () => Promise.resolve(),
      clearFailures: () => Promise.resolve(),
    };
    const edit = await appAs(reader, limiter).request(
      `/api/v1/comments/${id}`,
      send('PATCH', { body: 'x' }),
    );
    expect(edit.status).toBe(429);
    const discuss = await appAs(reader, limiter).request(
      '/api/v1/comments/discussion',
      send('POST', { publicId, body: 'x' }),
    );
    expect(discuss.status).toBe(429);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenNthCalledWith(1, 'comment', expect.anything());
    expect(check).toHaveBeenNthCalledWith(2, 'comment', expect.anything());
  });

  it('keeps an 18+ discussion to accounts that turned 18+ on', async () => {
    const author = await makeUser('tac_gia', 'author');
    const publicId = await makeStory(author, true);
    const reader = await makeUser('doc_gia');
    const listed = await appAs(reader).request(`/api/v1/comments/discussion?story=${publicId}`);
    expect(listed.status).toBe(403);
    expect(await errorCode(listed)).toBe('MATURE_CONTENT_DISABLED');
    const posted = await appAs(reader).request(
      '/api/v1/comments/discussion',
      send('POST', { publicId, body: 'x' }),
    );
    expect(posted.status).toBe(403);
    const on = await updatePreferences(db, reader.id, { showMature: true, confirmAdult: true });
    if (!on.ok) throw new Error(on.error);
    const allowed = await appAs(reader).request(`/api/v1/comments/discussion?story=${publicId}`);
    expect(allowed.status).toBe(200);
  });
});
