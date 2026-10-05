import { h32 } from './hash';

/** Seeds of the two 32-bit halves of a shingle's 64-bit hash; FROZEN with `h32`. */
const HIGH_SEED = 0x5bd1e995;
const LOW_SEED = 0x27d4eb2f;

/**
 * 64-bit SimHash of a shingle set (every shingle weighs 1), as a signed bigint so it fits a
 * Postgres `bigint`. Near-identical texts land within a few bits of each other. FROZEN: see `h32`.
 */
export function simhash(set: ReadonlySet<string>): bigint {
  const weights = new Int32Array(64);
  for (const shingle of set) {
    const high = h32(shingle, HIGH_SEED);
    const low = h32(shingle, LOW_SEED);
    for (let bit = 0; bit < 32; bit++) {
      weights[bit] = (weights[bit] as number) + ((low >>> bit) & 1 ? 1 : -1);
      weights[bit + 32] = (weights[bit + 32] as number) + ((high >>> bit) & 1 ? 1 : -1);
    }
  }
  let value = 0n;
  for (let bit = 63; bit >= 0; bit--) {
    value = (value << 1n) | ((weights[bit] as number) > 0 ? 1n : 0n);
  }
  return BigInt.asIntN(64, value);
}

/** Number of differing bits between two 64-bit SimHashes (0–64). */
export function hamming64(a: bigint, b: bigint): number {
  let diff = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (diff > 0n) {
    diff &= diff - 1n;
    count += 1;
  }
  return count;
}
