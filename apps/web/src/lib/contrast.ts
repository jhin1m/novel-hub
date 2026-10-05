/** WCAG 2.x colour contrast, used to check design tokens and default cover colours. */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` or `#rrggbb` → `[r, g, b]` (0–255). Throws on any other format. */
export function parseHex(hex: string): [number, number, number] {
  if (!HEX_RE.test(hex)) throw new Error(`Invalid hex colour: ${hex}`);
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black/white). Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastPair = { bg: string; fg: string; min: number };

export type ContrastViolation = ContrastPair & { ratio: number | null };

/**
 * Pairs in `pairs` that fail their threshold against `colors` (variable name → hex). A pair with
 * a missing variable also counts as a violation (`ratio: null`) so it is never skipped silently.
 */
export function contrastViolations(
  colors: Readonly<Record<string, string>>,
  pairs: ReadonlyArray<ContrastPair>,
): ContrastViolation[] {
  const violations: ContrastViolation[] = [];
  for (const pair of pairs) {
    const bg = colors[pair.bg];
    const fg = colors[pair.fg];
    if (!bg || !fg) {
      violations.push({ ...pair, ratio: null });
      continue;
    }
    const ratio = contrastRatio(bg, fg);
    if (ratio < pair.min) violations.push({ ...pair, ratio });
  }
  return violations;
}
