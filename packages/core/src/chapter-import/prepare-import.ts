import {
  CHAPTER_IMPORT_LIMITS,
  type ChapterImportInput,
  LIMITS,
  countWords,
} from '@novel-hub/shared';
import { docToText, paragraphsToDoc, parseEditorDoc } from '@novel-hub/shared/editor';
import { validateScheduleTime } from '../publishing/schedule-chapter';
import type { DraftChapterInput } from './insert-draft-chapters';

const HOUR_MS = 3_600_000;

/** Postgres text and jsonb cannot hold U+0000; it is valid UTF-8, so a `.txt` may carry it. */
const NUL = '\u0000';

export interface PreparedImport {
  chapters: DraftChapterInput[];
  /** Publish time of each chapter in schedule mode, in order; empty otherwise. */
  scheduleTimes: Date[];
}

/**
 * Builds and checks every chapter before anything is written, so an import that cannot go through
 * leaves no trace: count, total paragraphs, title, document schema and size, the 300–20,000 words of a chapter about
 * to go public, and every scheduled time against the scheduling window. `null` when any check
 * fails. The shared schema already ran on the API; this repeats what core must not trust.
 */
export function prepareImport(input: ChapterImportInput, now: Date): PreparedImport | null {
  const publishing = input.mode !== 'draft';
  const max = publishing
    ? CHAPTER_IMPORT_LIMITS.maxPublishChapters
    : CHAPTER_IMPORT_LIMITS.maxChapters;
  if (input.chapters.length === 0 || input.chapters.length > max) return null;

  const scheduleTimes: Date[] = [];
  if (input.mode === 'schedule') {
    if (!input.schedule) return null;
    const start = Date.parse(input.schedule.startAt);
    if (Number.isNaN(start)) return null;
    for (let i = 0; i < input.chapters.length; i++) {
      const at = new Date(start + i * input.schedule.intervalHours * HOUR_MS);
      if (!validateScheduleTime(at, now)) return null;
      scheduleTimes.push(at);
    }
  }

  // Lines first: the paragraph cap is checked before any document is built.
  let paragraphs = 0;
  const texts = input.chapters.map((chapter) => {
    const lines = chapter.text.replaceAll(NUL, '').normalize('NFC').split(/\r?\n/);
    for (const line of lines) if (line.trim()) paragraphs += 1;
    return lines;
  });
  if (paragraphs > CHAPTER_IMPORT_LIMITS.maxParagraphs) return null;

  const encoder = new TextEncoder();
  const chapters: DraftChapterInput[] = [];
  for (const [i, chapter] of input.chapters.entries()) {
    // A title that is blank after trimming means "no title".
    const title = chapter.title?.replaceAll(NUL, '').trim().normalize('NFC') || null;
    if (title && title.length > LIMITS.chapterTitleMax) return null;
    const parsed = parseEditorDoc(paragraphsToDoc(texts[i] ?? []));
    if (!parsed.ok) return null;
    if (encoder.encode(JSON.stringify(parsed.doc)).length > LIMITS.draftMaxBytes) return null;
    if (publishing) {
      // An empty chapter counts 0 words and stops here, as it would on a single publish.
      const words = countWords(docToText(parsed.doc));
      if (words < LIMITS.chapterWords.min || words > LIMITS.chapterWords.max) return null;
    }
    chapters.push({ title, doc: parsed.doc });
  }
  return { chapters, scheduleTimes };
}
