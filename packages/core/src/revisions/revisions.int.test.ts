import { chapterContents, chapterDrafts, chapterRevisions, chapters, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { desc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createChapter } from '../chapters/create-chapter';
import { getDraft, saveDraft } from '../chapters/drafts';
import type { StoryActor } from '../policies/story';
import { deleteChapter } from '../publishing/delete-chapter';
import { publishChapter } from '../publishing/publish-chapter';
import { createStory } from '../stories/create-story';
import { getRevisionPreview, listRevisions, restoreRevision } from './revisions';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

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

/** Two paragraphs with fixed pids, 160 words each. */
function twoParagraphs(seed: string) {
  const text = (part: string) =>
    Array.from({ length: 160 }, (_, i) => `${seed}${part}${i}`).join(' ');
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { pid: 'aaaa2222' },
        content: [{ type: 'text', text: text('a') }],
      },
      {
        type: 'paragraph',
        attrs: { pid: 'bbbb3333' },
        content: [{ type: 'text', text: text('b') }],
      },
    ],
  };
}

interface Setup {
  author: StoryActor;
  publicId: string;
  chapterId: string;
  /** Latest draft version. */
  base: string;
}

async function setup(): Promise<Setup> {
  const author = await makeUser('author');
  const story = await createStory(db, author, {
    title: 'Kiếm Đạo Độc Tôn',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!story.ok) throw new Error(story.error);
  const created = await createChapter(db, author, story.value.publicId);
  if (!created.ok) throw new Error(created.error);
  const [chapter] = await db.select({ id: chapters.id }).from(chapters);
  if (!chapter) throw new Error('chapter missing');
  return {
    author,
    publicId: story.value.publicId,
    chapterId: chapter.id,
    base: created.value.draftUpdatedAt ?? '',
  };
}

/** Saves `doc` as the draft and publishes it; returns the setup with the new draft version. */
async function publishDoc(s: Setup, doc: object): Promise<Setup> {
  const saved = await saveDraft(db, s.author, s.publicId, 1, { doc, baseUpdatedAt: s.base });
  if (!saved.ok) throw new Error(saved.error);
  const published = await publishChapter(db, s.author, s.publicId, 1, {
    baseUpdatedAt: saved.value.updatedAt,
  });
  if (!published.ok) throw new Error(published.error);
  return { ...s, base: published.value.draftUpdatedAt };
}

async function draftDoc(chapterId: string) {
  const [row] = await db
    .select({ doc: chapterDrafts.docJson })
    .from(chapterDrafts)
    .where(eq(chapterDrafts.chapterId, chapterId));
  return row?.doc;
}

describe('listRevisions', () => {
  it('lists published revisions newest first and marks the live one', async () => {
    let s = await setup();
    expect(await listRevisions(db, s.author, s.publicId, 1)).toEqual({ ok: true, value: [] });

    s = await publishDoc(s, twoParagraphs('một'));
    s = await publishDoc(s, twoParagraphs('hai'));
    s = await publishDoc(s, twoParagraphs('ba'));
    const result = await listRevisions(db, s.author, s.publicId, 1);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toHaveLength(3);
    expect(result.value.map((r) => r.isPublished)).toEqual([true, false, false]);
    expect(result.value.every((r) => r.wordCount === 320)).toBe(true);
    const times = result.value.map((r) => Number(r.key));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(result.value[0]?.createdAt).toBe(new Date(times[0] ?? 0).toISOString());

    const newest = result.value[0];
    if (!newest) throw new Error('missing revision');
    const preview = await getRevisionPreview(db, s.author, s.publicId, 1, newest.key);
    expect(preview.ok && preview.value.html).toContain('ba');
    const oldest = result.value[2];
    if (!oldest) throw new Error('missing revision');
    const old = await getRevisionPreview(db, s.author, s.publicId, 1, oldest.key);
    expect(old.ok && old.value.html).toMatch(/^<p data-pid="aaaa2222">mộta0 /);
  });

  it('caps the list at the number of kept revisions', async () => {
    const s = await setup();
    const start = Date.now() - 3_600_000;
    await db.insert(chapterRevisions).values(
      Array.from({ length: 25 }, (_, i) => ({
        chapterId: s.chapterId,
        docJson: twoParagraphs(`r${i}`),
        wordCount: i,
        createdAt: new Date(start + i * 1000),
      })),
    );
    const result = await listRevisions(db, s.author, s.publicId, 1);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toHaveLength(20);
    expect(result.value[0]?.wordCount).toBe(24);
    expect(result.value.every((r) => !r.isPublished)).toBe(true);
  });
});

describe('revision keys', () => {
  it('finds a revision whose timestamp has microseconds from its millisecond key', async () => {
    const s = await setup();
    await db.insert(chapterRevisions).values([
      {
        chapterId: s.chapterId,
        docJson: twoParagraphs('cũ'),
        wordCount: 1,
        createdAt: sql`'2026-10-05T01:02:03.456789Z'::timestamptz`,
      },
      {
        chapterId: s.chapterId,
        docJson: twoParagraphs('mới'),
        wordCount: 2,
        createdAt: sql`'2026-10-05T01:02:03.457001Z'::timestamptz`,
      },
    ]);
    const list = await listRevisions(db, s.author, s.publicId, 1);
    if (!list.ok) throw new Error(list.error);
    expect(list.value.map((r) => r.key)).toEqual(['1791162123457', '1791162123456']);

    const preview = await getRevisionPreview(db, s.author, s.publicId, 1, '1791162123456');
    expect(preview.ok && preview.value).toMatchObject({ key: '1791162123456', wordCount: 1 });
    expect(await getRevisionPreview(db, s.author, s.publicId, 1, '1791162123455')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });
});

describe('restoreRevision', () => {
  it('writes the revision into the draft with its pids and leaves the published content alone', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    s = await publishDoc(s, twoParagraphs('mới'));
    const [before] = await db.select().from(chapterContents);
    const list = await listRevisions(db, s.author, s.publicId, 1);
    if (!list.ok) throw new Error(list.error);
    const old = list.value[1];
    if (!old) throw new Error('missing revision');

    const restored = await restoreRevision(db, s.author, s.publicId, 1, old.key, s.base);
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.value.updatedAt > s.base).toBe(true);
    expect(restored.value.hasUnpublishedChanges).toBe(true);
    expect(restored.value.doc).toEqual(twoParagraphs('cũ'));
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('cũ'));

    const [after] = await db.select().from(chapterContents);
    expect(after).toEqual(before);
    expect((await db.select().from(chapterRevisions)).length).toBe(2);
    const [chapter] = await db.select({ status: chapters.status }).from(chapters);
    expect(chapter?.status).toBe('published');
    const draft = await getDraft(db, s.author, s.publicId, 1);
    expect(draft.ok && draft.value).toMatchObject({
      updatedAt: restored.value.updatedAt,
      hasUnpublishedChanges: true,
    });

    // Restoring the live version brings the draft back to what readers see.
    const live = list.value[0];
    if (!live) throw new Error('missing revision');
    const back = await restoreRevision(
      db,
      s.author,
      s.publicId,
      1,
      live.key,
      restored.value.updatedAt,
    );
    expect(back.ok && back.value.hasUnpublishedChanges).toBe(false);
  });

  it('refuses a stale draft version and changes nothing', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    const stale = s.base;
    const saved = await saveDraft(db, s.author, s.publicId, 1, {
      doc: twoParagraphs('đang gõ'),
      baseUpdatedAt: s.base,
    });
    if (!saved.ok) throw new Error(saved.error);
    const list = await listRevisions(db, s.author, s.publicId, 1);
    const key = list.ok ? list.value[0]?.key : undefined;
    if (!key) throw new Error('missing revision');

    expect(await restoreRevision(db, s.author, s.publicId, 1, key, stale)).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('đang gõ'));
  });

  it('guards ownership, soft deletion and unknown keys in every function', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    const list = await listRevisions(db, s.author, s.publicId, 1);
    const key = list.ok ? list.value[0]?.key : undefined;
    if (!key) throw new Error('missing revision');
    const other = await makeUser('other');

    const forbidden = { ok: false, error: 'FORBIDDEN' };
    expect(await listRevisions(db, other, s.publicId, 1)).toEqual(forbidden);
    expect(await getRevisionPreview(db, other, s.publicId, 1, key)).toEqual(forbidden);
    expect(await restoreRevision(db, other, s.publicId, 1, key, s.base)).toEqual(forbidden);

    const missing = { ok: false, error: 'NOT_FOUND' };
    expect(await getRevisionPreview(db, s.author, s.publicId, 1, '1')).toEqual(missing);
    expect(await restoreRevision(db, s.author, s.publicId, 1, '1', s.base)).toEqual(missing);
    expect(await listRevisions(db, s.author, s.publicId, 2)).toEqual(missing);

    const deleted = await deleteChapter(db, s.author, s.publicId, 1);
    expect(deleted.ok).toBe(true);
    expect(await listRevisions(db, s.author, s.publicId, 1)).toEqual(missing);
    expect(await getRevisionPreview(db, s.author, s.publicId, 1, key)).toEqual(missing);
    expect(await restoreRevision(db, s.author, s.publicId, 1, key, s.base)).toEqual(missing);
  });

  it('restores into the draft of a chapter hidden by a moderator', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    s = await publishDoc(s, twoParagraphs('mới'));
    await db.update(chapters).set({ status: 'hidden_by_mod' });
    const list = await listRevisions(db, s.author, s.publicId, 1);
    if (!list.ok) throw new Error(list.error);
    expect(list.value.map((r) => r.isPublished)).toEqual([false, false]);
    const old = list.value[1];
    if (!old) throw new Error('missing revision');
    const restored = await restoreRevision(db, s.author, s.publicId, 1, old.key, s.base);
    expect(restored.ok).toBe(true);
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('cũ'));
  });

  it('keeps a draft that differs from the newest revision as a revision before replacing it', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    s = await publishDoc(s, twoParagraphs('mới'));
    const saved = await saveDraft(db, s.author, s.publicId, 1, {
      doc: twoParagraphs('đang gõ'),
      baseUpdatedAt: s.base,
    });
    if (!saved.ok) throw new Error(saved.error);
    const before = await listRevisions(db, s.author, s.publicId, 1);
    const old = before.ok ? before.value[1] : undefined;
    if (!old) throw new Error('missing revision');

    const restored = await restoreRevision(
      db,
      s.author,
      s.publicId,
      1,
      old.key,
      saved.value.updatedAt,
    );
    if (!restored.ok) throw new Error(restored.error);
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('cũ'));

    const after = await listRevisions(db, s.author, s.publicId, 1);
    if (!after.ok) throw new Error(after.error);
    expect(after.value).toHaveLength(3);
    // The snapshot is the newest revision; the published one keeps its marker below it.
    expect(after.value.map((r) => r.isPublished)).toEqual([false, true, false]);
    const snapshot = after.value[0];
    if (!snapshot) throw new Error('missing snapshot');
    // "đang gõ" is two words per generated token.
    expect(snapshot.wordCount).toBe(640);
    expect(Number(snapshot.key)).toBeGreaterThan(Number(after.value[1]?.key));
    const [row] = await db
      .select({ doc: chapterRevisions.docJson })
      .from(chapterRevisions)
      .orderBy(desc(chapterRevisions.createdAt))
      .limit(1);
    expect(row?.doc).toEqual(twoParagraphs('đang gõ'));
  });

  it('does not snapshot a draft equal to the newest revision', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    s = await publishDoc(s, twoParagraphs('mới'));
    // Same content with keys in another order is still the same document.
    const reordered = {
      content: twoParagraphs('mới').content.map((p) => ({
        content: p.content,
        attrs: p.attrs,
        type: p.type,
      })),
      type: 'doc',
    };
    const saved = await saveDraft(db, s.author, s.publicId, 1, {
      doc: reordered,
      baseUpdatedAt: s.base,
    });
    if (!saved.ok) throw new Error(saved.error);
    const list = await listRevisions(db, s.author, s.publicId, 1);
    const old = list.ok ? list.value[1] : undefined;
    if (!old) throw new Error('missing revision');

    const restored = await restoreRevision(
      db,
      s.author,
      s.publicId,
      1,
      old.key,
      saved.value.updatedAt,
    );
    expect(restored.ok).toBe(true);
    expect((await db.select().from(chapterRevisions)).length).toBe(2);
  });

  it('keeps the revision cap when the snapshot is added', async () => {
    const s = await setup();
    const start = Date.now() - 3_600_000;
    await db.insert(chapterRevisions).values(
      Array.from({ length: 20 }, (_, i) => ({
        chapterId: s.chapterId,
        docJson: twoParagraphs(`r${i}`),
        wordCount: i,
        createdAt: new Date(start + i * 1000),
      })),
    );
    const saved = await saveDraft(db, s.author, s.publicId, 1, {
      doc: twoParagraphs('đang gõ'),
      baseUpdatedAt: s.base,
    });
    if (!saved.ok) throw new Error(saved.error);

    const restored = await restoreRevision(
      db,
      s.author,
      s.publicId,
      1,
      String(start + 5000),
      saved.value.updatedAt,
    );
    if (!restored.ok) throw new Error(restored.error);
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('r5'));
    const rows = await db
      .select({ wordCount: chapterRevisions.wordCount })
      .from(chapterRevisions)
      .orderBy(desc(chapterRevisions.createdAt));
    expect(rows).toHaveLength(20);
    // Snapshot first, then r19…r1: the oldest (r0) was cut.
    expect(rows.map((r) => r.wordCount)).toEqual([
      640,
      ...Array.from({ length: 19 }, (_, i) => 19 - i),
    ]);
  });

  it('leaves no snapshot behind when the restore is refused for a stale version', async () => {
    let s = await setup();
    s = await publishDoc(s, twoParagraphs('cũ'));
    const stale = s.base;
    const first = await saveDraft(db, s.author, s.publicId, 1, {
      doc: twoParagraphs('tab một'),
      baseUpdatedAt: s.base,
    });
    if (!first.ok) throw new Error(first.error);
    const list = await listRevisions(db, s.author, s.publicId, 1);
    const key = list.ok ? list.value[0]?.key : undefined;
    if (!key) throw new Error('missing revision');

    expect(await restoreRevision(db, s.author, s.publicId, 1, key, stale)).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    expect((await db.select().from(chapterRevisions)).length).toBe(1);
    expect(await draftDoc(s.chapterId)).toEqual(twoParagraphs('tab một'));
  });
});
