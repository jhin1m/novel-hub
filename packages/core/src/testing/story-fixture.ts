/**
 * Integration-test fixtures: an author, a story and published chapters created through `core`, so
 * the rows look exactly like real ones. Test files only.
 */
import { type Db, stories, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { createChapter } from '../chapters/create-chapter';
import { saveDraft } from '../chapters/drafts';
import type { StoryActor } from '../policies/story';
import { publishChapter } from '../publishing/publish-chapter';
import { createStory } from '../stories/create-story';

export async function makeAuthor(db: Db, username = 'author'): Promise<StoryActor> {
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

/** A story with `published` published chapters; returns its public id, internal id and slug. */
export async function makePublishedStory(
  db: Db,
  author: StoryActor,
  published: number,
  title = 'Kiếm Đạo Độc Tôn',
): Promise<{ publicId: string; storyId: string; slug: string }> {
  const created = await createStory(db, author, {
    title,
    synopsis: '',
    mainTag: 'tien-hiep',
    tags: [],
    isMature: false,
    isAiAssisted: false,
  });
  if (!created.ok) throw new Error(created.error);
  const { publicId } = created.value;
  for (let i = 0; i < published; i++) await addChapter(db, author, publicId);
  const [row] = await db.select().from(stories).where(eq(stories.publicId, publicId));
  if (!row) throw new Error('story missing');
  return { publicId, storyId: row.id, slug: row.slug };
}

/** Creates the next chapter (320 words) and publishes it unless `draft`. Returns its number. */
export async function addChapter(
  db: Db,
  author: StoryActor,
  publicId: string,
  draft = false,
): Promise<number> {
  const created = await createChapter(db, author, publicId);
  if (!created.ok) throw new Error(created.error);
  const { number, draftUpdatedAt } = created.value;
  const text = Array.from({ length: 320 }, (_, i) => `chữ${i}`).join(' ');
  const saved = await saveDraft(db, author, publicId, number, {
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
    },
    baseUpdatedAt: draftUpdatedAt ?? '',
  });
  if (!saved.ok) throw new Error(saved.error);
  if (!draft) {
    const done = await publishChapter(db, author, publicId, number, {
      baseUpdatedAt: saved.value.updatedAt,
    });
    if (!done.ok) throw new Error(done.error);
  }
  return number;
}
