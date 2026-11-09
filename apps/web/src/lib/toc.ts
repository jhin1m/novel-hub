import { foldVietnamese } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

/** One row of a table of contents. */
export interface TocChapter {
  number: number;
  title: string | null;
}

export type TocOrder = 'oldest' | 'newest';

/**
 * Chapters matching what the reader typed, in their original order. Digits only: chapters whose
 * number starts with them (`12` finds 12, 120–129, 1200…). Anything else: a substring of
 * "Chương N title", compared without accents or case. A blank query keeps every chapter.
 */
export function filterChapters<T extends TocChapter>(chapters: readonly T[], query: string): T[] {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return [...chapters];
  if (/^\d+$/.test(trimmed)) {
    // `012` reads as 12; a lone `0` matches nothing since numbering starts at 1.
    const prefix = trimmed.replace(/^0+(?=\d)/, '');
    return chapters.filter((chapter) => String(chapter.number).startsWith(prefix));
  }
  const needle = foldVietnamese(trimmed);
  return chapters.filter((chapter) => foldVietnamese(searchText(chapter)).includes(needle));
}

/** A sorted copy: lowest number first for `oldest`, highest first for `newest`. */
export function orderChapters<T extends TocChapter>(chapters: readonly T[], order: TocOrder): T[] {
  const sign = order === 'oldest' ? 1 : -1;
  return [...chapters].sort((a, b) => sign * (a.number - b.number));
}

/** What a query is matched against: the visible label and the title. */
function searchText(chapter: TocChapter): string {
  const label = m.reader_chapter_label({ number: chapter.number });
  return chapter.title ? `${label} ${chapter.title.replace(/\s+/g, ' ')}` : label;
}
