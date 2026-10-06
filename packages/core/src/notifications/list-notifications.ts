import { type Db, chapters, notifications, stories } from '@novel-hub/db';
import { NOTIFICATIONS_PAGE_SIZE, parseNotification } from '@novel-hub/shared';
import { type SQL, and, desc, eq, isNull, sql } from 'drizzle-orm';
import { type StoryCardDto, selectStoryCardsWith, toStoryCard } from '../catalog/story-card';
import {
  notificationViewer,
  notificationVisibleWhere,
  payloadChapterIds,
  payloadStoryId,
} from './notification-visibility';

/** A "new chapters" notification as the list shows it. No internal ids besides its own. */
export interface ChapterPublishedNotificationDto {
  /** Kept by the UI to mark it read; never shown. */
  id: string;
  type: 'chapter_published';
  story: StoryCardDto;
  /** How many new chapters it stands for. */
  count: number;
  /** The most recent of them that can still be read: the one the notification opens. */
  chapter: { number: number; title: string | null };
  read: boolean;
  createdAt: string;
}

export type NotificationDto = ChapterPublishedNotificationDto;

export interface NotificationPage {
  items: NotificationDto[];
  /** Pass back to get the next page; `null` on the last one. */
  nextCursor: string | null;
}

const createdAtMicros = sql<string>`(extract(epoch from ${notifications.createdAt}) * 1000000)::bigint::text`;

/** `(created_at, id)` strictly after `cursor` in "newest first" order. */
function afterCursor(cursor: string): SQL | undefined {
  const match = /^(\d{1,17})_([0-9a-f-]{36})$/.exec(cursor);
  if (!match) return undefined;
  const at = sql`timestamptz 'epoch' + ${match[1]}::bigint * interval '1 microsecond'`;
  return sql`(${notifications.createdAt}, ${notifications.id}) < (${at}, ${match[2]}::uuid)`;
}

/**
 * The reader's notifications, newest first, in keyset pages over `(created_at, id)`. Only those
 * `notificationVisibleWhere` lets through, with the story and chapter as they are now (renames
 * show, hidden or deleted chapters drop out of the link).
 */
export async function listNotifications(
  db: Db,
  userId: string,
  cursor?: string,
  limit = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationPage> {
  const viewer = await notificationViewer(db, userId);
  // Story and author visibility are checked by `notificationVisibleWhere`; this only picks, among
  // the notified chapters, the latest one still published.
  const latest = db
    .select({ number: chapters.number, title: chapters.title })
    .from(chapters)
    .where(
      and(
        eq(chapters.storyId, stories.id),
        sql`${chapters.id} in ${payloadChapterIds}`,
        eq(chapters.status, 'published'),
        isNull(chapters.deletedAt),
      ),
    )
    .orderBy(desc(chapters.number))
    .limit(1)
    .as('latest');

  const rows = await selectStoryCardsWith(db, {
    notificationId: notifications.id,
    type: notifications.type,
    payload: notifications.payload,
    readAt: notifications.readAt,
    createdAt: notifications.createdAt,
    createdAtMicros,
    chapterNumber: latest.number,
    chapterTitle: latest.title,
  })
    .innerJoin(notifications, sql`${stories.id} = ${payloadStoryId}`)
    .innerJoinLateral(latest, sql`true`)
    .where(and(notificationVisibleWhere(db, viewer), cursor ? afterCursor(cursor) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const items: NotificationDto[] = [];
  for (const row of page) {
    const parsed = parseNotification(row);
    if (parsed?.type !== 'chapter_published') continue;
    items.push({
      id: row.notificationId,
      type: 'chapter_published',
      story: toStoryCard(row),
      count: parsed.payload.count,
      chapter: { number: row.chapterNumber, title: row.chapterTitle },
      read: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return {
    items,
    nextCursor:
      rows.length > limit && last ? `${last.createdAtMicros}_${last.notificationId}` : null,
  };
}
