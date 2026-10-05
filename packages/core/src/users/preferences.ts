import { type Db, users } from '@novel-hub/db';
import { type UserPreferences, userPreferencesSchema } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';

/**
 * A user's preferences with defaults filled in. A stored value that no longer matches the schema
 * falls back to the defaults instead of failing the request.
 */
export async function getPreferences(db: Db, userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const parsed = userPreferencesSchema.safeParse(row?.preferences ?? {});
  return parsed.success ? parsed.data : userPreferencesSchema.parse({});
}
