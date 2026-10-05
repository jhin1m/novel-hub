import {
  chapterContents,
  chapterDrafts,
  chapterRevisions,
  chapters,
  contentEvents,
  stories,
  users,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { updateChapterMeta } from '../chapters/chapter-meta';
import { createChapter } from '../chapters/create-chapter';
import { getDraft, saveDraft } from '../chapters/drafts';
import type { StoryActor } from '../policies/story';
import { removeStoryCover } from '../stories/cover';
import { createStory } from '../stories/create-story';
import { updateStory } from '../stories/update-story';
import { deleteChapter } from './delete-chapter';
import { publishChapter } from './publish-chapter';
import { publishDueChapters } from './publish-due';
import { scheduleChapter, unscheduleChapter } from './schedule-chapter';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function makeUser(username: string): Promise<StoryActor> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      emailVerified: true,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return { id: row.id, role: row.role, status: row.status, emailVerified: row.emailVerified };
}

async function makeStory(actor: StoryActor): Promise<string> {
  const result = await createStory(db, actor, {
    title: 'Kiếm Đạo Độc Tôn',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.publicId;
}

/** A document of `words` words in one paragraph; `pid: null` leaves the pid for the server. */
function wordsDoc(words: number, opts: { seed?: string; pid?: string | null } = {}) {
  const body = Array.from({ length: words }, (_, i) => `${opts.seed ?? 'chữ'}${i}`).join(' ');
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { pid: opts.pid === undefined ? 'k7m2xq9p' : opts.pid },
        content: [{ type: 'text', text: body }],
      },
    ],
  };
}

interface Setup {
  author: StoryActor;
  publicId: string;
}

async function setup(): Promise<Setup> {
  const author = await makeUser('author');
  return { author, publicId: await makeStory(author) };
}

/** Creates the next chapter and saves `doc` as its draft; returns the draft version. */
async function chapterWithDraft({ author, publicId }: Setup, doc: object): Promise<string> {
  const created = await createChapter(db, author, publicId);
  if (!created.ok) throw new Error(created.error);
  return saveAs({ author, publicId }, created.value.number, created.value.draftUpdatedAt, doc);
}

async function saveAs(
  { author, publicId }: Setup,
  number: number,
  base: string | null,
  doc: object,
): Promise<string> {
  const saved = await saveDraft(db, author, publicId, number, { doc, baseUpdatedAt: base ?? '' });
  if (!saved.ok) throw new Error(saved.error);
  return saved.value.updatedAt;
}

async function storyRow(publicId: string) {
  const [row] = await db.select().from(stories).where(eq(stories.publicId, publicId));
  if (!row) throw new Error('story missing');
  return row;
}

async function chapterRow(number: number) {
  const [row] = await db.select().from(chapters).where(eq(chapters.number, number));
  if (!row) throw new Error('chapter missing');
  return row;
}

async function events() {
  const rows = await db
    .select({ payload: contentEvents.payload })
    .from(contentEvents)
    .orderBy(asc(contentEvents.id));
  return rows.map((r) => r.payload as { entity: string; action: string });
}

const count = async (table: typeof chapterRevisions | typeof chapterContents) =>
  (await db.select().from(table)).length;

describe('publishChapter', () => {
  it('publishes a first chapter: content, revision, counters, story goes public, outbox', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(320));
    const now = new Date(Date.now() - HOUR);
    const result = await publishChapter(db, s.author, s.publicId, 1, {
      baseUpdatedAt: base,
      now,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      unchanged: false,
      normalizedDoc: null,
      draftUpdatedAt: base,
      storyVisibility: 'published',
      chapter: { status: 'published', wordCount: 320, publishedAt: now.toISOString() },
    });

    const [content] = await db.select().from(chapterContents);
    expect(content?.html).toMatch(/^<p data-pid="k7m2xq9p">chữ0 chữ1/);
    expect(content?.paragraphIds).toEqual(['k7m2xq9p']);
    expect(await count(chapterRevisions)).toBe(1);
    expect(await storyRow(s.publicId)).toMatchObject({
      visibility: 'published',
      chapterCount: 1,
      wordCount: 320,
      lastChapterAt: now,
    });
    expect(await events()).toEqual([
      expect.objectContaining({ entity: 'chapter', action: 'published', chapterNumber: 1 }),
      expect.objectContaining({ entity: 'story', action: 'published' }),
    ]);
    const draft = await getDraft(db, s.author, s.publicId, 1);
    expect(draft.ok && draft.value.hasUnpublishedChanges).toBe(false);
  });

  it('writes nothing at all when the word count is out of range or the base is stale', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(299));
    expect(await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base })).toEqual({
      ok: false,
      error: 'WORD_COUNT_OUT_OF_RANGE',
    });
    const fresh = await saveAs(s, 1, base, wordsDoc(300));
    expect(await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base })).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect(
      await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: 'not-a-date' }),
    ).toEqual({ ok: false, error: 'DRAFT_CONFLICT' });
    expect(await count(chapterContents)).toBe(0);
    expect(await count(chapterRevisions)).toBe(0);
    expect(await events()).toEqual([]);
    expect((await chapterRow(1)).status).toBe('draft');
    expect((await storyRow(s.publicId)).visibility).toBe('draft');
    expect((await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: fresh })).ok).toBe(
      true,
    );
  });

  it('updates a published chapter, and skips identical content entirely', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300));
    const first = new Date(Date.now() - HOUR);
    await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base, now: first });

    const same = await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
    expect(same.ok && same.value.unchanged).toBe(true);
    expect(await count(chapterRevisions)).toBe(1);
    expect(await events()).toHaveLength(2);

    const edited = await saveAs(s, 1, base, wordsDoc(400, { seed: 'mới' }));
    const draft = await getDraft(db, s.author, s.publicId, 1);
    expect(draft.ok && draft.value.hasUnpublishedChanges).toBe(true);
    const updated = await publishChapter(db, s.author, s.publicId, 1, {
      baseUpdatedAt: edited,
    });
    expect(updated.ok && updated.value).toMatchObject({
      unchanged: false,
      chapter: { publishedAt: first.toISOString(), wordCount: 400 },
    });
    expect(await count(chapterRevisions)).toBe(2);
    expect((await storyRow(s.publicId)).wordCount).toBe(400);
    expect((await events()).at(-1)).toMatchObject({ entity: 'chapter', action: 'updated' });

    // Editing then reverting is not an unpublished change.
    const changed = await saveAs(s, 1, edited, wordsDoc(401, { seed: 'mới' }));
    await saveAs(s, 1, changed, wordsDoc(400, { seed: 'mới' }));
    const reverted = await getDraft(db, s.author, s.publicId, 1);
    expect(reverted.ok && reverted.value.hasUnpublishedChanges).toBe(false);
  });

  it('rewrites missing pids into the draft and hands the editor the new version', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300, { pid: null }));
    const result = await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.draftUpdatedAt > base).toBe(true);
    const pid = result.value.normalizedDoc?.content?.[0]?.attrs?.pid;
    expect(pid).toMatch(/^[a-z2-9]{8}$/);

    const draft = await getDraft(db, s.author, s.publicId, 1);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.value).toMatchObject({
      updatedAt: result.value.draftUpdatedAt,
      doc: result.value.normalizedDoc,
      hasUnpublishedChanges: false,
    });
    // An autosave still holding the old version cannot overwrite the new pids.
    expect(
      await saveDraft(db, s.author, s.publicId, 1, { doc: wordsDoc(1), baseUpdatedAt: base }),
    ).toEqual({ ok: false, error: 'DRAFT_CONFLICT' });
  });

  it('makes a concurrent stale autosave fail instead of overwriting the normalized draft', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300, { pid: null }));
    const [row] = await db.select({ id: chapters.id }).from(chapters);
    // Hold the draft row so the publish and the autosave queue up behind it, in that order.
    const blocker = await pool.connect();
    try {
      await blocker.query('begin');
      await blocker.query('select 1 from chapter_drafts where chapter_id = $1 for update', [
        row?.id,
      ]);
      const publishing = publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const saving = saveDraft(db, s.author, s.publicId, 1, {
        doc: wordsDoc(5, { seed: 'muộn' }),
        baseUpdatedAt: base,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await blocker.query('commit');
      const [published, saved] = await Promise.all([publishing, saving]);
      expect(published.ok).toBe(true);
      expect(saved).toEqual({ ok: false, error: 'DRAFT_CONFLICT' });
      const [draft] = await db.select().from(chapterDrafts);
      expect(published.ok && draft?.docJson).toEqual(
        published.ok ? published.value.normalizedDoc : null,
      );
    } finally {
      blocker.release();
    }
  });

  it('keeps the newest 20 revisions', async () => {
    const s = await setup();
    let base = await chapterWithDraft(s, wordsDoc(300, { seed: 'r0-' }));
    for (let i = 0; i < 22; i++) {
      if (i > 0) base = await saveAs(s, 1, base, wordsDoc(300, { seed: `r${i}-` }));
      const result = await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
      if (!result.ok) throw new Error(result.error);
    }
    const revisions = await db.select().from(chapterRevisions);
    expect(revisions).toHaveLength(20);
    expect(JSON.stringify(revisions.map((r) => r.docJson))).not.toContain('r1-0');
    expect(JSON.stringify(revisions.map((r) => r.docJson))).toContain('r21-0');
  });

  it('respects moderators: hidden chapters are frozen, a hidden story stays hidden', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300));
    await db.update(chapters).set({ status: 'hidden_by_mod' });
    expect(await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base })).toEqual({
      ok: false,
      error: 'CHAPTER_HIDDEN_BY_MOD',
    });
    expect(
      await scheduleChapter(db, s.author, s.publicId, 1, {
        baseUpdatedAt: base,
        scheduledAt: new Date(Date.now() + DAY),
      }),
    ).toEqual({ ok: false, error: 'CHAPTER_HIDDEN_BY_MOD' });
    expect(await updateChapterMeta(db, s.author, s.publicId, 1, { title: 'x' })).toEqual({
      ok: false,
      error: 'CHAPTER_HIDDEN_BY_MOD',
    });
    expect(await deleteChapter(db, s.author, s.publicId, 1)).toEqual({
      ok: false,
      error: 'CHAPTER_HIDDEN_BY_MOD',
    });
    expect((await chapterRow(1)).deletedAt).toBeNull();
    // The private draft is still editable.
    await saveAs(s, 1, base, wordsDoc(310));

    const second = await chapterWithDraft(s, wordsDoc(300));
    await db.update(stories).set({ visibility: 'hidden_by_mod' });
    const result = await publishChapter(db, s.author, s.publicId, 2, { baseUpdatedAt: second });
    expect(result.ok && result.value.storyVisibility).toBe('hidden_by_mod');
    expect((await storyRow(s.publicId)).visibility).toBe('hidden_by_mod');
  });
});

describe('scheduleChapter and publishDueChapters', () => {
  it('stores content now, publishes it when due, and touches nothing public before', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300));
    const now = new Date();
    const at = new Date(now.getTime() + HOUR);
    expect(
      await scheduleChapter(db, s.author, s.publicId, 1, {
        baseUpdatedAt: base,
        scheduledAt: new Date(now.getTime() + 4 * 60_000),
        now,
      }),
    ).toEqual({ ok: false, error: 'INVALID_SCHEDULE_TIME' });

    const scheduled = await scheduleChapter(db, s.author, s.publicId, 1, {
      baseUpdatedAt: base,
      scheduledAt: at,
      now,
    });
    expect(scheduled.ok && scheduled.value.chapter).toMatchObject({
      status: 'scheduled',
      scheduledAt: at.toISOString(),
      publishedAt: null,
    });
    expect(await count(chapterContents)).toBe(1);
    expect(await count(chapterRevisions)).toBe(1);
    expect(await events()).toEqual([]);
    expect(await storyRow(s.publicId)).toMatchObject({ visibility: 'draft', chapterCount: 0 });

    expect(await publishDueChapters(db, { now })).toEqual({ published: 0 });
    const later = new Date(now.getTime() + DAY);
    expect(await publishDueChapters(db, { now: later })).toEqual({ published: 1 });
    expect(await chapterRow(1)).toMatchObject({
      status: 'published',
      publishedAt: later,
      scheduledAt: null,
    });
    expect(await storyRow(s.publicId)).toMatchObject({
      visibility: 'published',
      chapterCount: 1,
      wordCount: 300,
    });
    expect((await events()).map((e) => `${e.entity}.${e.action}`)).toEqual([
      'chapter.published',
      'story.published',
    ]);
    expect(await publishDueChapters(db, { now: later })).toEqual({ published: 0 });
  });

  it('refreshes scheduled content at the same time even when it is close or already due', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300));
    const now = new Date();
    const at = new Date(now.getTime() + HOUR);
    await scheduleChapter(db, s.author, s.publicId, 1, {
      baseUpdatedAt: base,
      scheduledAt: at,
      now,
    });
    const edited = await saveAs(s, 1, base, wordsDoc(350));
    const almost = new Date(at.getTime() - 60_000);
    const refreshed = await scheduleChapter(db, s.author, s.publicId, 1, {
      baseUpdatedAt: edited,
      scheduledAt: at,
      now: almost,
    });
    expect(refreshed.ok && refreshed.value.chapter).toMatchObject({
      status: 'scheduled',
      wordCount: 350,
      scheduledAt: at.toISOString(),
    });
    // A different time still has to respect the minimum lead.
    expect(
      await scheduleChapter(db, s.author, s.publicId, 1, {
        baseUpdatedAt: edited,
        scheduledAt: new Date(at.getTime() + 60_000),
        now: almost,
      }),
    ).toEqual({ ok: false, error: 'INVALID_SCHEDULE_TIME' });
  });

  it('refuses already published chapters and unschedules back to a draft', async () => {
    const s = await setup();
    const base = await chapterWithDraft(s, wordsDoc(300));
    const scheduledAt = new Date(Date.now() + DAY);
    await scheduleChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base, scheduledAt });
    const back = await unscheduleChapter(db, s.author, s.publicId, 1);
    expect(back.ok && back.value).toMatchObject({ status: 'draft', scheduledAt: null });
    expect(await unscheduleChapter(db, s.author, s.publicId, 1)).toEqual({
      ok: false,
      error: 'NOT_SCHEDULED',
    });

    await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
    expect(
      await scheduleChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base, scheduledAt }),
    ).toEqual({ ok: false, error: 'ALREADY_PUBLISHED' });
  });

  it('skips soft-deleted chapters and waits for banned authors', async () => {
    const s = await setup();
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      const base = await chapterWithDraft(s, wordsDoc(300));
      await scheduleChapter(db, s.author, s.publicId, i + 1, {
        baseUpdatedAt: base,
        scheduledAt: new Date(now.getTime() + HOUR),
        now,
      });
    }
    await deleteChapter(db, s.author, s.publicId, 2);
    await db.update(users).set({ status: 'banned' });
    const later = new Date(now.getTime() + DAY);
    expect(await publishDueChapters(db, { now: later })).toEqual({ published: 0 });
    expect((await chapterRow(1)).status).toBe('scheduled');

    await db.update(users).set({ status: 'active' });
    expect(await publishDueChapters(db, { now: later })).toEqual({ published: 1 });
    expect((await chapterRow(2)).status).toBe('scheduled');
  });

  it('publishes each due chapter once when sweeps run concurrently', async () => {
    const s = await setup();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const base = await chapterWithDraft(s, wordsDoc(300, { seed: `c${i}-` }));
      await scheduleChapter(db, s.author, s.publicId, i + 1, {
        baseUpdatedAt: base,
        scheduledAt: new Date(now.getTime() + HOUR),
        now,
      });
    }
    const later = new Date(now.getTime() + DAY);
    const runs = await Promise.all([
      publishDueChapters(db, { now: later }),
      publishDueChapters(db, { now: later }),
    ]);
    expect(runs.reduce((sum, r) => sum + r.published, 0)).toBe(3);
    expect((await events()).filter((e) => e.entity === 'chapter')).toHaveLength(3);
    expect((await storyRow(s.publicId)).chapterCount).toBe(3);
  });
});

describe('counters and deletion', () => {
  it('keeps counters right under concurrent publishes and soft deletes', async () => {
    const s = await setup();
    const bases = [
      await chapterWithDraft(s, wordsDoc(300)),
      await chapterWithDraft(s, wordsDoc(500)),
    ];
    const results = await Promise.all(
      bases.map((base, i) =>
        publishChapter(db, s.author, s.publicId, i + 1, { baseUpdatedAt: base }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await storyRow(s.publicId)).toMatchObject({ chapterCount: 2, wordCount: 800 });

    expect(await deleteChapter(db, s.author, s.publicId, 2)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await storyRow(s.publicId)).toMatchObject({ chapterCount: 1, wordCount: 300 });
    expect((await events()).at(-1)).toMatchObject({
      entity: 'chapter',
      action: 'deleted',
      chapterNumber: 2,
    });
    expect(await deleteChapter(db, s.author, s.publicId, 2)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const next = await createChapter(db, s.author, s.publicId);
    expect(next.ok && next.value.number).toBe(3);

    const other = await makeUser('other');
    expect(await deleteChapter(db, other, s.publicId, 1)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('deleting a draft chapter records no event', async () => {
    const s = await setup();
    await chapterWithDraft(s, wordsDoc(10));
    await deleteChapter(db, s.author, s.publicId, 1);
    expect(await events()).toEqual([]);
    expect((await chapterRow(1)).deletedAt).not.toBeNull();
  });
});

describe('outbox from story and chapter edits', () => {
  it('records story and chapter metadata changes only once they are public', async () => {
    const s = await setup();
    await updateStory(db, s.author, s.publicId, { title: 'Tên Mới' });
    const base = await chapterWithDraft(s, wordsDoc(300));
    await updateChapterMeta(db, s.author, s.publicId, 1, { title: 'Nháp' });
    expect(await events()).toEqual([]);

    await publishChapter(db, s.author, s.publicId, 1, { baseUpdatedAt: base });
    await db.delete(contentEvents);
    const renamed = await updateStory(db, s.author, s.publicId, { title: 'Tên Khác' });
    expect(renamed.ok && renamed.value.previousSlug).toBe('ten-moi');
    await updateStory(db, s.author, s.publicId, { synopsis: 'Giới thiệu' });
    await updateChapterMeta(db, s.author, s.publicId, 1, { authorNote: 'Cảm ơn' });
    await removeStoryCover({ db }, s.author, s.publicId);
    const recorded = await events();
    expect(recorded).toEqual([
      expect.objectContaining({ entity: 'story', action: 'updated', previousSlug: 'ten-moi' }),
      expect.not.objectContaining({ previousSlug: expect.anything() as unknown }),
      expect.objectContaining({ entity: 'chapter', action: 'updated', chapterNumber: 1 }),
      expect.objectContaining({ entity: 'story', action: 'updated' }),
    ]);
  });
});
