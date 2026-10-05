/** Separators between words: whitespace, em/en dashes and the ellipsis character. */
const WORD_SEPARATOR = /[\s—–…]+/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Word count used everywhere (editor, publish limits, stats, duplicate check). A word is a token
 * between separators that holds at least one letter or digit, so lone punctuation does not count.
 * The definition is frozen: stored counts and limits depend on it.
 */
export function countWords(text: string): number {
  let count = 0;
  for (const token of text.normalize('NFC').split(WORD_SEPARATOR)) {
    if (HAS_LETTER_OR_DIGIT.test(token)) count += 1;
  }
  return count;
}
