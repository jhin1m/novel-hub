import { type Db, notifications } from '@novel-hub/db';
import { and, count, isNull } from 'drizzle-orm';
import { notificationViewer, notificationVisibleWhere } from './notification-visibility';

/** Unread notifications the list would show, through the same rule as the list. */
export async function countUnreadNotifications(db: Db, userId: string): Promise<number> {
  const viewer = await notificationViewer(db, userId);
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(notificationVisibleWhere(db, viewer), isNull(notifications.readAt)));
  return row?.n ?? 0;
}
