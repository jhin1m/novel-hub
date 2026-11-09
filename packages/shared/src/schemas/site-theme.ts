import { z } from 'zod';

/** Site colour theme choices; `system` follows the OS light/dark setting (Ivory or Dark). */
export const SITE_THEME_CHOICES = ['system', 'ivory', 'dark'] as const;

export type SiteThemeChoice = (typeof SITE_THEME_CHOICES)[number];

/**
 * Site colour theme the reader picked, kept in localStorage and, for signed-in readers, in
 * `users.preferences.siteTheme`; `updatedAt` (ms) decides which copy wins when they differ.
 */
export const siteThemeSettingsSchema = z.object({
  choice: z.enum(SITE_THEME_CHOICES),
  updatedAt: z.number().int().nonnegative(),
});

export type SiteThemeSettings = z.infer<typeof siteThemeSettingsSchema>;

/** Nothing picked yet: follow the OS; `updatedAt: 0` loses to any real choice. */
export const DEFAULT_SITE_THEME: SiteThemeSettings = { choice: 'system', updatedAt: 0 };
