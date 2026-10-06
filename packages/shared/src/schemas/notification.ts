import { z } from 'zod';

/** Values of `notifications.type`. Adding one means extending `notificationVisibleWhere` in core. */
export const NOTIFICATION_TYPES = ['chapter_published'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Notifications per page of `/notifications`. */
export const NOTIFICATIONS_PAGE_SIZE = 20;
/** Chapter ids a grouped "new chapters" notification keeps (the most recent ones). */
export const NOTIFICATION_CHAPTER_IDS_MAX = 20;
/** Most notifications one "mark read" request may name. */
export const NOTIFICATION_READ_IDS_MAX = 50;
/** The bell shows "99+" above this. */
export const UNREAD_BADGE_MAX = 99;

/**
 * Payload of `chapter_published`: one notification per (reader, story) while unread. A later
 * chapter appends its id and bumps `count` instead of adding a row. Ids only: the list joins the
 * current story and chapters, so renames show and hidden chapters drop out.
 */
export const chapterPublishedPayload = z.object({
  storyId: z.uuid(),
  chapterIds: z.array(z.uuid()).min(1).max(NOTIFICATION_CHAPTER_IDS_MAX),
  count: z.number().int().positive(),
});
export type ChapterPublishedPayload = z.infer<typeof chapterPublishedPayload>;

/** A stored notification by its `type`; `parseNotification` drops anything else. */
const storedNotification = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chapter_published'), payload: chapterPublishedPayload }),
]);
export type StoredNotification = z.infer<typeof storedNotification>;

/** The typed notification of a row, or `null` for an unknown type or a payload that no longer parses. */
export function parseNotification(row: {
  type: string;
  payload: unknown;
}): StoredNotification | null {
  const parsed = storedNotification.safeParse({ type: row.type, payload: row.payload });
  return parsed.success ? parsed.data : null;
}

/**
 * Keyset cursor of the notification list: `${createdAtMicros}_${notificationId}` of the last one
 * shown. Opaque to the client, which only sends back what the previous page returned.
 */
export const notificationCursorSchema = z
  .string()
  .regex(/^\d{1,17}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  .optional();

/** Query of `GET /api/v1/notifications`. */
export const notificationListQuerySchema = z.object({ cursor: notificationCursorSchema });

/** Body of `POST /api/v1/notifications/read`: some of the reader's notifications, or all of them. */
export const markNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(NOTIFICATION_READ_IDS_MAX) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type MarkNotificationsReadInput = z.output<typeof markNotificationsReadSchema>;
