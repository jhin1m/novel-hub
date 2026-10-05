import { type Db, chapterDrafts, chapters } from '@novel-hub/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { type StoryActor, canEditChapter } from '../policies/story';
import { type OwnedStoryError, loadOwnedStory } from '../stories/load-owned-story';
import { type AuthorChapterView, toAuthorChapterView } from './chapter-view';
import { draftVersion } from './draft-version';

/** Every chapter of a story the actor edits, soft-deleted ones excluded, in reading order. */
export async function listAuthorChapters(
  db: Db,
  actor: StoryActor,
  publicId: string,
): Promise<Result<AuthorChapterView[], OwnedStoryError>> {
  const story = await loadOwnedStory(db, actor, publicId, { policy: canEditChapter });
  if (!story.ok) return err(story.error);
  const rows = await db
    .select({ chapter: chapters, draftUpdatedAt: draftVersion })
    .from(chapters)
    .leftJoin(chapterDrafts, eq(chapterDrafts.chapterId, chapters.id))
    .where(and(eq(chapters.storyId, story.value.id), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.number));
  return ok(rows.map((r) => toAuthorChapterView(r.chapter, r.draftUpdatedAt)));
}
