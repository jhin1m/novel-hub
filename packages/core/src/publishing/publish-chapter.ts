import { type Db, type StoryRow, type Tx, chapters, stories } from '@novel-hub/db';
import type { EditorDocJson, StoryVisibility } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import {
  type AuthorChapterView,
  type ChapterRow,
  toAuthorChapterView,
} from '../chapters/chapter-view';
import { loadOwnedChapter } from '../chapters/load-owned-chapter';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { chapterPublishChanges } from './changes';
import { recomputeStoryCounters } from './counters';
import {
  DraftConflictError,
  type RenderDraftError,
  lockAndRenderDraft,
  writeChapterContent,
} from './write-content';

export type PublishError = 'NOT_FOUND' | 'FORBIDDEN' | RenderDraftError | 'CHAPTER_HIDDEN_BY_MOD';

export interface PublishResult {
  chapter: AuthorChapterView;
  /** Draft version the editor continues from (new when pids were rewritten). */
  draftUpdatedAt: string;
  /** The rewritten draft the editor must load; `null` when the editor already has it. */
  normalizedDoc: EditorDocJson | null;
  /** Republishing identical content: nothing was written. */
  unchanged: boolean;
  storyVisibility: StoryVisibility;
}

/** `baseUpdatedAt` as a date; anything unparseable can only be a stale or forged version. */
export function parseDraftBase(value: string): Date | null {
  const base = new Date(value);
  return Number.isNaN(base.getTime()) ? null : base;
}

/**
 * Makes a locked chapter public (or records an update to a public one): chapter row, story
 * counters, the story's own `draft → published` move, and the outbox events, all in the caller's
 * transaction. A story hidden by a moderator stays hidden.
 */
export async function markChapterPublished(
  tx: Db | Tx,
  story: StoryRow,
  chapter: ChapterRow,
  opts: { now: Date; contentHash: string; wordCount: number },
): Promise<{ chapter: ChapterRow; storyVisibility: StoryVisibility }> {
  const firstPublish = chapter.status !== 'published';
  const [row] = await tx
    .update(chapters)
    .set({
      status: 'published',
      publishedAt: chapter.publishedAt ?? opts.now,
      scheduledAt: null,
      wordCount: opts.wordCount,
    })
    .where(eq(chapters.id, chapter.id))
    .returning();
  if (!row) throw new Error('Chapter disappeared while publishing');
  await recomputeStoryCounters(tx, story.id);

  const storyPublished = story.visibility === 'draft';
  if (storyPublished) {
    await tx.update(stories).set({ visibility: 'published' }).where(eq(stories.id, story.id));
  }
  await recordContentChanges(
    tx,
    chapterPublishChanges(
      { storyId: story.id, chapterId: chapter.id, chapterNumber: chapter.number },
      { firstPublish, contentHash: opts.contentHash, storyPublished },
    ),
  );
  return { chapter: row, storyVisibility: storyPublished ? 'published' : story.visibility };
}

/**
 * Publishes the stored draft now: a draft or scheduled chapter goes public, a published one gets
 * its content updated (number and first publish date kept). The whole thing is one transaction
 * holding story → chapter → draft locks; any failure leaves no trace, outbox included.
 */
export async function publishChapter(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  input: { baseUpdatedAt: string; now?: Date },
): Promise<Result<PublishResult, PublishError>> {
  const base = parseDraftBase(input.baseUpdatedAt);
  if (!base) return err('DRAFT_CONFLICT');
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
      if (!owned.ok) return err(owned.error);
      const { story, chapter } = owned.value;
      if (chapter.status === 'hidden_by_mod') return err('CHAPTER_HIDDEN_BY_MOD');

      const content = await lockAndRenderDraft(tx, chapter.id, base);
      if (!content.ok) return err(content.error);
      const written = await writeChapterContent(tx, chapter.id, base, content.value, now);

      if (chapter.status === 'published' && !written.changed) {
        return ok({
          chapter: toAuthorChapterView(chapter, base),
          draftUpdatedAt: base.toISOString(),
          normalizedDoc: null,
          unchanged: true,
          storyVisibility: story.visibility,
        });
      }
      const published = await markChapterPublished(tx, story, chapter, {
        now,
        contentHash: content.value.contentHash,
        wordCount: content.value.wordCount,
      });
      return ok({
        chapter: toAuthorChapterView(published.chapter, written.draftUpdatedAt),
        draftUpdatedAt: written.draftUpdatedAt.toISOString(),
        normalizedDoc: written.normalizedDoc,
        unchanged: false,
        storyVisibility: published.storyVisibility,
      });
    });
  } catch (error) {
    if (error instanceof DraftConflictError) return err('DRAFT_CONFLICT');
    throw error;
  }
}
