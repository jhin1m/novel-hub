import { type Db, chapterDrafts, chapters } from '@novel-hub/db';
import type { ChapterMetaInput } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import type { OwnedStoryError } from '../stories/load-owned-story';
import { type AuthorChapterView, toAuthorChapterView } from './chapter-view';
import { draftVersion } from './draft-version';
import { loadOwnedChapter } from './load-owned-chapter';

/**
 * Title and author note: plain text, already trimmed and NFC-normalized by the shared schema. Both
 * show on the reading page, so editing a published chapter records an outbox event. A chapter
 * hidden by a moderator keeps its metadata frozen.
 */
export async function updateChapterMeta(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  input: ChapterMetaInput,
): Promise<Result<AuthorChapterView, OwnedStoryError | 'CHAPTER_HIDDEN_BY_MOD'>> {
  return db.transaction(async (tx) => {
    const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
    if (!owned.ok) return err(owned.error);
    const { story, chapter } = owned.value;
    if (chapter.status === 'hidden_by_mod') return err('CHAPTER_HIDDEN_BY_MOD');
    const [row] = await tx
      .update(chapters)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.authorNote !== undefined ? { authorNote: input.authorNote } : {}),
      })
      .where(eq(chapters.id, chapter.id))
      .returning();
    if (!row) return err('NOT_FOUND');
    if (row.status === 'published') {
      await recordContentChanges(tx, [
        {
          entity: 'chapter',
          action: 'updated',
          storyId: story.id,
          chapterId: row.id,
          chapterNumber: row.number,
        },
      ]);
    }
    const [draft] = await tx
      .select({ updatedAt: draftVersion })
      .from(chapterDrafts)
      .where(eq(chapterDrafts.chapterId, chapter.id));
    return ok(toAuthorChapterView(row, draft?.updatedAt ?? null));
  });
}
