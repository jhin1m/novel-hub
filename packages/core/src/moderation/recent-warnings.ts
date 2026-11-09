import { type Db, moderationActions, users } from '@novel-hub/db';
import { and, count, eq, gte, inArray } from 'drizzle-orm';

/**
 * Warnings are counted over the last `windowDays`; from `suggestAt` on, the queue suggests muting
 * or banning (a moderator still decides, nothing happens on its own).
 */
export const WARNING_RULES = { windowDays: 90, suggestAt: 3 } as const;

const DAY_MS = 86_400_000;

/** How many recent warnings a user has, and whether that is enough to suggest muting or banning. */
export interface WarningSummary {
  count: number;
  suggest: boolean;
}

/**
 * Warnings each of `usernames` received in the last `WARNING_RULES.windowDays`, in one query over
 * the moderation log (notifications are pruned by age, the log is not). Users without any are left
 * out.
 */
export async function countRecentWarnings(
  db: Db,
  usernames: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, WarningSummary>> {
  if (usernames.length === 0) return new Map();
  const since = new Date(now.getTime() - WARNING_RULES.windowDays * DAY_MS);
  const rows = await db
    .select({ username: users.username, n: count() })
    .from(moderationActions)
    .innerJoin(users, eq(users.id, moderationActions.targetId))
    .where(
      and(
        eq(moderationActions.action, 'warn_user'),
        eq(moderationActions.targetType, 'user'),
        inArray(users.username, [...new Set(usernames)]),
        gte(moderationActions.createdAt, since),
      ),
    )
    .groupBy(users.username);
  return new Map(
    rows.map((row) => [row.username, { count: row.n, suggest: row.n >= WARNING_RULES.suggestAt }]),
  );
}
