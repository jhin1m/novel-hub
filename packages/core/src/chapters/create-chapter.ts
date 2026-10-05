import { type Db, chapterDrafts, chapters } from '@novel-hub/db';
import { emptyDraftDoc } from '@novel-hub/shared/editor';
import { eq, max } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { type StoryActor, canEditChapter } from '../policies/story';
import { type OwnedStoryError, loadOwnedStory } from '../stories/load-owned-story';
import { type AuthorChapterView, toAuthorChapterView } from './chapter-view';

const NUMBER_ATTEMPTS = 2;

/**
 * Creates the next chapter as an empty draft. Numbers count soft-deleted chapters too, so a number
 * is never reused. The story row lock serializes concurrent creates; the conflict guard on
 * `(story_id, number)` is a second line of defence that retries once.
 */
export async function createChapter(
  db: Db,
  actor: StoryActor,
  publicId: string,
): Promise<Result<AuthorChapterView, OwnedStoryError>> {
  return db.transaction(async (tx) => {
    const story = await loadOwnedStory(tx, actor, publicId, {
      forUpdate: true,
      policy: canEditChapter,
    });
    if (!story.ok) return err(story.error);

    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
      const [last] = await tx
        .select({ number: max(chapters.number) })
        .from(chapters)
        .where(eq(chapters.storyId, story.value.id));
      const [row] = await tx
        .insert(chapters)
        .values({ storyId: story.value.id, number: (last?.number ?? 0) + 1 })
        .onConflictDoNothing({ target: [chapters.storyId, chapters.number] })
        .returning();
      if (!row) continue;

      // Set by the app (milliseconds) so the version handed to the editor matches the stored one.
      const draftUpdatedAt = new Date();
      await tx
        .insert(chapterDrafts)
        .values({ chapterId: row.id, docJson: emptyDraftDoc(), updatedAt: draftUpdatedAt });
      return ok(toAuthorChapterView(row, draftUpdatedAt));
    }
    throw new Error('Could not allocate a chapter number');
  });
}
