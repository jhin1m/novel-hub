import { type Db, pruneNotifications } from '@novel-hub/core';

export interface PruneNotificationsDeps {
  db: Db;
}

/** Notifications are kept this many days, read or not. */
export const NOTIFICATION_RETENTION_DAYS = 90;

/** Deletes notifications past their retention, in batches. */
export async function processPruneNotifications(deps: PruneNotificationsDeps): Promise<void> {
  const deleted = await pruneNotifications(deps.db, NOTIFICATION_RETENTION_DAYS);
  if (deleted > 0) console.info(`[notifications] pruned ${deleted} old notifications`);
}
