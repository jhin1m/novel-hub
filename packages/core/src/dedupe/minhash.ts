import { DEDUPE } from '@novel-hub/shared';
import { fmix32, h32 } from './hash';

/** Second seed for double hashing; FROZEN with `h32`. */
const STEP_SEED = 0x9747b28c;

/**
 * MinHash signature of a shingle set: for permutation `i`, the minimum over shingles of
 * `fmix32(a + i·b)`, where `a` and `b` are two independent hashes of the shingle (double hashing,
 * so each shingle is hashed twice instead of `n` times). Stored as signed 32-bit integers to fit a
 * Postgres `integer[]`. FROZEN: see `h32`.
 */
export function minhash(set: ReadonlySet<string>, n: number = DEDUPE.perms): Int32Array {
  const mins = new Uint32Array(n).fill(0xffffffff);
  for (const shingle of set) {
    const a = h32(shingle);
    const b = h32(shingle, STEP_SEED) | 1;
    for (let i = 0; i < n; i++) {
      const value = fmix32((a + Math.imul(i, b)) | 0);
      if (value < (mins[i] as number)) mins[i] = value;
    }
  }
  return new Int32Array(mins.buffer);
}

/** Share of equal positions in two MinHash signatures, an estimate of their Jaccard similarity. */
export function jaccardEstimate(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let equal = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) equal += 1;
  return equal / a.length;
}
