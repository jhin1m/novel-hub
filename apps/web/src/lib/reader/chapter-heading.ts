import { m } from '@novel-hub/shared/messages';

export interface ChapterHeading {
  /** The chapter's `h1` and page title: its title, or "Chương N" when it has none. */
  heading: string;
  /** "Chương N" shown above a titled chapter's heading; `null` when the heading already says it. */
  label: string | null;
}

/** How the reading page names a chapter. */
export function chapterHeading(chapter: { number: number; title: string | null }): ChapterHeading {
  const numbered = m.reader_chapter_label({ number: chapter.number });
  return chapter.title
    ? { heading: chapter.title, label: numbered }
    : { heading: numbered, label: null };
}
