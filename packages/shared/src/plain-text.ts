/**
 * Control characters except the line feed (tabs become spaces first), plus the bidi embedding,
 * override and isolate controls, which can make a text read differently from what is stored.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point here.
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;
const TRAILING_SPACES = /[^\S\n]+$/gmu;
const LINE_SEPARATORS = /[\u2028\u2029]/g;
/** Something a reader can see; text made only of invisible characters counts as empty. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
/** Four line feeds or more = three blank lines or more. */
const EXTRA_BLANK_LINES = /\n{4,}/g;

/** Length as Postgres `char_length` counts it (code points), so the API and the DB agree. */
export function plainTextLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Cleans free text people post (comments, reviews) before it is stored: Unicode NFC, `\r\n` → `\n`,
 * tabs → spaces, control characters dropped, trailing spaces of each line dropped, at most two
 * blank lines in a row, trimmed. `null` when nothing visible is left or it is longer than `max`
 * code points. The result is shown as text, never as HTML.
 */
export function normalizePlainText(raw: string, max: number): string | null {
  const text = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(LINE_SEPARATORS, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(TRAILING_SPACES, '')
    .replace(EXTRA_BLANK_LINES, '\n\n\n')
    .trim();
  const length = plainTextLength(text);
  return length === 0 || length > max || !VISIBLE.test(text) ? null : text;
}
