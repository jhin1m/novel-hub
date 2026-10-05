import { DEDUPE } from '@novel-hub/shared';

/** Invisible format characters (zero-width space and joiners, soft hyphen, BOM, bidi marks). */
const FORMAT_CHARS = /\p{Cf}+/gu;
const NON_WORD = /[^\p{L}\p{M}\p{N}\s]+/gu;
const WHITESPACE = /\s+/u;

/**
 * Words of a chapter's plain text for the duplicate check: invisible format characters removed
 * (so they cannot split words unseen), lowercased, NFKC (composed and decomposed Vietnamese
 * diacritics match, fullwidth and other compatibility forms fold to plain ones), punctuation
 * dropped. FROZEN with the hash functions: stored fingerprints depend on it.
 */
export function normalizeForDedupe(text: string): string[] {
  return text
    .replace(FORMAT_CHARS, '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(NON_WORD, ' ')
    .split(WHITESPACE)
    .filter((token) => token.length > 0);
}

/** Distinct runs of `k` consecutive words; a text shorter than `k` words is one shingle. */
export function shingles(tokens: readonly string[], k: number = DEDUPE.shingle): Set<string> {
  const result = new Set<string>();
  if (tokens.length === 0) return result;
  if (tokens.length < k) {
    result.add(tokens.join(' '));
    return result;
  }
  for (let i = 0; i + k <= tokens.length; i++) result.add(tokens.slice(i, i + k).join(' '));
  return result;
}
