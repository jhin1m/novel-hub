import {
  chapters,
  contentEvents,
  moderationActions,
  reports,
  sessions,
  stories,
  storyTags,
  tags,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import type { ModerationActionInput } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readableChapterWhere } from '../access/can-read-chapter';
import { publicStoryWhere } from '../catalog/story-card';
import { getDraft, saveDraft } from '../chapters/drafts';
import { contentChangeSchema } from '../content/hooks';
import type { StoryActor } from '../policies/story';
import { publishChapter } from '../publishing/publish-chapter';
import { makeUser } from '../testing/moderation-fixture';
import { addChapter, makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { applyModerationAction } from './apply-action';
import { setChapterHidden, setStoryHidden } from './content-visibility';
import { mergeTag } from './merge-tag';
import { banUser } from './user-status';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const apply = (actor: CurrentUser, input: ModerationActionInput) =>
  applyModerationAction(db, actor, input);

async function events() {
  const rows = await db.select().from(contentEvents).orderBy(contentEvents.id);
  return rows.map((row) => contentChangeSchema.parse(row.payload));
}

async function logRows() {
  return db.select().from(moderationActions);
}

async function storyRow(storyId: string) {
  const [row] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!row) throw new Error('story missing');
  return row;
}

async function addSession(userId: string, token: string) {
  await db.insert(sessions).values({ userId, token, expiresAt: new Date(Date.now() + 86_400_000) });
}

/** Stories any public list shows, and chapters anyone can read, of `storyId`. */
async function publicState(storyId: string) {
  const listed = await db
    .select({ id: stories.id })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(stories.id, storyId), publicStoryWhere({ includeMature: true })));
  const readable = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(chapters.storyId, storyId), readableChapterWhere()));
  return { listed: listed.length, readable: readable.length };
}

async function setup() {
  const author = await makeAuthor(db, 'author');
  const story = await makePublishedStory(db, author, 2);
  const mod = await makeUser(db, 'mod_one', 'mod');
  await db.delete(contentEvents);
  return { author, story, mod };
}

describe('ban and unban', () => {
  it('bans in one mechanism: status, sessions, log and outbox, stories untouched', async () => {
    const { author, story, mod } = await setup();
    await addSession(author.id, 'token-a');
    await addSession(author.id, 'token-b');
    const before = await storyRow(story.storyId);

    expect(await apply(mod, { action: 'ban_user', username: 'author', note: 'spam' })).toEqual({
      ok: true,
      value: { action: 'ban_user' },
    });

    const [user] = await db.select().from(users).where(eq(users.id, author.id));
    expect(user?.status).toBe('banned');
    expect(await db.select().from(sessions).where(eq(sessions.userId, author.id))).toEqual([]);
    expect(await logRows()).toMatchObject([
      { modId: mod.id, targetType: 'user', targetId: author.id, action: 'ban_user', note: 'spam' },
    ]);
    expect(await events()).toEqual([{ entity: 'user', action: 'banned', userId: author.id }]);
    const after = await storyRow(story.storyId);
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(await publicState(story.storyId)).toEqual({ listed: 0, readable: 0 });

    expect((await apply(mod, { action: 'unban_user', username: 'author' })).ok).toBe(true);
    expect(await publicState(story.storyId)).toEqual({ listed: 1, readable: 2 });
    expect((await events()).at(-1)).toEqual({
      entity: 'user',
      action: 'unbanned',
      userId: author.id,
    });
  });

  it('rolls everything back when the transaction fails after the ban', async () => {
    const { author, mod } = await setup();
    await addSession(author.id, 'token-a');
    await expect(
      db.transaction(async (tx) => {
        await banUser(tx, mod, author.id, 'x');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const [user] = await db.select().from(users).where(eq(users.id, author.id));
    expect(user?.status).toBe('active');
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await logRows()).toEqual([]);
    expect(await events()).toEqual([]);
  });

  it('enforces the role table and never lets anyone act on themselves', async () => {
    const { mod } = await setup();
    const otherMod = await makeUser(db, 'mod_two', 'mod');
    const admin = await makeUser(db, 'admin_one', 'admin');
    await makeUser(db, 'admin_two', 'admin');
    const reader = await makeUser(db, 'reader_one');

    const ban = (actor: CurrentUser, username: string) =>
      apply(actor, { action: 'ban_user', username });
    expect(await ban(mod, 'mod_two')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(mod, 'admin_one')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(mod, 'mod_one')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(admin, 'admin_two')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(admin, 'admin_one')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(reader, 'author')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await ban(mod, 'nobody_here')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect((await ban(admin, 'mod_two')).ok).toBe(true);
    expect(otherMod.role).toBe('mod');
    expect(await logRows()).toHaveLength(1);
  });

  it('refuses actions from an inactive moderator', async () => {
    const { mod } = await setup();
    const muted = { ...mod, status: 'muted' as const };
    expect(await apply(muted, { action: 'ban_user', username: 'author' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('checks the source state of every user action', async () => {
    const { mod } = await setup();
    expect(await apply(mod, { action: 'unban_user', username: 'author' })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await apply(mod, { action: 'unmute_user', username: 'author' })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect((await apply(mod, { action: 'mute_user', username: 'author' })).ok).toBe(true);
    expect(await apply(mod, { action: 'mute_user', username: 'author' })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    // Muting changes nothing public: no outbox event.
    expect(await events()).toEqual([]);
    // A muted user can still be banned.
    expect((await apply(mod, { action: 'ban_user', username: 'author' })).ok).toBe(true);
  });
});

describe('hiding and restoring content', () => {
  it('hides a chapter: counters drop, outbox event, publishing it again is refused', async () => {
    const { author, story, mod } = await setup();
    const before = await storyRow(story.storyId);
    expect(before.chapterCount).toBe(2);

    const hide = { action: 'hide_chapter', storyPublicId: story.publicId, number: 2 } as const;
    expect((await apply(mod, hide)).ok).toBe(true);
    const hidden = await storyRow(story.storyId);
    expect(hidden.chapterCount).toBe(1);
    expect(hidden.wordCount).toBe(before.wordCount / 2);
    const [chapter] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.storyId, story.storyId), eq(chapters.number, 2)));
    expect(chapter?.status).toBe('hidden_by_mod');
    expect(await events()).toEqual([
      {
        entity: 'chapter',
        action: 'hidden',
        storyId: story.storyId,
        chapterId: chapter?.id,
        chapterNumber: 2,
      },
    ]);
    expect(await apply(mod, hide)).toEqual({ ok: false, error: 'INVALID_STATE' });

    const draft = await saveDraftOf(author, story.publicId, 2);
    expect(await publishChapter(db, author, story.publicId, 2, { baseUpdatedAt: draft })).toEqual({
      ok: false,
      error: 'CHAPTER_HIDDEN_BY_MOD',
    });

    expect(
      (await apply(mod, { action: 'restore_chapter', storyPublicId: story.publicId, number: 2 }))
        .ok,
    ).toBe(true);
    expect((await storyRow(story.storyId)).chapterCount).toBe(2);
    expect((await events()).at(-1)).toMatchObject({ entity: 'chapter', action: 'restored' });
  });

  it('only hides published chapters and stories', async () => {
    const { author, story, mod } = await setup();
    await addChapter(db, author, story.publicId, true);
    expect(
      await apply(mod, { action: 'hide_chapter', storyPublicId: story.publicId, number: 3 }),
    ).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(
      await apply(mod, { action: 'hide_chapter', storyPublicId: story.publicId, number: 9 }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await apply(mod, { action: 'restore_story', storyPublicId: story.publicId })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await apply(mod, { action: 'hide_story', storyPublicId: 'zzzzzzzz' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('hides and restores a story with log and outbox in the same transaction', async () => {
    const { story, mod } = await setup();
    expect((await apply(mod, { action: 'hide_story', storyPublicId: story.publicId })).ok).toBe(
      true,
    );
    expect((await storyRow(story.storyId)).visibility).toBe('hidden_by_mod');
    expect(await publicState(story.storyId)).toEqual({ listed: 0, readable: 0 });
    expect((await apply(mod, { action: 'restore_story', storyPublicId: story.publicId })).ok).toBe(
      true,
    );
    expect(await publicState(story.storyId)).toEqual({ listed: 1, readable: 2 });
    expect(await events()).toEqual([
      { entity: 'story', action: 'hidden', storyId: story.storyId },
      { entity: 'story', action: 'restored', storyId: story.storyId },
    ]);
    expect((await logRows()).map((r) => r.action)).toEqual(['hide_story', 'restore_story']);
  });

  it('does not deadlock with the author publishing in the same story', async () => {
    const { author, story, mod } = await setup();
    await addChapter(db, author, story.publicId, true);
    const base = await saveDraftOf(author, story.publicId, 3);
    const [hidden, published] = await Promise.all([
      apply(mod, { action: 'hide_chapter', storyPublicId: story.publicId, number: 1 }),
      publishChapter(db, author, story.publicId, 3, { baseUpdatedAt: base }),
    ]);
    expect(hidden.ok).toBe(true);
    expect(published.ok).toBe(true);
    const row = await storyRow(story.storyId);
    expect(row.chapterCount).toBe(2);
  });

  it('resolves the report it was taken from and every open report on the target', async () => {
    const { story, mod } = await setup();
    const reporter = await makeUser(db, 'reader_one');
    const [first, second] = await db
      .insert(reports)
      .values([
        { reporterId: reporter.id, targetType: 'story', targetId: story.storyId, reason: 'spam' },
        { reporterId: null, targetType: 'story', targetId: story.storyId, reason: 'copyright' },
      ])
      .returning();
    const [elsewhere] = await db
      .insert(reports)
      .values({
        reporterId: mod.id,
        targetType: 'user',
        targetId: reporter.id,
        reason: 'spam',
      })
      .returning();
    if (!first || !second || !elsewhere) throw new Error('insert failed');

    expect(
      (
        await apply(mod, {
          action: 'hide_story',
          storyPublicId: story.publicId,
          reportId: first.id,
        })
      ).ok,
    ).toBe(true);
    const rows = await db.select().from(reports);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(first.id)).toMatchObject({ status: 'resolved', handledBy: mod.id });
    expect(byId.get(second.id)).toMatchObject({ status: 'resolved', handledBy: mod.id });
    expect(byId.get(elsewhere.id)).toMatchObject({ status: 'open', handledBy: null });

    expect(await apply(mod, { action: 'dismiss_report', reportId: first.id })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect((await apply(mod, { action: 'dismiss_report', reportId: elsewhere.id })).ok).toBe(true);
    const [dismissed] = await db.select().from(reports).where(eq(reports.id, elsewhere.id));
    expect(dismissed).toMatchObject({ status: 'dismissed', handledBy: mod.id });
    expect((await logRows()).map((r) => [r.targetType, r.action])).toEqual([
      ['story', 'hide_story'],
      ['report', 'dismiss_report'],
    ]);
  });
});

describe('acting on the content and reports of moderators', () => {
  it('applies the user rules to their content: nobody acts on their own, mods leave mods to admins', async () => {
    const { mod } = await setup();
    const admin = await makeUser(db, 'admin_one', 'admin');
    const modStory = await makePublishedStory(db, mod, 1, 'Truyện Của Mod');
    const adminStory = await makePublishedStory(db, admin, 1, 'Truyện Của Admin');
    const hide = (actor: CurrentUser, storyPublicId: string) =>
      apply(actor, { action: 'hide_story', storyPublicId });

    expect(await hide(mod, modStory.publicId)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await hide(mod, adminStory.publicId)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await apply(mod, { action: 'hide_chapter', storyPublicId: adminStory.publicId, number: 1 }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await hide(admin, adminStory.publicId)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await hide(admin, modStory.publicId)).ok).toBe(true);
    // The hidden mod cannot restore their own story.
    expect(await apply(mod, { action: 'restore_story', storyPublicId: modStory.publicId })).toEqual(
      { ok: false, error: 'FORBIDDEN' },
    );
  });

  it('never lets anyone close a report about themselves or their content', async () => {
    const { story, mod } = await setup();
    const reporter = await makeUser(db, 'reader_one');
    const modStory = await makePublishedStory(db, mod, 1, 'Truyện Của Mod');
    const [aboutMod, aboutStory, aboutOther] = await db
      .insert(reports)
      .values([
        { reporterId: reporter.id, targetType: 'user', targetId: mod.id, reason: 'spam' },
        {
          reporterId: reporter.id,
          targetType: 'story',
          targetId: modStory.storyId,
          reason: 'spam',
        },
        { reporterId: reporter.id, targetType: 'story', targetId: story.storyId, reason: 'spam' },
      ])
      .returning();
    if (!aboutMod || !aboutStory || !aboutOther) throw new Error('insert failed');

    for (const report of [aboutMod, aboutStory]) {
      expect(await apply(mod, { action: 'dismiss_report', reportId: report.id })).toEqual({
        ok: false,
        error: 'FORBIDDEN',
      });
    }
    // Nor as a side effect of an action taken "from" that report.
    expect(
      await apply(mod, {
        action: 'hide_story',
        storyPublicId: story.publicId,
        reportId: aboutMod.id,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect((await db.select().from(reports)).every((r) => r.status === 'open')).toBe(true);
    expect((await storyRow(story.storyId)).visibility).toBe('published');
    expect((await apply(mod, { action: 'dismiss_report', reportId: aboutOther.id })).ok).toBe(true);
  });
});

describe('transactions', () => {
  it('leaves no row behind when the transaction fails after a hide or a merge', async () => {
    const { story, mod } = await setup();
    const steps = [
      (tx: Parameters<typeof banUser>[0]) => setStoryHidden(tx, mod, story.publicId, true, 'x'),
      (tx: Parameters<typeof banUser>[0]) =>
        setChapterHidden(tx, mod, story.publicId, 1, true, 'x'),
      (tx: Parameters<typeof banUser>[0]) => mergeTag(tx, mod, 'tien-hiep', 'huyen-huyen', 'x'),
    ];
    const before = await storyRow(story.storyId);
    for (const step of steps) {
      await expect(
        db.transaction(async (tx) => {
          const result = await step(tx);
          expect(result.ok).toBe(true);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    }
    expect(await storyRow(story.storyId)).toEqual(before);
    expect(await logRows()).toEqual([]);
    expect(await events()).toEqual([]);
    const [tag] = await db.select().from(tags).where(eq(tags.slug, 'tien-hiep'));
    expect(tag?.canonicalId).toBeNull();
  });

  it('a tag merge waits for a story edit holding its story lock instead of deadlocking', async () => {
    const { story, mod } = await setup();
    const [source] = await db.select().from(tags).where(eq(tags.slug, 'xuyen-khong'));
    if (!source) throw new Error('tag missing');
    await db.insert(storyTags).values({ storyId: story.storyId, tagId: source.id });

    // A story edit (as updateStory does): lock the story, then rewrite its tags, whose foreign key
    // check takes a key-share lock on the tag the merge has already locked.
    let merging: ReturnType<typeof apply> | undefined;
    await db.transaction(async (tx) => {
      await tx.select().from(stories).where(eq(stories.id, story.storyId)).for('update');
      merging = apply(mod, {
        action: 'merge_tag',
        sourceSlug: 'xuyen-khong',
        targetSlug: 'he-thong',
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.delete(storyTags).where(eq(storyTags.storyId, story.storyId));
      await tx.insert(storyTags).values({ storyId: story.storyId, tagId: source.id });
    });
    expect((await merging)?.ok).toBe(true);
    const rows = await db
      .select({ slug: tags.slug })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(eq(storyTags.storyId, story.storyId));
    expect(rows.map((r) => r.slug)).toEqual(['he-thong']);
  });
});

describe('merge_tag', () => {
  async function tagRow(slug: string) {
    const [row] = await db.select().from(tags).where(eq(tags.slug, slug));
    if (!row) throw new Error(`tag ${slug} missing`);
    return row;
  }

  async function storyTagSlugs(storyId: string) {
    const rows = await db
      .select({ slug: tags.slug })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(eq(storyTags.storyId, storyId));
    return rows.map((r) => r.slug).sort();
  }

  it('refuses another kind, an already merged tag and the same tag', async () => {
    const { mod } = await setup();
    const merge = (sourceSlug: string, targetSlug: string) =>
      apply(mod, { action: 'merge_tag', sourceSlug, targetSlug });
    expect(await merge('xuyen-khong', 'tien-hiep')).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await merge('huyen-huyen', 'tu-tien')).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await merge('tu-tien', 'huyen-huyen')).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await merge('tien-hiep', 'tien-hiep')).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await merge('khong-co', 'tien-hiep')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await logRows()).toEqual([]);
  });

  it('moves stories and main tags, drops duplicates, flattens the chain, emits events', async () => {
    const { author, story, mod } = await setup();
    // `story` has main tag tien-hiep; a second story has main tag huyen-huyen and both tags.
    const other = await makePublishedStory(db, author, 1, 'Truyện Thứ Hai');
    await db
      .update(stories)
      .set({ mainTagId: (await tagRow('huyen-huyen')).id })
      .where(eq(stories.id, other.storyId));
    await db
      .insert(storyTags)
      .values({ storyId: other.storyId, tagId: (await tagRow('huyen-huyen')).id });
    const untouched = await makePublishedStory(db, author, 1, 'Truyện Khác');
    await db
      .update(stories)
      .set({ mainTagId: (await tagRow('do-thi')).id })
      .where(eq(stories.id, untouched.storyId));
    await db.delete(storyTags).where(eq(storyTags.storyId, untouched.storyId));
    await db.delete(contentEvents);

    const result = await apply(mod, {
      action: 'merge_tag',
      sourceSlug: 'tien-hiep',
      targetSlug: 'huyen-huyen',
      note: 'trùng',
    });
    expect(result.ok).toBe(true);

    const target = await tagRow('huyen-huyen');
    expect((await tagRow('tien-hiep')).canonicalId).toBe(target.id);
    // tu-tien used to point at tien-hiep: it now points straight at the final tag.
    expect((await tagRow('tu-tien')).canonicalId).toBe(target.id);
    expect((await storyRow(story.storyId)).mainTagId).toBe(target.id);
    expect(await storyTagSlugs(story.storyId)).toEqual(['huyen-huyen']);
    expect(await storyTagSlugs(other.storyId)).toEqual(['huyen-huyen']);
    expect((await storyRow(untouched.storyId)).mainTagId).toBe((await tagRow('do-thi')).id);

    const changes = await events();
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => (c.entity === 'story' ? c.storyId : '')).sort()).toEqual(
      [story.storyId, other.storyId].sort(),
    );
    for (const change of changes) {
      expect(change).toMatchObject({
        entity: 'story',
        action: 'updated',
        previousTagSlugs: ['tien-hiep', 'tu-tien'],
      });
    }
    expect(await logRows()).toMatchObject([
      { targetType: 'tag', targetId: (await tagRow('tien-hiep')).id, action: 'merge_tag' },
    ]);
  });
});

/** Saves new text into the chapter's draft and returns the draft version to publish from. */
async function saveDraftOf(author: StoryActor, publicId: string, number: number) {
  const current = await getDraft(db, author, publicId, number);
  if (!current.ok) throw new Error(current.error);
  const text = Array.from({ length: 320 }, (_, i) => `mới${i}`).join(' ');
  const saved = await saveDraft(db, author, publicId, number, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: current.value.updatedAt,
  });
  if (!saved.ok) throw new Error(saved.error);
  return saved.value.updatedAt;
}
