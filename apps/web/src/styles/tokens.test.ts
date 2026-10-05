import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COVER_PALETTE_SIZE } from '../lib/cover-palette';
import { contrastViolations } from '../lib/contrast';
import {
  CONTRAST_PAIRS,
  COVER_CONTRAST_PAIRS,
  READER_CONTRAST_PAIRS,
} from './token-contrast-pairs';
import { READER_PRESETS, TOKEN_VALUES, coverBackgrounds, resolvedScopes } from './token-values';

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Every `--name: #hex;` declaration listed in `TOKEN_VALUES`. */
function declarations(): Array<[string, string]> {
  const scopes = [
    TOKEN_VALUES.light,
    TOKEN_VALUES.dark,
    TOKEN_VALUES.cover,
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
