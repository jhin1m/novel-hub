import { chapters, stories, storyTags, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createChapter } from '../chapters/create-chapter';
import { saveDraft } from '../chapters/drafts';
import type { StoryActor } from '../policies/story';
import { publishChapter } from '../publishing/publish-chapter';
import { createStory } from '../stories/create-story';
import { getChapterForReading, listReadableChapters } from './get-chapter-for-reading';
import { getChapterToc } from './toc';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function makeAuthor(username = 'author'): Promise<StoryActor> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: 'Lâm Phong',
      email: `${username}@example.com`,
      emailVerified: true,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return { id: row.id, role: row.role, status: row.status, emailVerified: row.emailVerified };
}

async function makeStory(
  author: StoryActor,
  opts: { isMature?: boolean; tags?: string[] } = {},
): Promise<string> {
  const result = await createStory(db, author, {
    title: 'Kiếm Đạo Độc Tôn',
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: opts.tags ?? [],
    isMature: opts.isMature ?? false,
    isAiAssisted: false,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.publicId;
}

function doc(words: number) {
  const text = Array.from({ length: words }, (_, i) => `chữ${i}`).join(' ');
  return {
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
  };
}

/** Creates the next chapter; publishes it unless `draft`. Returns its number. */
async function addChapter(author: StoryActor, publicId: string, draft = false): Promise<number> {
  const created = await createChapter(db, author, publicId);
  if (!created.ok) throw new Error(created.error);
  const { number, draftUpdatedAt } = created.value;
  const saved = await saveDraft(db, author, publicId, number, {
    doc: doc(320),
    baseUpdatedAt: draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  if (!draft) {
    const published = await publishChapter(db, author, publicId, number, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!published.ok) throw new Error(published.error);
  }
  return number;
}

async function storyId(publicId: string): Promise<string> {
  const [row] = await db.select().from(stories).where(eq(stories.publicId, publicId));
  if (!row) throw new Error('story missing');
  return row.id;
}

async function setChapter(
  publicId: string,
  number: number,
  values: Partial<typeof chapters.$inferInsert>,
) {
  await db
    .update(chapters)
    .set(values)
    .where(and(eq(chapters.storyId, await storyId(publicId)), eq(chapters.number, number)));
}

describe('getChapterForReading', () => {
  it('returns the published chapter with sanitized HTML and no internal ids', async () => {
    const author = await makeAuthor();
    const publicId = await makeStory(author);
    await addChapter(author, publicId);

    const page = await getChapterForReading(db, publicId, 1);
    expect(page).toMatchObject({
      story: {
        publicId,
        slug: 'kiem-dao-doc-ton',
        title: 'Kiếm Đạo Độc Tôn',
        isMature: false,
        authorUsername: 'author',
        authorDisplayName: 'Lâm Phong',
        warningTags: [],
      },
      chapter: { number: 1, title: null, authorNote: null, wordCount: 320 },
      prevNumber: null,
      nextNumber: null,
    });
    expect(page?.chapter.html).toMatch(/^<p data-pid="[a-z2-9]{8}">chữ0 /);
    expect(page?.chapter.publishedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(page)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('previous/next skip soft-deleted, unpublished and hidden chapters', async () => {
    const author = await makeAuthor();
    const publicId = await makeStory(author);
    for (let i = 0; i < 7; i += 1) await addChapter(author, publicId, i === 5);
    // 1 published, 2 deleted, 3 hidden, 4 published (reading), 5 scheduled, 6 draft, 7 published.
    await setChapter(publicId, 2, { deletedAt: new Date() });
    await setChapter(publicId, 3, { status: 'hidden_by_mod' });
    await setChapter(publicId, 5, {
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 3_600_000),
    });

    const page = await getChapterForReading(db, publicId, 4);
    expect(page?.prevNumber).toBe(1);
    expect(page?.nextNumber).toBe(7);
    for (const number of [2, 3, 5, 6, 8]) {
      expect(await getChapterForReading(db, publicId, number)).toBeNull();
    }
    expect(await getChapterToc(db, publicId)).toEqual([
      { number: 1, title: null },
      { number: 4, title: null },
      { number: 7, title: null },
    ]);
    expect((await listReadableChapters(db, await storyId(publicId))).map((c) => c.number)).toEqual([
      1, 4, 7,
    ]);
  });

  it('a hidden story or a banned author hides every chapter and the table of contents', async () => {
    const author = await makeAuthor();
    const publicId = await makeStory(author);
    await addChapter(author, publicId);
    expect(await getChapterForReading(db, publicId, 1)).not.toBeNull();

    await db.update(users).set({ status: 'banned' }).where(eq(users.id, author.id));
    expect(await getChapterForReading(db, publicId, 1)).toBeNull();
    expect(await getChapterToc(db, publicId)).toBeNull();

    await db.update(users).set({ status: 'active' }).where(eq(users.id, author.id));
    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.publicId, publicId));
    expect(await getChapterForReading(db, publicId, 1)).toBeNull();
    expect(await getChapterToc(db, publicId)).toBeNull();
  });

  it('unknown stories and chapters are null', async () => {
    expect(await getChapterForReading(db, 'k7m2xq9p', 1)).toBeNull();
    expect(await getChapterToc(db, 'k7m2xq9p')).toBeNull();
  });

  it('18+ stories list their warning tags, merged tags replaced by the canonical one', async () => {
    const author = await makeAuthor();
    const publicId = await makeStory(author, { isMature: true, tags: ['bao-luc'] });
    await addChapter(author, publicId);
    // A merged warning tag still linked to the story shows as its canonical tag, once.
    const [canonicalTag] = await db.select().from(tags).where(eq(tags.slug, 'noi-dung-18'));
    if (!canonicalTag) throw new Error('fixture tag missing');
    const [merged] = await db
      .insert(tags)
      .values({ slug: 'nsfw', name: 'NSFW', kind: 'warning', canonicalId: canonicalTag.id })
      .returning();
    if (!merged) throw new Error('tag insert failed');
    const id = await storyId(publicId);
    await db.insert(storyTags).values([
      { storyId: id, tagId: merged.id },
      { storyId: id, tagId: canonicalTag.id },
    ]);

    const page = await getChapterForReading(db, publicId, 1);
    expect(page?.story.isMature).toBe(true);
    expect(page?.story.warningTags).toEqual([
      { slug: 'bao-luc', name: 'Bạo lực' },
      { slug: 'noi-dung-18', name: 'Nội dung 18+' },
    ]);
  });
});
