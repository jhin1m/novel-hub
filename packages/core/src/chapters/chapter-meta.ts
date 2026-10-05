import { type Db, chapterDrafts, chapters } from '@novel-hub/db';
import type { ChapterMetaInput } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import type { OwnedStoryError } from '../stories/load-owned-story';
import { type AuthorChapterView, toAuthorChapterView } from './chapter-view';
import { draftVersion } from './draft-version';
import { loadOwnedChapter } from './load-owned-chapter';

/** Title and author note: plain text, already trimmed and NFC-normalized by the shared schema. */
export async function updateChapterMeta(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  input: ChapterMetaInput,
): Promise<Result<AuthorChapterView, OwnedStoryError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);
  const { chapter } = owned.value;

  const [row] = await db
    .update(chapters)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.authorNote !== undefined ? { authorNote: input.authorNote } : {}),
    })
    .where(eq(chapters.id, chapter.id))
    .returning();
  if (!row) return err('NOT_FOUND');
  const [draft] = await db
    .select({ updatedAt: draftVersion })
    .from(chapterDrafts)
    .where(eq(chapterDrafts.chapterId, chapter.id));
  return ok(toAuthorChapterView(row, draft?.updatedAt ?? null));
}
