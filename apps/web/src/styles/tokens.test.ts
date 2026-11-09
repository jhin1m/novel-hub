import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COVER_PALETTE_SIZE } from '../lib/cover-palette';
import { contrastRatio, contrastViolations } from '../lib/contrast';
import {
  CONTRAST_PAIRS,
  COVER_CONTRAST_PAIRS,
  READER_CONTRAST_PAIRS,
} from './token-contrast-pairs';
import {
  HERO_SCRIM,
  READER_PRESETS,
  TOKEN_VALUES,
  coverBackgrounds,
  resolvedScopes,
} from './token-values';

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** The CSS without comments, for checks on selectors and their order. */
const tokensRules = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Dark site theme on a dark system unless ivory is chosen (inside the dark media query). */
const SYSTEM_DARK = ":root:where(:not([data-theme='ivory'])) {";
/** Dark site theme chosen, whatever the system scheme. */
const FORCED_DARK = ":root:where([data-theme='dark']) {";

/** Every `--name: #hex;` declaration listed in `TOKEN_VALUES`. */
function declarations(): Array<[string, string]> {
  const scopes = [
    TOKEN_VALUES.light,
    TOKEN_VALUES.dark,
    TOKEN_VALUES.cover,
    TOKEN_VALUES.hero,
    ...Object.values(TOKEN_VALUES.reader),
  ];
  return scopes.flatMap((scope) => Object.entries(scope));
}

/**
 * Declarations missing verbatim from the CSS. Plain string matching, so it does not check that
 * a variable sits in the right scope: keep each value on its own `--name: #hex;` line.
 */
function missingDeclarations(css: string, decls: Array<[string, string]>): string[] {
  const haystack = css.toLowerCase();
  return decls
    .map(([name, value]) => `${name}: ${value};`.toLowerCase())
    .filter((line) => !haystack.includes(line));
}

/** Text between the `{` that ends `opening` and its matching `}`; empty when `opening` is absent. */
function blockBody(css: string, opening: string): string {
  const start = css.indexOf(opening);
  if (start === -1) return '';
  let depth = 1;
  for (let i = start + opening.length; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + opening.length, i);
  }
  return '';
}

/** Trimmed `property: value;` lines of a comment-free block body. */
function declarationLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith(';'));
}

describe('design tokens', () => {
  it.each(Object.entries(resolvedScopes()))(
    '%s: every text/background pair meets its threshold',
    (_, colors) => {
      expect(contrastViolations(colors, CONTRAST_PAIRS)).toEqual([]);
    },
  );

  // `light` and `dark` are the reading page without a preset (what every guest sees).
  it.each(Object.entries(resolvedScopes()))(
    '%s: reading page text, card and accent meet their threshold',
    (_, colors) => {
      expect(contrastViolations(colors, READER_CONTRAST_PAIRS)).toEqual([]);
    },
  );

  it('reader presets never override the site accent', () => {
    for (const preset of READER_PRESETS) {
      expect(
        Object.keys(TOKEN_VALUES.reader[preset]).filter((name) => !name.startsWith('--reader-')),
      ).toEqual([]);
    }
  });

  it('every default cover colour meets AA against the cover text colour', () => {
    expect(contrastViolations(TOKEN_VALUES.cover, COVER_CONTRAST_PAIRS)).toEqual([]);
  });

  describe('blurred-cover hero', () => {
    const coverFg = TOKEN_VALUES.cover['--cover-fg'] as string;
    /** The scrim flattened over a pure white image, the worst cover the blur can show. */
    const scrimOverWhite = `#${HERO_SCRIM.channels
      .map((channel) =>
        Math.round(channel * HERO_SCRIM.alpha + 255 * (1 - HERO_SCRIM.alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;

    it('declares the scrim as the contrast check assumes', () => {
      expect(tokensCss).toContain(`--hero-scrim: ${HERO_SCRIM.css};`);
    });

    it('text stays AA over a pure white cover', () => {
      expect(scrimOverWhite).toBe('#6a6764');
      expect(contrastRatio(coverFg, scrimOverWhite)).toBeGreaterThanOrEqual(4.5);
    });

    it('text stays AA on the base colour, and the solid button is AA', () => {
      expect(contrastRatio(coverFg, TOKEN_VALUES.hero['--hero-base'] as string)).toBeGreaterThan(
        4.5,
      );
      expect(contrastRatio(coverFg, TOKEN_VALUES.hero['--hero-ink'] as string)).toBeGreaterThan(
        4.5,
      );
    });
  });

  it('the cover palette has exactly COVER_PALETTE_SIZE colours, in TS and in the CSS', () => {
    const expected = Array.from({ length: COVER_PALETTE_SIZE }, (_, i) => `--cover-${i}`);
    expect(coverBackgrounds()).toEqual(expected);
    expect(tokensCss.match(/--cover-\d+:/g)).toEqual(expected.map((name) => `${name}:`));
  });

  it('tokens.css declares all six reader presets', () => {
    for (const preset of READER_PRESETS) {
      expect(tokensCss).toContain(`[data-reader-theme='${preset}']`);
    }
  });

  it('every TOKEN_VALUES entry appears verbatim in tokens.css', () => {
    expect(missingDeclarations(tokensCss, declarations())).toEqual([]);
  });

  it('the forced dark block repeats the system dark block', () => {
    const media = blockBody(tokensRules, '@media (prefers-color-scheme: dark) {');
    const system = declarationLines(blockBody(media, SYSTEM_DARK));
    const forced = declarationLines(blockBody(tokensRules, FORCED_DARK));
    expect(system.length).toBeGreaterThan(0);
    expect(forced).toEqual(system);
  });

  it('theme blocks keep the specificity of :root', () => {
    expect(tokensRules).not.toContain(':root:not(');
    expect(tokensRules.match(/^\s*:root\S*\s*\{/gm)?.map((line) => line.trim())).toEqual([
      ':root {',
      SYSTEM_DARK,
      FORCED_DARK,
    ]);
    // Any other rule keyed on `data-theme` (e.g. `html[data-theme='dark']`) would outrank the presets.
    expect(
      tokensRules.match(/^[^{}\n]*data-theme[^{}\n]*\{/gm)?.map((line) => line.trim()),
    ).toEqual([SYSTEM_DARK, FORCED_DARK]);
  });

  it('reader presets come after the theme blocks', () => {
    const forcedDark = tokensRules.indexOf(FORCED_DARK);
    expect(forcedDark).toBeGreaterThan(-1);
    for (const preset of READER_PRESETS) {
      expect(tokensRules.indexOf(`[data-reader-theme='${preset}']`)).toBeGreaterThan(forcedDark);
    }
  });

  it('detects values that drift between TOKEN_VALUES and the CSS', () => {
    const css = ':root {\n  --foreground: #2a2724;\n}';
    expect(
      missingDeclarations(css, [
        ['--foreground', '#2A2724'],
        ['--background', '#fbf8f3'],
      ]),
    ).toEqual(['--background: #fbf8f3;']);
    expect(missingDeclarations(css, [['--foreground', '#2a2725']])).toEqual([
      '--foreground: #2a2725;',
    ]);
  });
});
