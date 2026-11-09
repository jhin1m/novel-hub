import { type Db, chapters, notifications, stories, storyAnnouncements } from '@novel-hub/db';
import { NOTIFICATIONS_PAGE_SIZE, parseNotification } from '@novel-hub/shared';
import { type SQL, and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type StoryCardDto, selectStoryCards, toStoryCard } from '../catalog/story-card';
import {
  notificationViewer,
  notificationVisibleWhere,
  payloadAnnouncementId,
  payloadChapterIds,
  payloadStoryId,
} from './notification-visibility';

/** Fields every notification of the list has. No internal ids besides its own. */
interface NotificationBase {
  /** Kept by the UI to mark it read; never shown. */
  id: string;
  read: boolean;
  createdAt: string;
}

/** A "new chapters" notification as the list shows it. */
export interface ChapterPublishedNotificationDto extends NotificationBase {
  type: 'chapter_published';
  story: StoryCardDto;
  /** How many new chapters it stands for. */
  count: number;
  /** The most recent of them that can still be read: the one the notification opens. */
  chapter: { number: number; title: string | null };
}

/** An author's announcement to the followers of one of their stories. */
export interface StoryAnnouncementNotificationDto extends NotificationBase {
  type: 'story_announcement';
  story: StoryCardDto;
  /** The start of the announcement, at most `ANNOUNCEMENT_EXCERPT_MAX` characters. */
  excerpt: string;
}

/** A moderator's warning to the user, with the moderator's note as the reason. */
export interface UserWarnedNotificationDto extends NotificationBase {
  type: 'user_warned';
  /** Plain text written by a moderator; rendered as text, never as HTML. */
  reason: string;
}

export type NotificationDto =
  ChapterPublishedNotificationDto | StoryAnnouncementNotificationDto | UserWarnedNotificationDto;

export interface NotificationPage {
  items: NotificationDto[];
  /** Pass back to get the next page; `null` on the last one. */
  nextCursor: string | null;
}

/** Characters of an announcement shown in its notification, ellipsis included. */
export const ANNOUNCEMENT_EXCERPT_MAX = 140;

const createdAtMicros = sql<string>`(extract(epoch from ${notifications.createdAt}) * 1000000)::bigint::text`;

/** `(created_at, id)` strictly after `cursor` in "newest first" order. */
function afterCursor(cursor: string): SQL | undefined {
  const match = /^(\d{1,17})_([0-9a-f-]{36})$/.exec(cursor);
  if (!match) return undefined;
  const at = sql`timestamptz 'epoch' + ${match[1]}::bigint * interval '1 microsecond'`;
  return sql`(${notifications.createdAt}, ${notifications.id}) < (${at}, ${match[2]}::uuid)`;
}

/** `text` cut to `max` code points, the last one an ellipsis when anything was cut. */
function excerpt(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * The reader's notifications, newest first, in keyset pages over `(created_at, id)`. Only those
 * `notificationVisibleWhere` lets through (the same rule as the unread count, so every type the
 * badge counts shows here), with the story, chapter and announcement as they are now (renames
 * show, hidden or deleted chapters drop out of the link).
 */
export async function listNotifications(
  db: Db,
  userId: string,
  cursor?: string,
  limit = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationPage> {
  const viewer = await notificationViewer(db, userId);
  // Visibility is checked by `notificationVisibleWhere`; this only picks, among the chapters of a
  // "new chapters" notification, the latest one still published.
  const latest = db
    .select({ number: chapters.number, title: chapters.title })
    .from(chapters)
    .where(
      and(
        eq(notifications.type, 'chapter_published'),
        sql`${chapters.storyId} = ${payloadStoryId}`,
        sql`${chapters.id} in ${payloadChapterIds}`,
        eq(chapters.status, 'published'),
        isNull(chapters.deletedAt),
      ),
    )
    .orderBy(desc(chapters.number))
    .limit(1)
    .as('latest');

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      createdAtMicros,
      chapterNumber: latest.number,
      chapterTitle: latest.title,
      announcementBody: storyAnnouncements.body,
    })
    .from(notifications)
    .leftJoinLateral(latest, sql`true`)
    .leftJoin(storyAnnouncements, sql`${storyAnnouncements.id} = ${payloadAnnouncementId}`)
    .where(and(notificationVisibleWhere(db, viewer), cursor ? afterCursor(cursor) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const parsed = page.map((row) => ({ row, notification: parseNotification(row) }));

  // Story cards in one query for the whole page; visibility was already checked above.
  const storyIds = [
    ...new Set(
      parsed.flatMap(({ notification }) =>
        notification && notification.type !== 'user_warned' ? [notification.payload.storyId] : [],
      ),
    ),
  ];
  const cards = new Map<string, StoryCardDto>();
  if (storyIds.length > 0) {
    for (const card of await selectStoryCards(db).where(inArray(stories.id, storyIds))) {
      cards.set(card.id, toStoryCard(card));
    }
  }

  const items: NotificationDto[] = [];
  for (const { row, notification } of parsed) {
    const base = { id: row.id, read: row.readAt !== null, createdAt: row.createdAt.toISOString() };
    switch (notification?.type) {
      case 'chapter_published': {
        const story = cards.get(notification.payload.storyId);
        if (!story || row.chapterNumber === null) break;
        items.push({
          ...base,
          type: 'chapter_published',
          story,
          count: notification.payload.count,
          chapter: { number: row.chapterNumber, title: row.chapterTitle },
        });
        break;
      }
      case 'story_announcement': {
        const story = cards.get(notification.payload.storyId);
        if (!story || row.announcementBody === null) break;
        items.push({
          ...base,
          type: 'story_announcement',
          story,
          excerpt: excerpt(row.announcementBody, ANNOUNCEMENT_EXCERPT_MAX),
        });
        break;
      }
      case 'user_warned':
        items.push({ ...base, type: 'user_warned', reason: notification.payload.reason });
        break;
      case undefined:
        break;
    }
  }
  return {
    items,
    nextCursor: rows.length > limit && last ? `${last.createdAtMicros}_${last.id}` : null,
  };
}
