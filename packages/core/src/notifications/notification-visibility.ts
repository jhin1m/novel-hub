import { type Db, chapters, notifications, stories, users } from '@novel-hub/db';
import { type SQL, and, eq, exists, sql } from 'drizzle-orm';
import { readableChapterWhere } from '../access/can-read-chapter';
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

/** The chapter ids a `chapter_published` payload lists, as a set of uuids. */
export const payloadChapterIds = sql`(select jsonb_array_elements_text(${notifications.payload}->'chapterIds')::uuid)`;

/** The story a `chapter_published` payload is about. */
export const payloadStoryId = sql`(${notifications.payload}->>'storyId')::uuid`;

/**
 * The one rule for which of the viewer's notifications show, shared by the list and the unread
 * count so the badge never counts what the list leaves out. Branches on `type`; a new type must add
 * its branch here. `chapter_published`: the story is public and its author not banned, at least one
 * of its chapters can still be read, and an 18+ story only for a viewer who turned 18+ on.
 *
 * The payload casts to uuid below run on every row before `type` is checked, so a new type must
 * never store a non-uuid under `storyId` or `chapterIds`.
 *
 * The subquery has its own `stories`, `users` and `chapters`, which shadow any the outer query
 * joins, so `readableChapterWhere` applies to the subquery's rows.
 */
export function notificationVisibleWhere(db: Db, viewer: NotificationViewer): SQL {
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
            viewer.showMature ? undefined : eq(stories.isMature, false),
          ),
        ),
    ),
  );
  return and(eq(notifications.userId, viewer.id), chapterPublished) as SQL;
}
