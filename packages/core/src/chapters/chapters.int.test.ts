import { chapterDrafts, chapters, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { StoryActor } from '../policies/story';
import { createStory } from '../stories/create-story';
import { updateChapterMeta } from './chapter-meta';
import { createChapter } from './create-chapter';
import { getDraft, saveDraft } from './drafts';
import { listAuthorChapters } from './list-chapters';

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

async function newChapter(actor: StoryActor, publicId: string) {
  const result = await createChapter(db, actor, publicId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { pid: 'k7m2xq9p' }, content: [{ type: 'text', text }] }],
});

describe('createChapter', () => {
  it('numbers chapters in order and never reuses a soft-deleted number', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    expect((await newChapter(author, publicId)).number).toBe(1);
    expect((await newChapter(author, publicId)).number).toBe(2);
    await db.execute(sql`update chapters set deleted_at = now() where number = 2`);
    const third = await newChapter(author, publicId);
    expect(third).toMatchObject({ number: 3, status: 'draft', title: null, wordCount: 0 });
    expect(third.draftUpdatedAt).not.toBeNull();
  });

  it('gives distinct numbers to concurrent creates', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    const created = await Promise.all(
      Array.from({ length: 5 }, () => createChapter(db, author, publicId)),
    );
    const numbers = created.map((r) => (r.ok ? r.value.number : 0)).sort();
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('creates an empty draft and refuses other users', async () => {
    const author = await makeUser('author');
    const other = await makeUser('other');
    const publicId = await makeStory(author);
    await newChapter(author, publicId);
    const draft = await getDraft(db, author, publicId, 1);
    expect(draft.ok && draft.value.doc.content?.[0]?.type).toBe('paragraph');
    expect(await createChapter(db, other, publicId)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await createChapter(db, author, 'k7m2xq9p')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('saveDraft', () => {
  it('saves on the current version and reports a conflict on a stale one', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    const chapter = await newChapter(author, publicId);
    const base = chapter.draftUpdatedAt ?? '';

    const saved = await saveDraft(db, author, publicId, 1, {
      doc: doc('Một'),
      baseUpdatedAt: base,
    });
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.updatedAt > base).toBe(true);

    expect(
      await saveDraft(db, author, publicId, 1, { doc: doc('Hai'), baseUpdatedAt: base }),
    ).toEqual({
      ok: false,
      error: 'DRAFT_CONFLICT',
    });
    const current = await getDraft(db, author, publicId, 1);
    expect(current.ok && current.value).toMatchObject({
      updatedAt: saved.value.updatedAt,
      doc: doc('Một'),
    });
  });

  it('accepts the version read back from a draft stored with microseconds', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    await newChapter(author, publicId);
    // Same as rows written by `defaultNow()` (the seed): microsecond precision.
    await db.execute(sql`update chapter_drafts set updated_at = '2026-10-05 04:05:06.123456+00'`);
    const [raw] = await db
      .select({ at: sql<string>`${chapterDrafts.updatedAt}::text` })
      .from(chapterDrafts);
    expect(raw?.at).toContain('.123456');

    const draft = await getDraft(db, author, publicId, 1);
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.value.updatedAt).toBe('2026-10-05T04:05:06.123Z');
    const saved = await saveDraft(db, author, publicId, 1, {
      doc: doc('Lưu'),
      baseUpdatedAt: draft.value.updatedAt,
    });
    expect(saved.ok).toBe(true);
  });

  it('refuses other users, deleted chapters and invalid documents', async () => {
    const author = await makeUser('author');
    const other = await makeUser('other');
    const publicId = await makeStory(author);
    const chapter = await newChapter(author, publicId);
    const baseUpdatedAt = chapter.draftUpdatedAt ?? '';

    expect(await saveDraft(db, other, publicId, 1, { doc: doc('x'), baseUpdatedAt })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    const bad = { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] };
    expect(await saveDraft(db, author, publicId, 1, { doc: bad, baseUpdatedAt })).toEqual({
      ok: false,
      error: 'INVALID_DOCUMENT',
    });
    await db.update(chapters).set({ deletedAt: new Date() });
    expect(await saveDraft(db, author, publicId, 1, { doc: doc('x'), baseUpdatedAt })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await getDraft(db, author, publicId, 1)).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('getDraft', () => {
  it('seeds a missing draft from the published content', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    const chapter = await newChapter(author, publicId);
    const [row] = await db.select({ id: chapters.id }).from(chapters);
    await db.delete(chapterDrafts);
    await db.execute(sql`insert into chapter_contents (chapter_id, doc_json, html, paragraph_ids, content_hash)
      values (${row?.id}, ${JSON.stringify(doc('Đã đăng'))}::jsonb, '<p>x</p>', '{}', 'h')`);
    const draft = await getDraft(db, author, publicId, chapter.number);
    expect(draft.ok && draft.value.doc).toEqual(doc('Đã đăng'));
  });
});

describe('updateChapterMeta and listAuthorChapters', () => {
  it('updates only the sent fields and lists non-deleted chapters in order', async () => {
    const author = await makeUser('author');
    const publicId = await makeStory(author);
    await newChapter(author, publicId);
    await newChapter(author, publicId);
    await newChapter(author, publicId);

    const updated = await updateChapterMeta(db, author, publicId, 1, { title: 'Mở đầu' });
    expect(updated.ok && updated.value).toMatchObject({ title: 'Mở đầu', authorNote: null });
    await updateChapterMeta(db, author, publicId, 1, { authorNote: 'Cảm ơn' });
    const cleared = await updateChapterMeta(db, author, publicId, 1, { title: null });
    expect(cleared.ok && cleared.value).toMatchObject({ title: null, authorNote: 'Cảm ơn' });

    await db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.number, 2));
    const list = await listAuthorChapters(db, author, publicId);
    expect(list.ok && list.value.map((c) => c.number)).toEqual([1, 3]);
    const other = await makeUser('other');
    expect(await listAuthorChapters(db, other, publicId)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await updateChapterMeta(db, other, publicId, 1, { title: 'x' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});
