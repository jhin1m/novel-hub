/**
 * Drop-off per chapter from how many readers reached it. `rows` are the published chapters in
 * order; `reached` never grows along them. A chapter's drop-off is the share of its readers who
 * never got to the next published chapter, as a percentage with one decimal; `null` for the last
 * chapter (nothing to drop before) and for a chapter nobody reached (no share of zero).
 */
export function computeDropOff<T extends { number: number; reached: number }>(
  rows: readonly T[],
): Array<T & { dropOffPct: number | null }> {
  return rows.map((row, i) => {
    const next = rows[i + 1];
    if (next === undefined || row.reached === 0) return { ...row, dropOffPct: null };
    const pct = (1 - next.reached / row.reached) * 100;
    return { ...row, dropOffPct: Math.round(pct * 10) / 10 };
  });
}

/**
 * Readers who reached each of `numbers` (ascending): those whose latest chapter is that number or
 * a later one. `latest` counts readers by the number of their latest chapter, which may be a
 * chapter no longer listed (deleted or hidden), still counted for every listed one before it.
 */
export function reachedByChapter(
  numbers: readonly number[],
  latest: ReadonlyMap<number, number>,
): number[] {
  const counts = [...latest].sort((a, b) => b[0] - a[0]);
  const reached = new Array<number>(numbers.length).fill(0);
  let sum = 0;
  let c = 0;
  for (let i = numbers.length - 1; i >= 0; i--) {
    const n = numbers[i] as number;
    for (; c < counts.length && (counts[c] as [number, number])[0] >= n; c++) {
      sum += (counts[c] as [number, number])[1];
    }
    reached[i] = sum;
  }
  return reached;
}
