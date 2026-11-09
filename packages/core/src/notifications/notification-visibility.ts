import {
  type Db,
  chapters,
  notifications,
  stories,
  storyAnnouncements,
  users,
} from '@novel-hub/db';
import { type SQL, and, eq, exists, or, sql } from 'drizzle-orm';
import { readableChapterWhere } from '../access/can-read-chapter';
import { publicStoryWhere } from '../catalog/story-card';
import { getPreferences } from '../users/preferences';

/** Who is looking at their notifications; `showMature` comes from their stored preferences. */
export interface NotificationViewer {
  id: string;
  showMature: boolean;
}

/** The viewer for `userId`, with their 18+ setting read from the database. */
export async function notificationViewer(db: Db, userId: string): Promise<NotificationViewer> {
  return { id: userId, showMature: (await getPreferences(db, userId)).showMature };
}

/**
 * The chapter ids a `chapter_published` payload lists, as a set of uuids; empty for other types.
 * Every payload cast checks `type` first, so a row of another type never reaches a cast.
 */
export const payloadChapterIds = sql`(select jsonb_array_elements_text(case when ${notifications.type} = 'chapter_published' then ${notifications.payload}->'chapterIds' end)::uuid)`;

/** The story a `chapter_published` or `story_announcement` payload is about; `null` otherwise. */
export const payloadStoryId = sql`(case when ${notifications.type} in ('chapter_published', 'story_announcement') then (${notifications.payload}->>'storyId')::uuid end)`;

/** The announcement a `story_announcement` payload is about; `null` for every other type. */
export const payloadAnnouncementId = sql`(case when ${notifications.type} = 'story_announcement' then (${notifications.payload}->>'announcementId')::uuid end)`;

/**
 * The one rule for which of the viewer's notifications show, shared by the list and the unread
 * count so the badge never counts what the list leaves out. Branches on `type`; a new type must add
 * its branch here.
 * - `chapter_published`: the story is public and its author not banned, at least one of its
 *   chapters can still be read, and an 18+ story only for a viewer who turned 18+ on.
 * - `story_announcement`: the announcement is still `visible`, with the same story rule.
 * - `user_warned`: always, to the warned user.
 *
 * Payload casts are guarded by `type` (see `payloadStoryId`), so a payload of another type, or
 * one written by a later type, cannot make the cast fail for the whole list.
 *
 * The subqueries have their own `stories`, `users`, `chapters` and `story_announcements`, which
 * shadow any the outer query joins, so the helpers below apply to the subqueries' rows.
 */
export function notificationVisibleWhere(db: Db, viewer: NotificationViewer): SQL {
  const matureRule = viewer.showMature ? undefined : eq(stories.isMature, false);
  const chapterPublished = and(
    eq(notifications.type, 'chapter_published'),
    exists(
      db
        .select({ one: sql`1` })
        .from(chapters)
        .innerJoin(stories, eq(stories.id, chapters.storyId))
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(
          and(
            sql`${stories.id} = ${payloadStoryId}`,
            sql`${chapters.id} in ${payloadChapterIds}`,
            readableChapterWhere(),
            matureRule,
          ),
        ),
    ),
  );
  const storyAnnouncement = and(
    eq(notifications.type, 'story_announcement'),
    exists(
      db
        .select({ one: sql`1` })
        .from(storyAnnouncements)
        .innerJoin(stories, eq(stories.id, storyAnnouncements.storyId))
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(
          and(
            sql`${storyAnnouncements.id} = ${payloadAnnouncementId}`,
            sql`${stories.id} = ${payloadStoryId}`,
            eq(storyAnnouncements.status, 'visible'),
            publicStoryWhere({ includeMature: viewer.showMature }),
          ),
        ),
    ),
  );
  const userWarned = eq(notifications.type, 'user_warned');
  return and(
    eq(notifications.userId, viewer.id),
    or(chapterPublished, storyAnnouncement, userWarned),
  ) as SQL;
}
