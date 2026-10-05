/**
 * 32-bit string hash behind every stored fingerprint: FNV-1a over UTF-16 code units, seeded through
 * the offset basis, then the MurmurHash3 finalizer for avalanche.
 *
 * FROZEN: `chapter_fingerprints` stores values derived from this function. Changing it (or `fmix32`)
 * makes every stored fingerprint meaningless; if it must change, clear the table and let the
 * backfill recompute everything.
 */
export function h32(text: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return fmix32(hash);
}

/** MurmurHash3 32-bit finalizer; returns an unsigned 32-bit integer. FROZEN, see `h32`. */
export function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
