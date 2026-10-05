import { type Db, users } from '@novel-hub/db';
import {
  type PreferencesPatch,
  type UserPreferences,
  userPreferencesSchema,
} from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';

export type PreferencesError = 'ADULT_CONFIRMATION_REQUIRED';

/** A stored value that no longer matches the schema falls back to the defaults. */
function parseStored(raw: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : userPreferencesSchema.parse({});
}

/** A user's preferences with defaults filled in. */
export async function getPreferences(db: Db, userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseStored(row?.preferences);
}

/**
 * Changes only the given fields; `reader` is replaced as a whole. The row is locked while merging
 * so two tabs (one turning 18+ on, one changing the font size) never drop each other's change.
 * Turning 18+ on requires the reader to state they are 18 or older.
 */
export async function updatePreferences(
  db: Db,
  userId: string,
  patch: PreferencesPatch,
): Promise<Result<UserPreferences, PreferencesError>> {
  if (patch.showMature === true && patch.confirmAdult !== true) {
    return err('ADULT_CONFIRMATION_REQUIRED');
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!row) throw new Error('User not found');
    const next = userPreferencesSchema.parse({
      ...parseStored(row.preferences),
      ...(patch.showMature !== undefined && { showMature: patch.showMature }),
      ...(patch.reader !== undefined && { reader: patch.reader }),
    });
    await tx.update(users).set({ preferences: next }).where(eq(users.id, userId));
    return ok(next);
  });
}
