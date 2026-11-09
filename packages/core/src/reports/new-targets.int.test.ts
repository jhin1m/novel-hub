import { chapters, comments, reports, storyAnnouncements } from '@novel-hub/db';
import type { ChapterStatus } from '@novel-hub/shared';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { postAnnouncement } from '../announcements/post-announcement';
import { createComment } from '../comments/create-comment';
import { createDiscussionComment } from '../comments/discussion';
import { setCommentPinned } from '../comments/pin-comment';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { createReport } from './create-report';
import { listReports } from './list-reports';

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
  const reporter = await makeUser(db, 'nguoi_bao');
  const mod = await makeUser(db, 'mod_one', 'mod');
  return { author, story, reader, reporter, mod };
}

async function queue(mod: Awaited<ReturnType<typeof setup>>['mod']) {
  const page = await listReports(db, mod, { status: 'open', page: 1 });
  if (!page.ok) throw new Error(page.error);
  return page.value.items;
}

describe('reporting an author announcement', () => {
  it('files a report on a visible one and shows it with its story in the queue', async () => {
    const { author, story, reporter, mod } = await setup();
    const posted = await postAnnouncement(db, author, story.publicId, 'Tạm nghỉ một tuần');
    if (!posted.ok) throw new Error(posted.error);
    const target = { type: 'announcement', announcementId: posted.value.id } as const;

    expect(await createReport(db, reporter, { target, reason: 'spam' })).toEqual({
      ok: true,
      value: { created: true },
    });
    const [item] = await queue(mod);
    expect(item?.target).toMatchObject({
      type: 'announcement',
      story: { publicId: story.publicId, author: { username: 'tac_gia' } },
      announcement: {
        id: posted.value.id,
        excerpt: 'Tạm nghỉ một tuần',
        truncated: false,
        status: 'visible',
      },
    });
  });

  it('cannot report one that is hidden, deleted or unknown', async () => {
    const { author, story, reporter } = await setup();
    const posted = await postAnnouncement(db, author, story.publicId, 'Thông báo');
    if (!posted.ok) throw new Error(posted.error);
    for (const status of ['hidden_by_mod', 'deleted']) {
      await db
        .update(storyAnnouncements)
        .set({ status })
        .where(eq(storyAnnouncements.id, posted.value.id));
      expect(
        await createReport(db, reporter, {
          target: { type: 'announcement', announcementId: posted.value.id },
          reason: 'spam',
        }),
      ).toEqual({ ok: false, error: 'NOT_FOUND' });
    }
    expect(
      await createReport(db, reporter, {
        target: { type: 'announcement', announcementId: '01920000-0000-7000-8000-000000000009' },
        reason: 'spam',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await db.select().from(reports)).toEqual([]);
  });
});

describe('reporting a comment of the story discussion', () => {
  it('files a report and shows the discussion as its place, without a chapter', async () => {
    const { author, story, reader, reporter, mod } = await setup();
    const posted = await createDiscussionComment(db, reader, {
      publicId: story.publicId,
      body: 'Truyện này chép từ chỗ khác',
    });
    if (!posted.ok) throw new Error(posted.error);
    await setCommentPinned(db, author, posted.value.id, true);

    expect(
      await createReport(db, reporter, {
        target: { type: 'comment', commentId: posted.value.id },
        reason: 'spam',
      }),
    ).toEqual({ ok: true, value: { created: true } });
    const [item] = await queue(mod);
    expect(item?.target).toMatchObject({
      type: 'comment',
      chapter: null,
      story: { publicId: story.publicId },
      comment: { id: posted.value.id, isReply: false, writer: { username: 'doc_gia' } },
    });
    expect(item?.target.type === 'comment' && item.target.comment.pinnedAt).toEqual(
      expect.any(String),
    );
  });

  it('cannot report a hidden discussion comment', async () => {
    const { story, reader, reporter } = await setup();
    const posted = await createDiscussionComment(db, reader, {
      publicId: story.publicId,
      body: 'Ẩn rồi',
    });
    if (!posted.ok) throw new Error(posted.error);
    await db
      .update(comments)
      .set({ status: 'hidden_by_mod' })
      .where(eq(comments.id, posted.value.id));
    expect(
      await createReport(db, reporter, {
        target: { type: 'comment', commentId: posted.value.id },
        reason: 'spam',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('reporting a chapter comment', () => {
  it('keeps its chapter in the context and the chapter rules for filing', async () => {
    const { story, reader, reporter, mod } = await setup();
    const posted = await createComment(db, reader, {
      publicId: story.publicId,
      chapterNumber: 1,
      body: 'Bình luận ở chương',
    });
    if (!posted.ok) throw new Error(posted.error);
    const target = { type: 'comment', commentId: posted.value.id } as const;

    expect((await createReport(db, reporter, { target, reason: 'spam' })).ok).toBe(true);
    const [item] = await queue(mod);
    expect(item?.target).toMatchObject({
      type: 'comment',
      chapter: { number: 1, status: 'published', deleted: false },
      comment: { pinnedAt: null },
    });

    // A comment under a chapter nobody may read (soft-deleted or hidden) can no longer be reported.
    const other = await makeUser(db, 'nguoi_bao_hai');
    const unreadable: { deletedAt: Date | null; status?: ChapterStatus }[] = [
      { deletedAt: new Date() },
      { deletedAt: null, status: 'hidden_by_mod' },
    ];
    for (const change of unreadable) {
      await db.update(chapters).set(change).where(eq(chapters.storyId, story.storyId));
      expect(await createReport(db, other, { target, reason: 'spam' })).toEqual({
        ok: false,
        error: 'NOT_FOUND',
      });
    }
  });
});
