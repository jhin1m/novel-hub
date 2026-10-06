import { LIMITS } from '@novel-hub/shared';

/** Fill of the word meter and where the minimum sits on it, both as a share of the maximum. */
export function wordMeter(
  words: number,
  limits: { min: number; max: number } = LIMITS.chapterWords,
): { ratio: number; minMarker: number } {
  return {
    ratio: Math.min(1, Math.max(0, words / limits.max)),
    minMarker: limits.min / limits.max,
  };
}
