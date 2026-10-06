import { type Db, notifications } from '@novel-hub/db';
import type { MarkNotificationsReadInput } from '@novel-hub/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Marks some (`ids`) or all of the reader's unread notifications read. Always scoped to `userId`,
 * so ids of someone else's notifications change nothing. Returns how many changed.
 */
export async function markNotificationsRead(
  db: Db,
  userId: string,
  input: MarkNotificationsReadInput,
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        'ids' in input ? inArray(notifications.id, input.ids) : undefined,
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}
