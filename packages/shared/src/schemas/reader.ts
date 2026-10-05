import { z } from 'zod';

/** Largest chapter number Postgres `integer` holds. */
const MAX_CHAPTER_NUMBER = 2_147_483_647;

/**
 * The chapter number in `chapter-{number}`. Only the canonical spelling is accepted (no leading
 * zero, no sign, no zero): every other spelling would be a second URL for the same content.
 */
export function parseChapterNumber(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const number = Number(raw);
  return number <= MAX_CHAPTER_NUMBER ? number : null;
}

/** A chapter addressed the way public URLs address it; the public id format is checked in `core`. */
const chapterRefShape = {
  publicId: z.string().min(1).max(32),
  number: z.int().min(1).max(MAX_CHAPTER_NUMBER),
};

/** Where a signed-in reader is in a chapter (`PUT|POST /api/v1/reading/progress`). */
export const readingProgressInput = z.object({
  ...chapterRefShape,
  scrollPct: z.number().min(0).max(100),
});

export type ReadingProgressInput = z.infer<typeof readingProgressInput>;

/** One counted read of a chapter (`POST /api/v1/reading/view`). */
export const chapterViewInput = z.object(chapterRefShape);

export type ChapterViewInput = z.infer<typeof chapterViewInput>;

/** Parses a whole `chapter-{number}` path segment. */
export function parseChapterSegment(segment: string): number | null {
  return segment.startsWith('chapter-')
    ? parseChapterNumber(segment.slice('chapter-'.length))
    : null;
}

/** Background presets of the reading page (`data-reader-theme`), each with an AA text colour. */
export const READER_THEMES = [
  'white',
  'ivory',
  'sepia',
  'soft-green',
  'dark-gray',
  'oled-black',
] as const;
/** The first one is the default content font; the others are only downloaded once picked. */
export const READER_FONTS = [
  'source-serif-4',
  'literata',
  'noto-serif',
  'plus-jakarta-sans',
] as const;
/** Text column width; only takes effect on wide screens. */
export const READER_WIDTHS = ['narrow', 'medium', 'wide'] as const;
export const READER_ALIGNS = ['left', 'justify'] as const;
export const READER_RANGES = {
  fontSize: { min: 14, max: 28, step: 1 },
  lineHeight: { min: 1.5, max: 2.2, step: 0.1 },
  paragraphSpacing: { min: 0, max: 2, step: 0.25 },
} as const;

export type ReaderTheme = (typeof READER_THEMES)[number];
export type ReaderFont = (typeof READER_FONTS)[number];
export type ReaderWidth = (typeof READER_WIDTHS)[number];
export type ReaderAlign = (typeof READER_ALIGNS)[number];
export type ReaderRange = (typeof READER_RANGES)[keyof typeof READER_RANGES];

/**
 * Fonts that were removed from `READER_FONTS` but may still be stored in localStorage or
 * `users.preferences.reader`, mapped to their replacement so old settings keep parsing.
 * `BOOT_SCRIPT` applies the same map before the first paint.
 */
export const LEGACY_READER_FONTS: Readonly<Record<string, ReaderFont>> = {
  'be-vietnam-pro': 'plus-jakarta-sans',
  inter: 'plus-jakarta-sans',
};

/** Maps a legacy font value to its replacement; anything else passes through unchanged. */
export function migrateLegacyReaderFont(value: unknown): unknown {
  return typeof value === 'string' && Object.hasOwn(LEGACY_READER_FONTS, value)
    ? LEGACY_READER_FONTS[value]
    : value;
}

/** Within the range and on a step (with float tolerance: 1.7 is `1.5 + 2 × 0.1`). */
export function isInReaderRange(value: number, range: ReaderRange): boolean {
  if (!Number.isFinite(value) || value < range.min || value > range.max) return false;
  const steps = (value - range.min) / range.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

function rangeSchema(range: ReaderRange) {
  return z.number().refine((value) => isInReaderRange(value, range), 'Off the allowed steps');
}

/**
 * Display settings of the reading page. Stored in localStorage and, for signed-in readers, in
 * `users.preferences.reader`; `updatedAt` (ms) decides which copy wins when they differ.
 */
export const readerSettingsSchema = z.object({
  /** Absent = follow the system colour scheme. */
  theme: z.enum(READER_THEMES).optional(),
  font: z.preprocess(migrateLegacyReaderFont, z.enum(READER_FONTS)),
  fontSize: rangeSchema(READER_RANGES.fontSize),
  lineHeight: rangeSchema(READER_RANGES.lineHeight),
  paragraphSpacing: rangeSchema(READER_RANGES.paragraphSpacing),
  width: z.enum(READER_WIDTHS),
  align: z.enum(READER_ALIGNS),
  updatedAt: z.number().int().nonnegative(),
});

export type ReaderSettings = z.infer<typeof readerSettingsSchema>;

/** Must match the `:root` defaults in `apps/web/src/styles/reader.css`. */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  font: 'source-serif-4',
  fontSize: 19,
  lineHeight: 1.8,
  paragraphSpacing: 1,
  width: 'medium',
  align: 'left',
  updatedAt: 0,
};
