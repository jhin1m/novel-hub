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

/** Parses a whole `chapter-{number}` path segment. */
export function parseChapterSegment(segment: string): number | null {
  return segment.startsWith('chapter-')
    ? parseChapterNumber(segment.slice('chapter-'.length))
    : null;
}
