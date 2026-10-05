import {
  DEFAULT_READER_SETTINGS,
  type ReaderSettings,
  readerSettingsSchema,
} from '@novel-hub/shared';
import type { ZodType } from 'zod';

/** localStorage key of the reader settings (JSON `ReaderSettings`), read before paint. */
export const READER_SETTINGS_KEY = 'nh:reader';

/** CSS variables the numeric settings drive, with their unit. */
export const READER_CSS_VARS = {
  fontSize: { name: '--reader-font-size', unit: 'px' },
  lineHeight: { name: '--reader-line-height', unit: '' },
  paragraphSpacing: { name: '--reader-paragraph-gap', unit: 'em' },
} as const;

/** The part of `<html>` the settings touch; a structural type so tests can pass a fake. */
export interface ReaderRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: { setProperty(name: string, value: string): void };
}

/**
 * Applies the settings to the root element. `BOOT_SCRIPT` repeats this logic as a static string
 * for the first paint; `boot-script.test.ts` checks both give the same result.
 */
export function applyReaderSettings(root: ReaderRoot, settings: ReaderSettings): void {
  if (settings.theme) root.setAttribute('data-reader-theme', settings.theme);
  else root.removeAttribute('data-reader-theme');
  root.setAttribute('data-reader-font', settings.font);
  root.setAttribute('data-reader-width', settings.width);
  root.setAttribute('data-reader-align', settings.align);
  for (const key of ['fontSize', 'lineHeight', 'paragraphSpacing'] as const) {
    const { name, unit } = READER_CSS_VARS[key];
    root.style.setProperty(name, `${settings[key]}${unit}`);
  }
}

function field<T>(schema: ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

/**
 * Parses the stored JSON. Never trusts it: each invalid field falls back to its default on its
 * own, exactly like `BOOT_SCRIPT`. Not a JSON object → `null` (nothing stored).
 */
export function parseStoredSettings(raw: string | null): ReaderSettings | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  const { shape } = readerSettingsSchema;
  const d = DEFAULT_READER_SETTINGS;
  return {
    theme: field(shape.theme, stored.theme, d.theme),
    font: field(shape.font, stored.font, d.font),
    fontSize: field(shape.fontSize, stored.fontSize, d.fontSize),
    lineHeight: field(shape.lineHeight, stored.lineHeight, d.lineHeight),
    paragraphSpacing: field(shape.paragraphSpacing, stored.paragraphSpacing, d.paragraphSpacing),
    width: field(shape.width, stored.width, d.width),
    align: field(shape.align, stored.align, d.align),
    updatedAt: field(shape.updatedAt, stored.updatedAt, d.updatedAt),
  };
}

/** Storage can throw (Safari private mode, blocked site data): treated as nothing stored. */
export function readLocalSettings(storage: Pick<Storage, 'getItem'>): ReaderSettings | null {
  try {
    return parseStoredSettings(storage.getItem(READER_SETTINGS_KEY));
  } catch {
    return null;
  }
}

export function writeLocalSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: ReaderSettings,
): void {
  try {
    storage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings still apply to this page, just not to the next one.
  }
}

/** Which copy should win: the more recently changed one; equal times mean nothing to do. */
export function pickNewer(
  local: ReaderSettings | null,
  server: ReaderSettings | null,
): 'local' | 'server' | 'none' {
  if (!local && !server) return 'none';
  if (!server) return 'local';
  if (!local) return 'server';
  if (local.updatedAt === server.updatedAt) return 'none';
  return local.updatedAt > server.updatedAt ? 'local' : 'server';
}
