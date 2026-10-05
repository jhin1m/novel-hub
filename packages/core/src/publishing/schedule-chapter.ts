import { type Db, chapterDrafts, chapters } from '@novel-hub/db';
import { LIMITS } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type AuthorChapterView, toAuthorChapterView } from '../chapters/chapter-view';
import { draftVersion } from '../chapters/draft-version';
import { loadOwnedChapter } from '../chapters/load-owned-chapter';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { type PublishError, type PublishResult, parseDraftBase } from './publish-chapter';
import { DraftConflictError, lockAndRenderDraft, writeChapterContent } from './write-content';

/** The allowed window for a publish time, relative to `now`. */
export function validateScheduleTime(at: Date, now: Date): boolean {
  const delta = at.getTime() - now.getTime();
  return delta >= LIMITS.schedule.minLeadMs && delta <= LIMITS.schedule.maxAheadMs;
}

export type ScheduleError = PublishError | 'ALREADY_PUBLISHED' | 'INVALID_SCHEDULE_TIME';

/**
 * Schedules a chapter that was never published. The content is rendered and stored now (same
 * pipeline as publishing); at the publish time the sweeper only flips the status. Rescheduling
 * updates both content and time; resending the current time only refreshes the content. Nothing
 * is public yet, so no outbox event.
 */
export async function scheduleChapter(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  input: { baseUpdatedAt: string; scheduledAt: Date; now?: Date },
): Promise<Result<PublishResult, ScheduleError>> {
  const now = input.now ?? new Date();
  const base = parseDraftBase(input.baseUpdatedAt);
  if (!base) return err('DRAFT_CONFLICT');
  try {
    return await db.transaction(async (tx) => {
      const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
      if (!owned.ok) return err(owned.error);
      const { story, chapter } = owned.value;
      if (chapter.status === 'hidden_by_mod') return err('CHAPTER_HIDDEN_BY_MOD');
      if (chapter.status === 'published' || chapter.publishedAt) return err('ALREADY_PUBLISHED');
      // Refreshing the content of a scheduled chapter keeps its time, even when that time is now
      // less than the minimum lead away (or already due and waiting for the next sweep).
      const sameTime =
        chapter.status === 'scheduled' &&
        chapter.scheduledAt?.getTime() === input.scheduledAt.getTime();
      if (!sameTime && !validateScheduleTime(input.scheduledAt, now)) {
        return err('INVALID_SCHEDULE_TIME');
      }

      const content = await lockAndRenderDraft(tx, chapter.id, base);
      if (!content.ok) return err(content.error);
      const written = await writeChapterContent(tx, chapter.id, base, content.value, now);
      const [row] = await tx
        .update(chapters)
        .set({
          status: 'scheduled',
          scheduledAt: input.scheduledAt,
          wordCount: content.value.wordCount,
        })
        .where(eq(chapters.id, chapter.id))
        .returning();
      if (!row) throw new Error('Chapter disappeared while scheduling');
      return ok({
        chapter: toAuthorChapterView(row, written.draftUpdatedAt),
        draftUpdatedAt: written.draftUpdatedAt.toISOString(),
        normalizedDoc: written.normalizedDoc,
        unchanged: false,
        storyVisibility: story.visibility,
      });
    });
  } catch (error) {
    if (error instanceof DraftConflictError) return err('DRAFT_CONFLICT');
    throw error;
  }
}

/** Back to a plain draft. The rendered content stays stored but is never served for a draft. */
export async function unscheduleChapter(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
): Promise<Result<AuthorChapterView, 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_SCHEDULED'>> {
  return db.transaction(async (tx) => {
    const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
    if (!owned.ok) return err(owned.error);
    const { chapter } = owned.value;
    if (chapter.status !== 'scheduled') return err('NOT_SCHEDULED');
    const [row] = await tx
      .update(chapters)
      .set({ status: 'draft', scheduledAt: null })
      .where(eq(chapters.id, chapter.id))
      .returning();
    if (!row) throw new Error('Chapter disappeared while unscheduling');
    const [draft] = await tx
      .select({ updatedAt: draftVersion })
      .from(chapterDrafts)
      .where(eq(chapterDrafts.chapterId, chapter.id));
    return ok(toAuthorChapterView(row, draft?.updatedAt ?? null));
  });
}
