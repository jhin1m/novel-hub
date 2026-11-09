import { type Db, stories, storyAnnouncements, users } from '@novel-hub/db';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { publicStoryWhere } from '../catalog/story-card';

/**
 * Tells the followers of a story (not those of its author) about its author's new announcement, in
 * one statement. Each reader gets one notification per announcement (`dedupe_key =
 * announcement:{id}`, never `story:{id}`, which belongs to the new-chapter notification it would
 * otherwise overwrite). Running again changes nothing, even after a reader read it, as the outbox
 * delivers at least once. The author and banned followers get nothing, and nothing is sent when
 * the announcement is no longer visible or its story no longer public by the time the job runs.
 */
export async function notifyFollowersOfAnnouncement(
  db: Db,
  announcementId: string,
): Promise<{ affected: number }> {
  const [row] = await db
    .select({ storyId: stories.id, authorId: stories.authorId })
    .from(storyAnnouncements)
    .innerJoin(stories, eq(stories.id, storyAnnouncements.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(
      and(
        eq(storyAnnouncements.id, announcementId),
        eq(storyAnnouncements.status, 'visible'),
        publicStoryWhere({ includeMature: true }),
        isNotNull(stories.lastChapterAt),
      ),
    )
    .limit(1);
  if (!row) return { affected: 0 };

  const { storyId, authorId } = row;
  const dedupeKey = `announcement:${announcementId}`;
  // Recipients in `user_id` order, so concurrent fan-outs lock rows in the same order. The unique
  // index only covers unread rows, so `not exists` is what keeps a read notification from coming
  // back; `on conflict do nothing` covers a race with a parallel run.
  const result = await db.execute(sql`
    insert into notifications (user_id, type, payload, dedupe_key)
    select f.user_id, 'story_announcement',
      jsonb_build_object('storyId', ${storyId}::text, 'announcementId', ${announcementId}::text),
      ${dedupeKey}
    from follows f
    join users u on u.id = f.user_id and u.status <> 'banned'
    where f.target_type = 'story' and f.target_id = ${storyId}::uuid
      and f.user_id <> ${authorId}::uuid
      and not exists (
        select 1 from notifications n
        where n.user_id = f.user_id and n.dedupe_key = ${dedupeKey}
      )
    order by f.user_id
    on conflict do nothing
  `);
  return { affected: result.rowCount ?? 0 };
}
