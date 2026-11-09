import { z } from 'zod';
import { readerSettingsSchema } from './reader';
import { siteThemeSettingsSchema } from './site-theme';

/**
 * A user's settings, stored in `users.preferences` (jsonb). Every read goes through this schema
 * to fill in defaults.
 */
export const userPreferencesSchema = z.object({
  /** Show 18+ stories in lists; only signed-in accounts can turn it on. */
  showMature: z.boolean().default(false),
  /** Reading page settings synced across devices. A stored value that no longer parses is dropped. */
  reader: readerSettingsSchema.optional().catch(undefined),
  /** Site colour theme synced across devices. A stored value that no longer parses is dropped. */
  siteTheme: siteThemeSettingsSchema.optional().catch(undefined),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/** Body of `PATCH /api/v1/me/preferences`: only the fields to change. */
export const preferencesPatchSchema = z
  .object({
    /** Replaces the stored reader settings as a whole. */
    reader: readerSettingsSchema.optional(),
    /** Replaces the stored site theme choice as a whole. */
    siteTheme: siteThemeSettingsSchema.optional(),
    showMature: z.boolean().optional(),
    /** The reader states they are 18 or older; required to turn `showMature` on. */
    confirmAdult: z.boolean().optional(),
  })
  .strict();

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;
