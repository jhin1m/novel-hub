import { comments, moderationActions, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { COMMENT_PIN_MAX } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createComment } from '../comments/create-comment';
import { setCommentPinned } from '../comments/pin-comment';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { applyModerationAction } from './apply-action';

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
  const mod = await makeUser(db, 'mod_one', 'mod');
  return { author, story, reader, mod };
}

async function post(actor: CurrentUser, publicId: string, body: string) {
  const result = await createComment(db, actor, { publicId, chapterNumber: 1, body });
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

async function pinnedAt(id: string) {
  const [row] = await db
    .select({ pinnedAt: comments.pinnedAt })
    .from(comments)
    .where(eq(comments.id, id));
  return row?.pinnedAt ?? null;
}

describe('unpin_comment', () => {
  it('lets a moderator unpin a pinned comment, logged, the comment left as it is', async () => {
    const { author, story, reader, mod } = await setup();
    const id = await post(reader, story.publicId, 'Bình luận hay');
    expect((await setCommentPinned(db, author, id, true)).ok).toBe(true);

    const result = await applyModerationAction(db, mod, {
      action: 'unpin_comment',
      commentId: id,
      note: 'Ghim nội dung gây tranh cãi',
    });
    expect(result).toEqual({ ok: true, value: { action: 'unpin_comment' } });
    expect(await pinnedAt(id)).toBeNull();
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    expect(row?.status).toBe('visible');
    const [log] = await db.select().from(moderationActions);
    expect(log).toMatchObject({
      modId: mod.id,
      targetType: 'comment',
      targetId: id,
      action: 'unpin_comment',
      note: 'Ghim nội dung gây tranh cãi',
    });
  });

  it('refuses a comment that is not pinned, and a reader', async () => {
    const { author, story, reader, mod } = await setup();
    const id = await post(reader, story.publicId, 'Chưa ghim');
    expect(
      await applyModerationAction(db, mod, { action: 'unpin_comment', commentId: id }),
    ).toEqual({ ok: false, error: 'INVALID_STATE' });
    await setCommentPinned(db, author, id, true);
    expect(
      await applyModerationAction(db, reader, { action: 'unpin_comment', commentId: id }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await pinnedAt(id)).not.toBeNull();
    expect(await db.select().from(moderationActions)).toHaveLength(0);
  });
});

describe('pins of comments a moderator takes down', () => {
  it('hiding a pinned comment drops its pin and frees its place', async () => {
    const { author, story, reader, mod } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < COMMENT_PIN_MAX; i++) {
      const id = await post(reader, story.publicId, `Bình luận ${i}`);
      await setCommentPinned(db, author, id, true);
      ids.push(id);
    }
    const extra = await post(reader, story.publicId, 'Thêm một');
    expect(await setCommentPinned(db, author, extra, true)).toEqual({
      ok: false,
      error: 'COMMENT_PIN_LIMIT',
    });

    const [first] = ids;
    if (!first) throw new Error('no comment');
    expect(
      (await applyModerationAction(db, mod, { action: 'hide_comment', commentId: first })).ok,
    ).toBe(true);
    expect(await pinnedAt(first)).toBeNull();
    expect((await setCommentPinned(db, author, extra, true)).ok).toBe(true);

    // Restoring brings the comment back without its pin.
    expect(
      (await applyModerationAction(db, mod, { action: 'restore_comment', commentId: first })).ok,
    ).toBe(true);
    expect(await pinnedAt(first)).toBeNull();
  });

  it('banning a writer drops the pins on all their comments', async () => {
    const { author, story, reader, mod } = await setup();
    const other = await makeUser(db, 'doc_gia_hai');
    const banned = await post(reader, story.publicId, 'Của người bị cấm');
    const kept = await post(other, story.publicId, 'Của người khác');
    await setCommentPinned(db, author, banned, true);
    await setCommentPinned(db, author, kept, true);

    expect(
      (await applyModerationAction(db, mod, { action: 'ban_user', username: 'doc_gia' })).ok,
    ).toBe(true);
    expect(await pinnedAt(banned)).toBeNull();
    expect(await pinnedAt(kept)).not.toBeNull();
    const [user] = await db.select().from(users).where(eq(users.id, reader.id));
    expect(user?.status).toBe('banned');
  });
});
