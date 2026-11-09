import { notifyFollowersOfAnnouncement } from '@novel-hub/core';
import { createTestDb } from '@novel-hub/db/testing';

/**
 * Runs the `notify-announcement` job of the story's latest announcement, as the worker would once
 * the outbox delivers its post (e2e runs no worker).
 */
export async function deliverAnnouncementNotifications(publicId: string): Promise<void> {
  const { db, pool } = createTestDb();
  try {
    const { rows } = await pool.query<{ id: string }>(
      `select a.id from story_announcements a join stories s on s.id = a.story_id
       where s.public_id = $1 order by a.created_at desc, a.id desc limit 1`,
      [publicId],
    );
    const announcement = rows[0];
    if (!announcement) throw new Error(`no announcement for story ${publicId}`);
    await notifyFollowersOfAnnouncement(db, announcement.id);
  } finally {
    await pool.end();
  }
}
