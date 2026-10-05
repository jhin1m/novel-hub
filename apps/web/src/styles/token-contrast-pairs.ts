import type { ContrastPair } from '../lib/contrast';
import { coverBackgrounds } from './token-values';

/**
 * Text/background pairs of the site palette that must meet WCAG AA (4.5:1 for text, 3:1 for
 * input borders and the focus ring per 1.4.11).
 */
export const CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = [
  { bg: '--background', fg: '--foreground', min: 4.5 },
  { bg: '--background', fg: '--muted-foreground', min: 4.5 },
  { bg: '--muted', fg: '--muted-foreground', min: 4.5 },
  { bg: '--card', fg: '--card-foreground', min: 4.5 },
  { bg: '--card', fg: '--muted-foreground', min: 4.5 },
  { bg: '--popover', fg: '--popover-foreground', min: 4.5 },
  { bg: '--secondary', fg: '--secondary-foreground', min: 4.5 },
  { bg: '--secondary', fg: '--muted-foreground', min: 4.5 },
  { bg: '--accent', fg: '--accent-foreground', min: 4.5 },
  { bg: '--band', fg: '--foreground', min: 4.5 },
  { bg: '--band', fg: '--muted-foreground', min: 4.5 },
  { bg: '--primary', fg: '--primary-foreground', min: 4.5 },
  // Links use the accent colour on the page background and on cards.
  { bg: '--background', fg: '--primary', min: 4.5 },
  { bg: '--card', fg: '--primary', min: 4.5 },
  { bg: '--primary-soft', fg: '--primary', min: 4.5 },
  { bg: '--primary-soft', fg: '--foreground', min: 4.5 },
  { bg: '--background', fg: '--destructive', min: 4.5 },
  { bg: '--card', fg: '--destructive', min: 4.5 },
  { bg: '--warning-soft', fg: '--warning-foreground', min: 4.5 },
  { bg: '--background', fg: '--input', min: 3 },
  { bg: '--card', fg: '--input', min: 3 },
  { bg: '--background', fg: '--ring', min: 3 },
  { bg: '--card', fg: '--ring', min: 3 },
];

/**
 * Reading page: text, the rail/note card and the per-preset accent. Checked in every scope,
 * including plain light/dark, which is what a reader sees without picking a preset.
 */
export const READER_CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = [
  { bg: '--reader-bg', fg: '--reader-fg', min: 4.5 },
  { bg: '--reader-bg', fg: '--reader-muted', min: 4.5 },
  { bg: '--reader-card', fg: '--reader-fg', min: 4.5 },
  { bg: '--reader-card', fg: '--reader-muted', min: 4.5 },
  { bg: '--reader-bg', fg: '--reader-primary', min: 4.5 },
  { bg: '--reader-card', fg: '--reader-primary', min: 4.5 },
  { bg: '--reader-primary', fg: '--reader-primary-foreground', min: 4.5 },
  { bg: '--reader-primary-soft', fg: '--reader-primary', min: 4.5 },
];

/** Every cover background against the cover text colour; the author name is small text, so 4.5:1. */
export const COVER_CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = coverBackgrounds().map((bg) => ({
  bg,
  fg: '--cover-fg',
  min: 4.5,
}));
