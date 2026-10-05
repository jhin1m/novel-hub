import { READER_THEMES, type ReaderTheme } from '@novel-hub/shared';

/**
 * Copy of the colour values in `tokens.css` as TS constants, so contrast can be tested without
 * parsing CSS. `tokens.test.ts` checks every `--name: #hex;` appears verbatim in `tokens.css`,
 * so the two places cannot drift apart silently. The pairs checked live in
 * `token-contrast-pairs.ts`.
 */

type Scope = Readonly<Record<`--${string}`, `#${string}`>>;

/** The reader presets themselves are declared in `@novel-hub/shared` (`READER_THEMES`). */
export const READER_PRESETS = READER_THEMES;

export type ReaderPreset = ReaderTheme;

/** Reading-page accent that stays readable on light presets. */
const lightReaderAccent: Scope = {
  '--reader-primary': '#0e6b5b',
  '--reader-primary-foreground': '#ffffff',
  '--reader-primary-soft': '#ddefea',
};

/** Reading-page accent that stays readable on dark presets. */
const darkReaderAccent: Scope = {
  '--reader-primary': '#4fc2a8',
  '--reader-primary-foreground': '#0b1f1a',
  '--reader-primary-soft': '#17332c',
};

const light: Scope = {
  '--background': '#f5f4ef',
  '--foreground': '#1c1d1b',
  '--card': '#ffffff',
  '--card-foreground': '#1c1d1b',
  '--popover': '#ffffff',
  '--popover-foreground': '#1c1d1b',
  '--primary': '#0e6b5b',
  '--primary-foreground': '#ffffff',
  '--primary-soft': '#ddefea',
  '--secondary': '#eceae3',
  '--secondary-foreground': '#1c1d1b',
  '--muted': '#eceae3',
  '--muted-foreground': '#5d5f59',
  '--accent': '#eceae3',
  '--accent-foreground': '#1c1d1b',
  '--destructive': '#b3261e',
  '--warning-soft': '#fff1dc',
  '--warning-foreground': '#8a4b00',
  '--band': '#ece8df',
  '--border': '#e3e1d9',
  '--input': '#8a8c85',
  '--ring': '#0e6b5b',
  // No preset chosen on a light system: ivory.
  '--reader-bg': '#fbf6ec',
  '--reader-fg': '#2b2722',
  '--reader-muted': '#675f55',
  '--reader-card': '#f3ecdd',
  ...lightReaderAccent,
};

const dark: Scope = {
  '--background': '#101312',
  '--foreground': '#e8ece9',
  '--card': '#181c1a',
  '--card-foreground': '#e8ece9',
  '--popover': '#181c1a',
  '--popover-foreground': '#e8ece9',
  '--primary': '#4fc2a8',
  '--primary-foreground': '#0b1f1a',
  '--primary-soft': '#17332c',
  '--secondary': '#222724',
  '--secondary-foreground': '#e8ece9',
  '--muted': '#222724',
  '--muted-foreground': '#9aa39e',
  '--accent': '#222724',
  '--accent-foreground': '#e8ece9',
  '--destructive': '#f2877c',
  '--warning-soft': '#2e2312',
  '--warning-foreground': '#f2b866',
  '--band': '#161a18',
  '--border': '#2c322f',
  '--input': '#6e7771',
  '--ring': '#4fc2a8',
  // No preset chosen on a dark system: dark grey.
  '--reader-bg': '#2b2b2b',
  '--reader-fg': '#d6d3ce',
  '--reader-muted': '#a3a09b',
  '--reader-card': '#363636',
  ...darkReaderAccent,
};

const reader: Readonly<Record<ReaderPreset, Scope>> = {
  white: {
    '--reader-bg': '#ffffff',
    '--reader-fg': '#1f1f1f',
    '--reader-muted': '#5f5f5f',
    '--reader-card': '#f4f4f2',
    ...lightReaderAccent,
  },
  ivory: {
    '--reader-bg': '#fbf6ec',
    '--reader-fg': '#2b2722',
    '--reader-muted': '#675f55',
    '--reader-card': '#f3ecdd',
    ...lightReaderAccent,
  },
  sepia: {
    '--reader-bg': '#f4ecd8',
    '--reader-fg': '#3b2f22',
    '--reader-muted': '#6a5a47',
    '--reader-card': '#eadfc6',
    ...lightReaderAccent,
  },
  'soft-green': {
    '--reader-bg': '#e6efe4',
    '--reader-fg': '#22302a',
    '--reader-muted': '#4e5f55',
    '--reader-card': '#d9e5d6',
    ...lightReaderAccent,
  },
  'dark-gray': {
    '--reader-bg': '#2b2b2b',
    '--reader-fg': '#d6d3ce',
    '--reader-muted': '#a3a09b',
    '--reader-card': '#363636',
    ...darkReaderAccent,
  },
  'oled-black': {
    '--reader-bg': '#000000',
    '--reader-fg': '#c9c5be',
    '--reader-muted': '#8f8b85',
    '--reader-card': '#141414',
    ...darkReaderAccent,
  },
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
  '--cover-fg': '#f6f1e7',
};

export const TOKEN_VALUES = { light, dark, reader, cover } as const;

/** Names of the `--cover-N` background variables, in palette order. */
export function coverBackgrounds(): string[] {
  return Object.keys(cover).filter((name) => /^--cover-\d+$/.test(name));
}

/**
 * Effective palette per context: dark and each reader preset inherit light for any variable they
 * do not set (mirrors the CSS cascade, where presets only override `--reader-*`).
 */
export function resolvedScopes(): Record<string, Scope> {
  const scopes: Record<string, Scope> = { light, dark: { ...light, ...dark } };
  for (const preset of READER_PRESETS) scopes[`reader:${preset}`] = { ...light, ...reader[preset] };
  return scopes;
}
