/**
 * Splits pasted text or a `.txt` file into chapters for the bulk import. A chapter starts at a
 * heading line such as "Chương 12: Tên chương" (also `CHƯƠNG`, `Chuong`; separator `:`, `.`, `-`,
 * `–` or `—`; the name is optional). The number in the heading only marks where a chapter starts:
 * the server numbers imported chapters after the story's last one.
 */

export interface ParsedChapter {
  /** Text after the separator of the heading; empty when the heading has no name. */
  title: string;
  /** Non-blank lines of the chapter, trimmed; each becomes one paragraph. */
  lines: string[];
}

export interface ParsedChapterText {
  chapters: ParsedChapter[];
  /** Non-blank text before the first heading was left out. */
  leadingTextDropped: boolean;
}

const HEADING = /^\s*(?:Chương|CHƯƠNG|Chuong|chương)\s+\d+\s*(?:[:.\-–—]\s*(.*?))?\s*$/;

export function parseChapterText(raw: string): ParsedChapterText {
  // U+0000 is valid UTF-8 but cannot be stored; the server drops it too.
  const text = raw
    .replace(/^\uFEFF/, '')
    .replaceAll('\u0000', '')
    .normalize('NFC');
  const chapters: ParsedChapter[] = [];
  let leadingTextDropped = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const heading = HEADING.exec(rawLine);
    if (heading) {
      chapters.push({ title: heading[1] ?? '', lines: [] });
      continue;
    }
    const line = rawLine.trim();
    if (!line) continue;
    const current = chapters.at(-1);
    if (current) current.lines.push(line);
    else leadingTextDropped = true;
  }
  return { chapters, leadingTextDropped };
}
