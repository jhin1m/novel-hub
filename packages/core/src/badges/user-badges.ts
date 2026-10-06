import { type Db, badges, userBadges } from '@novel-hub/db';
import { BADGE_CODES, type BadgeCode, isBadgeCode } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';

export interface UserBadgeDto {
  code: BadgeCode;
  awardedAt: string;
}

/**
 * The badges of a user in catalog order. Codes no longer in the catalog are dropped, since the UI
 * has no label for them.
 */
export async function listUserBadges(db: Db, userId: string): Promise<UserBadgeDto[]> {
  const rows = await db
    .select({ code: badges.code, awardedAt: userBadges.awardedAt })
    .from(userBadges)
    .innerJoin(badges, eq(badges.id, userBadges.badgeId))
    .where(eq(userBadges.userId, userId));
  const result: UserBadgeDto[] = [];
  for (const row of rows) {
    if (isBadgeCode(row.code)) {
      result.push({ code: row.code, awardedAt: row.awardedAt.toISOString() });
    }
  }
  return result.sort((a, b) => BADGE_CODES.indexOf(a.code) - BADGE_CODES.indexOf(b.code));
}
