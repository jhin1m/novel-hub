import { type Db, storyAnnouncements } from '@novel-hub/db';
import { and, eq } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { findOwnStory } from './announcement-dto';

/**
 * The author deletes one of their story's visible announcements (soft: `status = 'deleted'`, it
 * still counts towards the daily limit). The id must belong to the story of `publicId`, so an
 * author cannot reach another story's announcement through their own. Already deleted or unknown
 * → `NOT_FOUND`; hidden by a moderator → `INVALID_STATE` (it stays a moderation record). The
 * pages showing it are purged through the outbox; nobody is notified.
 */
export async function deleteAnnouncement(
  db: Db,
  actor: StoryActor,
  publicId: string,
  announcementId: string,
): Promise<Result<void, 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE'>> {
  const own = await findOwnStory(db, actor, publicId);
  if (!own.ok) return err(own.error);
  const { storyId } = own;
  const ofStory = and(
    eq(storyAnnouncements.id, announcementId),
    eq(storyAnnouncements.storyId, storyId),
  );

  return db.transaction(async (tx) => {
    const deleted = await tx
      .update(storyAnnouncements)
      .set({ status: 'deleted' })
      .where(and(ofStory, eq(storyAnnouncements.status, 'visible')))
      .returning({ id: storyAnnouncements.id });
    if (deleted.length > 0) {
      await recordContentChanges(tx, [
        { entity: 'announcement', action: 'deleted', announcementId, storyId },
      ]);
      return ok(undefined);
    }
    const [row] = await tx
      .select({ status: storyAnnouncements.status })
      .from(storyAnnouncements)
      .where(ofStory);
    return err(row?.status === 'hidden_by_mod' ? 'INVALID_STATE' : 'NOT_FOUND');
  });
}
