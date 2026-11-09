import { type Tx, storyAnnouncements, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import { canModerateUser } from '../policies/moderation';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/**
 * Hides a visible author announcement (`visible → hidden_by_mod`) or restores a hidden one, with
 * its row locked. The rules for users apply to its author: nobody moderates their own, and a
 * moderator leaves those of moderators and admins to an admin. One its author deleted stays
 * deleted. The story and author pages show announcements, so the change goes to the outbox for the
 * worker to purge them; the followers' notifications about it follow its status on their own.
 */
export async function setAnnouncementHidden(
  tx: Tx,
  actor: CurrentUser,
  announcementId: string,
  hide: boolean,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  const [announcement] = await tx
    .select({
      id: storyAnnouncements.id,
      storyId: storyAnnouncements.storyId,
      status: storyAnnouncements.status,
      authorId: storyAnnouncements.authorId,
      authorRole: users.role,
    })
    .from(storyAnnouncements)
    .innerJoin(users, eq(users.id, storyAnnouncements.authorId))
    .where(eq(storyAnnouncements.id, announcementId))
    .for('update', { of: storyAnnouncements });
  if (!announcement) return err('NOT_FOUND');
  if (!canModerateUser(actor, { id: announcement.authorId, role: announcement.authorRole })) {
    return err('FORBIDDEN');
  }
  if (announcement.status !== (hide ? 'visible' : 'hidden_by_mod')) return err('INVALID_STATE');

  await tx
    .update(storyAnnouncements)
    .set({ status: hide ? 'hidden_by_mod' : 'visible' })
    .where(eq(storyAnnouncements.id, announcement.id));
  const target: ModerationTarget = { type: 'announcement', id: announcement.id };
  await logModerationAction(
    tx,
    actor,
    target,
    hide ? 'hide_announcement' : 'restore_announcement',
    note,
  );
  await recordContentChanges(tx, [
    {
      entity: 'announcement',
      action: hide ? 'hidden' : 'restored',
      announcementId: announcement.id,
      storyId: announcement.storyId,
    },
  ]);
  return ok(target);
}
