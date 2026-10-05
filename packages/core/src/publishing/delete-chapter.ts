import { type Db, chapters } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { loadOwnedChapter } from '../chapters/load-owned-chapter';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { chapterDeleteChanges } from './changes';
import { recomputeStoryCounters } from './counters';

/**
 * Soft delete. The number stays taken (URLs depend on it), so the story shows a gap. Deleting a
 * public chapter updates the story counters and queues the purge of its page through the outbox.
 */
export async function deleteChapter(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  opts: { now?: Date } = {},
): Promise<Result<void, 'NOT_FOUND' | 'FORBIDDEN'>> {
  return db.transaction(async (tx) => {
    const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
    if (!owned.ok) return err(owned.error);
    const { story, chapter } = owned.value;
    await tx
      .update(chapters)
      .set({ deletedAt: opts.now ?? new Date() })
      .where(eq(chapters.id, chapter.id));
    if (chapter.status === 'published') {
      await recomputeStoryCounters(tx, story.id);
      await recordContentChanges(
        tx,
        chapterDeleteChanges({
          storyId: story.id,
          chapterId: chapter.id,
          chapterNumber: chapter.number,
        }),
      );
    }
    return ok(undefined);
  });
}
