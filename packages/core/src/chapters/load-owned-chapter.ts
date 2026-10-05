import { type Db, type StoryRow, type Tx, chapters } from '@novel-hub/db';
import { and, eq, isNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { type StoryActor, canEditChapter } from '../policies/story';
import { type OwnedStoryError, loadOwnedStory } from '../stories/load-owned-story';
import type { ChapterRow } from './chapter-view';

/**
 * Loads a chapter the actor may edit. Soft-deleted chapters are not found. `forUpdate` locks the
 * story then the chapter (always in that order) until the surrounding transaction ends.
 */
export async function loadOwnedChapter(
  db: Db | Tx,
  actor: StoryActor,
  publicId: string,
  number: number,
  opts: { forUpdate?: boolean } = {},
): Promise<Result<{ story: StoryRow; chapter: ChapterRow }, OwnedStoryError>> {
  const story = await loadOwnedStory(db, actor, publicId, { ...opts, policy: canEditChapter });
  if (!story.ok) return err(story.error);
  const query = db
    .select()
    .from(chapters)
    .where(
      and(
        eq(chapters.storyId, story.value.id),
        eq(chapters.number, number),
        isNull(chapters.deletedAt),
      ),
    );
  const [chapter] = opts.forUpdate ? await query.for('update') : await query;
  if (!chapter) return err('NOT_FOUND');
  return ok({ story: story.value, chapter });
}
