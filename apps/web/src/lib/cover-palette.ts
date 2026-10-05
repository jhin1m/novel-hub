/**
 * Colour and title size of the default text cover. Pure integer maths with no locale or random
 * input, so the server and the browser pick the same colour and hydration never mismatches.
 */

/** Must equal the number of `--cover-N` variables in `tokens.css` (checked by `tokens.test.ts`). */
export const COVER_PALETTE_SIZE = 10;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over UTF-16 code units, as an unsigned integer. */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Palette slot (`--cover-N`) for a main tag: stories sharing a main tag share a colour. */
export function coverPaletteIndex(tagSlug: string): number {
  return fnv1a32(tagSlug) % COVER_PALETTE_SIZE;
}

/**
 * Title size steps by length. The `rem` size is the fallback; where container query units are
 * supported the title scales with the cover width (`cqw`), so one component fits a 150px card
 * and a 300px story page alike.
 */
const TITLE_STEPS: ReadonlyArray<{ maxLength: number; className: string }> = [
  { maxLength: 20, className: 'text-xl supports-[width:1cqw]:text-[length:13cqw]' },
  { maxLength: 45, className: 'text-lg supports-[width:1cqw]:text-[length:11cqw]' },
  { maxLength: 90, className: 'text-base supports-[width:1cqw]:text-[length:9cqw]' },
  {
    maxLength: Number.POSITIVE_INFINITY,
    className: 'text-sm supports-[width:1cqw]:text-[length:7cqw]',
  },
];

/** Font size classes for a cover title of this length (in characters). */
export function coverTitleClass(title: string): string {
  const length = [...title].length;
  // The last step has no upper bound, so `find` always matches.
  return TITLE_STEPS.find((s) => length <= s.maxLength)?.className ?? '';
}
