import { type Db, notifyFollowersOfAnnouncement } from '@novel-hub/core';
import { notifyAnnouncementPayload } from '@novel-hub/shared';
import { UnrecoverableError } from 'bullmq';

export interface NotifyAnnouncementDeps {
  db: Db;
}

/**
 * Tells the followers of a story about its author's announcement, from the current database
 * state; idempotent per announcement, so a repeated run is harmless. A malformed payload is never
 * retried (BullMQ logs the failure).
 */
export async function processNotifyAnnouncement(
  data: unknown,
  deps: NotifyAnnouncementDeps,
): Promise<void> {
  const parsed = notifyAnnouncementPayload.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('malformed notify-announcement payload');
  await notifyFollowersOfAnnouncement(deps.db, parsed.data.announcementId);
}
