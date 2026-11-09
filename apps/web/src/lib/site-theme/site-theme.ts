import {
  SITE_THEME_CHOICES,
  type SiteThemeChoice,
  type SiteThemeSettings,
  siteThemeSettingsSchema,
} from '@novel-hub/shared';

/** localStorage key of the site theme choice (JSON `SiteThemeSettings`), read before paint. */
export const SITE_THEME_KEY = 'nh:theme';

/** The part of `<html>` the theme touches; a structural type so tests can pass a fake. */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** Narrows an untrusted string (a Radix `onValueChange` value, stored JSON) to a choice. */
export function isSiteThemeChoice(value: unknown): value is SiteThemeChoice {
  return (SITE_THEME_CHOICES as readonly unknown[]).includes(value);
}

/**
 * Applies the choice to the root element: `system` leaves `data-theme` off so the CSS follows the
 * OS. `BOOT_SCRIPT` repeats this logic as a static string for the first paint;
 * `boot-script.test.ts` checks both give the same result.
 */
export function applySiteTheme(root: ThemeRoot, choice: SiteThemeChoice): void {
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * Parses the stored JSON without trusting it: a JSON object with a valid `choice` → settings
 * (an invalid `updatedAt` becomes 0, so any server copy wins); anything else → `null`.
 */
export function parseStoredSiteTheme(raw: string | null): SiteThemeSettings | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if (!isSiteThemeChoice(stored.choice)) return null;
  const updatedAt = siteThemeSettingsSchema.shape.updatedAt.safeParse(stored.updatedAt);
  return { choice: stored.choice, updatedAt: updatedAt.success ? updatedAt.data : 0 };
}

/** Storage can throw (Safari private mode, blocked site data): treated as nothing stored. */
export function readLocalSiteTheme(storage: Pick<Storage, 'getItem'>): SiteThemeSettings | null {
  try {
    return parseStoredSiteTheme(storage.getItem(SITE_THEME_KEY));
  } catch {
    return null;
  }
}

export function writeLocalSiteTheme(
  storage: Pick<Storage, 'setItem'>,
  settings: SiteThemeSettings,
): void {
  try {
    storage.setItem(SITE_THEME_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the theme still applies to this page, just not to the next one.
  }
}
