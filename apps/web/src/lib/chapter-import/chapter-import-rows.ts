import {
  CHAPTER_IMPORT_LIMITS,
  type ChapterImportMode,
  LIMITS,
  countWords,
} from '@novel-hub/shared';
import type { ParsedChapter } from './parse-chapter-text';

/** One chapter of the import as it is previewed and sent. */
export interface ImportRow {
  title: string;
  /** Body sent to the server, one paragraph per line. */
  text: string;
  words: number;
  paragraphs: number;
  /** Within the word range a published chapter needs. */
  wordsInRange: boolean;
}

/** What stops the whole import before sending, besides single chapters out of word range. */
export type ImportIssue = { kind: 'too_many'; max: number } | { kind: 'too_large' };

export function toImportRows(chapters: readonly ParsedChapter[]): ImportRow[] {
  return chapters.map(({ title, lines }) => {
    // The parser's lines are trimmed and non-blank, so this text is exactly
    // `docToText(paragraphsToDoc(lines))`, the document the server builds and counts on publish
    // (pinned by the `paragraphsToDoc` test). Building the document here would pull the Tiptap
    // entry into this bundle.
    const text = lines.join('\n');
    const words = countWords(text);
    return {
      // An over-long heading name is cut to the title limit; the author can rename the chapter.
      title: title.slice(0, LIMITS.chapterTitleMax),
      // The schema wants a non-empty body; a blank one is an empty draft (and fails publishing).
      text: text || ' ',
      words,
      paragraphs: lines.length,
      wordsInRange: words >= LIMITS.chapterWords.min && words <= LIMITS.chapterWords.max,
    };
  });
}

/** Same limits as the server schema, so a request that would be refused is never sent. */
export function importIssue(
  rows: readonly ImportRow[],
  mode: ChapterImportMode,
): ImportIssue | null {
  const max =
    mode === 'draft' ? CHAPTER_IMPORT_LIMITS.maxChapters : CHAPTER_IMPORT_LIMITS.maxPublishChapters;
  if (rows.length > max) return { kind: 'too_many', max };
  let total = 0;
  let paragraphs = 0;
  for (const row of rows) {
    if (row.text.length > CHAPTER_IMPORT_LIMITS.maxChapterChars) return { kind: 'too_large' };
    total += row.text.length;
    paragraphs += row.paragraphs;
  }
  if (
    total > CHAPTER_IMPORT_LIMITS.maxTotalChars ||
    paragraphs > CHAPTER_IMPORT_LIMITS.maxParagraphs
  ) {
    return { kind: 'too_large' };
  }
  return null;
}

/**
 * Whether every scheduled time (`startMs`, then every `intervalHours`) lies in the window the
 * server accepts relative to `nowMs`; the times only grow, so the first and last decide.
 */
export function scheduleInWindow(
  startMs: number,
  intervalHours: number,
  count: number,
  nowMs: number,
): boolean {
  const lastMs = startMs + Math.max(0, count - 1) * intervalHours * 3_600_000;
  return (
    startMs - nowMs >= LIMITS.schedule.minLeadMs && lastMs - nowMs <= LIMITS.schedule.maxAheadMs
  );
}
