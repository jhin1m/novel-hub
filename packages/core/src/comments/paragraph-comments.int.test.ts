import { chapterContents, comments, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyModerationAction } from '../moderation/apply-action';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { createComment } from './create-comment';
import { listChapterComments } from './list-comments';
import { countParagraphComments } from './paragraph-counts';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

/** Pids of a heading and a second paragraph, added to chapter 1 as a republish would. */
const HEADING = 'hd2k9xq2';
const SECOND = 'pa2k9xq3';

async function setup() {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1);
  const reader = await makeUser(db, 'doc_gia');
  const other = await makeUser(db, 'doc_gia_hai');
  const admin = await makeUser(db, 'quan_tri', 'admin');
  const [content] = await db.select().from(chapterContents);
  if (!content) throw new Error('chapter content missing');
  const [first] = content.paragraphIds;
  if (!first) throw new Error('chapter has no paragraph');
  await setParagraphs(content.chapterId, [HEADING, first, SECOND]);
  const ref = { publicId: story.publicId, chapterNumber: 1 };
  return { story, reader, other, admin, ref, first, chapterId: content.chapterId };
}

/** Stands in for a republish that changed which paragraphs the text has. */
async function setParagraphs(chapterId: string, pids: string[]) {
  await db
    .update(chapterContents)
    .set({ paragraphIds: pids })
    .where(eq(chapterContents.chapterId, chapterId));
}

type ChapterKey = { publicId: string; chapterNumber: number };

async function post(
  actor: CurrentUser,
  ref: ChapterKey,
  body: string,
  extra: { parentId?: string; paragraphId?: string } = {},
) {
  const result = await createComment(db, actor, { ...ref, body, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function page(publicId: string, paragraphId?: string) {
  const result = await listChapterComments(db, null, { publicId, number: 1, paragraphId });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function counts(publicId: string) {
  const result = await countParagraphComments(db, { publicId, number: 1 });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('paragraph comments', () => {
  it('posts about a paragraph or a heading of the text and refuses any other pid', async () => {
    const { reader, ref, first } = await setup();
    const onParagraph = await post(reader, ref, 'Đoạn này hay', { paragraphId: first });
    const onHeading = await post(reader, ref, 'Tên mục lạ', { paragraphId: HEADING });
    const stored = await db.select().from(comments);
    expect(new Map(stored.map((row) => [row.id, row.paragraphId]))).toEqual(
      new Map([
        [onParagraph.id, first],
        [onHeading.id, HEADING],
      ]),
    );
    expect(
      await createComment(db, reader, { ...ref, body: 'Lạc đề', paragraphId: 'zz2k9xq2' }),
    ).toEqual({ ok: false, error: 'COMMENT_PARAGRAPH_INVALID' });
  });

  it('files a reply under its thread’s paragraph, whatever the client sends', async () => {
    const { reader, other, ref, first, story } = await setup();
    const thread = await post(reader, ref, 'Đoạn này hay', { paragraphId: first });
    const reply = await post(other, ref, 'Đồng ý', { parentId: thread.id, paragraphId: SECOND });
    const [row] = await db.select().from(comments).where(eq(comments.id, reply.id));
    expect(row?.paragraphId).toBe(first);
    // A reply to a chapter thread stays the chapter's, even with a valid pid.
    const chapterThread = await post(reader, ref, 'Cả chương hay');
    const chapterReply = await post(other, ref, 'Ừ', {
      parentId: chapterThread.id,
      paragraphId: first,
    });
    const [chapterRow] = await db.select().from(comments).where(eq(comments.id, chapterReply.id));
    expect(chapterRow?.paragraphId).toBeNull();

    const paragraph = await page(story.publicId, first);
    expect(paragraph.total).toBe(2);
    expect(paragraph.items.map((item) => [item.body, item.replyCount])).toEqual([
      ['Đoạn này hay', 1],
    ]);
    expect(paragraph.items[0]?.orphanedParagraph).toBe(false);
    const chapter = await page(story.publicId);
    expect(chapter.total).toBe(2);
    expect(chapter.items.map((item) => item.body)).toEqual(['Cả chương hay']);
  });

  it('counts each paragraph’s shown threads and replies, leaving out hidden and banned', async () => {
    const { reader, other, admin, ref, first, story } = await setup();
    const thread = await post(reader, ref, 'Một', { paragraphId: first });
    await post(other, ref, 'Hai', { parentId: thread.id });
    await post(other, ref, 'Ba', { paragraphId: first });
    const hidden = await post(reader, ref, 'Bốn', { paragraphId: SECOND });
    await post(reader, ref, 'Năm', { paragraphId: HEADING });
    await post(reader, ref, 'Cả chương');
    expect(await counts(story.publicId)).toEqual({ [first]: 3, [SECOND]: 1, [HEADING]: 1 });

    expect(
      (await applyModerationAction(db, admin, { action: 'hide_comment', commentId: hidden.id })).ok,
    ).toBe(true);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, other.id));
    expect(await counts(story.publicId)).toEqual({ [first]: 1, [HEADING]: 1 });
    expect((await page(story.publicId, first)).total).toBe(1);
  });

  it('moves the threads of a paragraph edited out of the text to the chapter’s list', async () => {
    const { reader, other, ref, first, story, chapterId } = await setup();
    const thread = await post(reader, ref, 'Về đoạn hai', { paragraphId: SECOND });
    await post(other, ref, 'Trả lời', { parentId: thread.id });
    await post(reader, ref, 'Cả chương');
    await setParagraphs(chapterId, [first]);

    expect(await counts(story.publicId)).toEqual({});
    expect((await page(story.publicId, SECOND)).items).toEqual([]);
    const chapter = await page(story.publicId);
    expect(chapter.total).toBe(3);
    expect(chapter.items.map((item) => [item.body, item.orphanedParagraph])).toEqual([
      ['Cả chương', false],
      ['Về đoạn hai', true],
    ]);
    // Replying to it still works and stays with it.
    await post(other, ref, 'Vẫn trả lời được', { parentId: thread.id });
    expect((await page(story.publicId)).total).toBe(4);
    // New comments cannot target the paragraph any more.
    expect(await createComment(db, reader, { ...ref, body: 'Muộn', paragraphId: SECOND })).toEqual({
      ok: false,
      error: 'COMMENT_PARAGRAPH_INVALID',
    });
  });

  it('answers NOT_FOUND for the counts of a chapter nobody may read', async () => {
    const { story } = await setup();
    expect(await countParagraphComments(db, { publicId: story.publicId, number: 9 })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });
});
