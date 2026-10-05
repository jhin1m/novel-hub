import { type Tx, chapters, stories, users } from '@novel-hub/db';
import { type StoryVisibility, isValidPublicId } from '@novel-hub/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import { recomputeStoryCounters } from '../publishing/counters';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * Locks a story by public id (always the first lock of a content action) and checks the actor may
 * act on its author: the rules for users apply to their content too, so nobody moderates their own
 * stories and a moderator leaves those of moderators and admins to an admin. Only the story row is
 * locked, not the author's.
 */
async function lockStory(
  tx: Tx,
  actor: CurrentUser,
  publicId: string,
): Promise<Result<{ id: string; visibility: StoryVisibility }, ModerationError>> {
  if (!isValidPublicId(publicId)) return err('NOT_FOUND');
  const [story] = await tx
    .select({
      id: stories.id,
      visibility: stories.visibility,
      authorId: stories.authorId,
      authorRole: users.role,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(eq(stories.publicId, publicId))
    .for('update', { of: stories });
  if (!story) return err('NOT_FOUND');
  if (!canModerateUser(actor, { id: story.authorId, role: story.authorRole })) {
    return err('FORBIDDEN');
  }
  return ok({ id: story.id, visibility: story.visibility });
}

/**
 * Hides a published story (`published → hidden_by_mod`) or restores a hidden one. Its chapters keep
 * their own status; readers lose them through the story's visibility.
 */
export async function setStoryHidden(
  tx: Tx,
  actor: CurrentUser,
  publicId: string,
  hide: boolean,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const locked = await lockStory(tx, actor, publicId);
  if (!locked.ok) return locked;
  const story = locked.value;
  if (story.visibility !== (hide ? 'published' : 'hidden_by_mod')) return err('INVALID_STATE');

  await tx
    .update(stories)
    .set({ visibility: hide ? 'hidden_by_mod' : 'published' })
    .where(eq(stories.id, story.id));
  const target: ModerationTarget = { type: 'story', id: story.id };
  await logModerationAction(tx, actor, target, hide ? 'hide_story' : 'restore_story', note);
  await recordContentChanges(tx, [
    { entity: 'story', action: hide ? 'hidden' : 'restored', storyId: story.id },
  ]);
  return ok(target);
}

/**
 * Hides a published chapter (`published → hidden_by_mod`) or restores a hidden one, recomputing the
 * story's counters. Locks story → chapter, the order publishing uses, so the two never deadlock.
 * Soft-deleted chapters are not found.
 */
export async function setChapterHidden(
  tx: Tx,
  actor: CurrentUser,
  publicId: string,
  number: number,
  hide: boolean,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const locked = await lockStory(tx, actor, publicId);
  if (!locked.ok) return locked;
  const story = locked.value;
  const [chapter] = await tx
    .select({ id: chapters.id, status: chapters.status })
    .from(chapters)
    .where(
      and(eq(chapters.storyId, story.id), eq(chapters.number, number), isNull(chapters.deletedAt)),
    )
    .for('update');
  if (!chapter) return err('NOT_FOUND');
  if (chapter.status !== (hide ? 'published' : 'hidden_by_mod')) return err('INVALID_STATE');

  await tx
    .update(chapters)
    .set({ status: hide ? 'hidden_by_mod' : 'published' })
    .where(eq(chapters.id, chapter.id));
  await recomputeStoryCounters(tx, story.id);
  const target: ModerationTarget = { type: 'chapter', id: chapter.id };
  await logModerationAction(tx, actor, target, hide ? 'hide_chapter' : 'restore_chapter', note);
  await recordContentChanges(tx, [
    {
      entity: 'chapter',
      action: hide ? 'hidden' : 'restored',
      storyId: story.id,
      chapterId: chapter.id,
      chapterNumber: number,
    },
  ]);
  return ok(target);
}
