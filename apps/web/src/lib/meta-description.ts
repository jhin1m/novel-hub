import { m } from '@novel-hub/shared/messages';

const MAX_LENGTH = 160;

/**
 * `<meta name="description">` from user text: its first paragraph on one line, cut at a word
 * boundary to 160 characters. Empty text falls back to the site description.
 */
export function metaDescription(text: string): string {
  const firstParagraph = text.split(/\n\s*\n/)[0] ?? '';
  const line = firstParagraph.replace(/\s+/g, ' ').trim();
  if (!line) return m.home_description();
  if (line.length <= MAX_LENGTH) return line;
  const cut = line.slice(0, MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
