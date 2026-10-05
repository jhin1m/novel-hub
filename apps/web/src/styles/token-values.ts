import { READER_THEMES, type ReaderTheme } from '@novel-hub/shared';
import type { ContrastPair } from '../lib/contrast';

/**
 * Copy of the colour values in `tokens.css` as TS constants, so contrast can be tested without
 * parsing CSS. `tokens.test.ts` checks every `--name: #hex;` appears verbatim in `tokens.css`,
 * so the two places cannot drift apart silently.
 */

type Scope = Readonly<Record<`--${string}`, `#${string}`>>;

/** The reader presets themselves are declared in `@novel-hub/shared` (`READER_THEMES`). */
export const READER_PRESETS = READER_THEMES;

export type ReaderPreset = ReaderTheme;

const light: Scope = {
  '--background': '#fbf8f3',
  '--foreground': '#2a2724',
  '--card': '#fbf8f3',
  '--card-foreground': '#2a2724',
  '--popover': '#fbf8f3',
  '--popover-foreground': '#2a2724',
  '--primary': '#a8432a',
  '--primary-foreground': '#fbf8f3',
  '--secondary': '#f2eee7',
  '--secondary-foreground': '#2a2724',
  '--muted': '#f2eee7',
  '--muted-foreground': '#6b645c',
  '--accent': '#f2eee7',
  '--accent-foreground': '#2a2724',
  '--destructive': '#a3342b',
  '--border': '#e4ded4',
  '--input': '#8a8278',
  '--ring': '#a8432a',
  '--reader-bg': '#fbf6ec',
  '--reader-fg': '#2b2722',
  '--reader-muted': '#675f55',
};

const dark: Scope = {
  '--background': '#1c1a18',
  '--foreground': '#ece6dd',
  '--card': '#1c1a18',
  '--card-foreground': '#ece6dd',
  '--popover': '#1c1a18',
  '--popover-foreground': '#ece6dd',
  '--primary': '#d9825f',
  '--primary-foreground': '#1c1a18',
  '--secondary': '#2a2724',
  '--secondary-foreground': '#ece6dd',
  '--muted': '#2a2724',
  '--muted-foreground': '#a89f94',
  '--accent': '#2a2724',
  '--accent-foreground': '#ece6dd',
  '--destructive': '#e5806f',
  '--border': '#3a3632',
  '--input': '#6f675e',
  '--ring': '#d9825f',
  '--reader-bg': '#2b2b2b',
  '--reader-fg': '#d6d3ce',
  '--reader-muted': '#a3a09b',
};

const reader: Readonly<Record<ReaderPreset, Scope>> = {
  white: { '--reader-bg': '#ffffff', '--reader-fg': '#1f1f1f', '--reader-muted': '#5f5f5f' },
  ivory: { '--reader-bg': '#fbf6ec', '--reader-fg': '#2b2722', '--reader-muted': '#675f55' },
  sepia: { '--reader-bg': '#f4ecd8', '--reader-fg': '#3b2f22', '--reader-muted': '#6a5a47' },
  'soft-green': { '--reader-bg': '#e6efe4', '--reader-fg': '#22302a', '--reader-muted': '#4e5f55' },
  'dark-gray': { '--reader-bg': '#2b2b2b', '--reader-fg': '#d6d3ce', '--reader-muted': '#a3a09b' },
  'oled-black': { '--reader-bg': '#000000', '--reader-fg': '#c9c5be', '--reader-muted': '#8f8b85' },
};

/** Default text cover palette (`--cover-N`) and its text colour; the same in light and dark. */
const cover: Scope = {
  '--cover-0': '#8a2f3c',
  '--cover-1': '#7a4e2d',
  '--cover-2': '#7d6420',
  '--cover-3': '#4f5d2f',
  '--cover-4': '#2f5d50',
  '--cover-5': '#2e5266',
  '--cover-6': '#2c3e66',
  '--cover-7': '#5b3a64',
  '--cover-8': '#7e3b54',
  '--cover-9': '#3a3632',
  '--cover-fg': '#fbf8f3',
};

export const TOKEN_VALUES = { light, dark, reader, cover } as const;

/** Names of the `--cover-N` background variables, in palette order. */
export function coverBackgrounds(): string[] {
  return Object.keys(cover).filter((name) => /^--cover-\d+$/.test(name));
}

/** Every cover background against the cover text colour; the author name is small text, so 4.5:1. */
export const COVER_CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = coverBackgrounds().map((bg) => ({
  bg,
  fg: '--cover-fg',
  min: 4.5,
}));

/** Text/background pairs that must meet WCAG AA (4.5:1 for text, 3:1 for input borders per 1.4.11). */
export const CONTRAST_PAIRS: ReadonlyArray<ContrastPair> = [
  { bg: '--background', fg: '--foreground', min: 4.5 },
  { bg: '--background', fg: '--muted-foreground', min: 4.5 },
  { bg: '--muted', fg: '--muted-foreground', min: 4.5 },
  { bg: '--card', fg: '--card-foreground', min: 4.5 },
  { bg: '--popover', fg: '--popover-foreground', min: 4.5 },
  { bg: '--secondary', fg: '--secondary-foreground', min: 4.5 },
  { bg: '--accent', fg: '--accent-foreground', min: 4.5 },
  { bg: '--primary', fg: '--primary-foreground', min: 4.5 },
  // Links use the accent colour on the page background.
  { bg: '--background', fg: '--primary', min: 4.5 },
  { bg: '--background', fg: '--destructive', min: 4.5 },
  { bg: '--background', fg: '--input', min: 3 },
  { bg: '--background', fg: '--ring', min: 3 },
  { bg: '--reader-bg', fg: '--reader-fg', min: 4.5 },
  { bg: '--reader-bg', fg: '--reader-muted', min: 4.5 },
];

/**
 * Effective palette per context: dark and each reader preset inherit light for any variable they
 * do not set (mirrors the CSS cascade, where presets only override `--reader-*`).
 */
export function resolvedScopes(): Record<string, Scope> {
  const scopes: Record<string, Scope> = { light, dark: { ...light, ...dark } };
  for (const preset of READER_PRESETS) scopes[`reader:${preset}`] = { ...light, ...reader[preset] };
  return scopes;
}
