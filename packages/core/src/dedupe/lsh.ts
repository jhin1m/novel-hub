import { DEDUPE } from '@novel-hub/shared';
import { h32 } from './hash';

/**
 * LSH band keys of a MinHash signature: one signed 32-bit key per band of `rows` values, seeded by
 * the band index so equal values in different bands never collide. Two chapters become duplicate
 * candidates when they share any key. FROZEN: see `h32`.
 */
export function lshKeys(
  signature: ArrayLike<number>,
  bands: number = DEDUPE.bands,
  rows: number = DEDUPE.rows,
): number[] {
  if (signature.length < bands * rows) {
    throw new Error(`MinHash signature has ${signature.length} values, needs ${bands * rows}`);
  }
  const keys: number[] = [];
  for (let band = 0; band < bands; band++) {
    const values = Array.from({ length: rows }, (_, row) => signature[band * rows + row]);
    keys.push(h32(values.join(','), band) | 0);
  }
  return keys;
}
