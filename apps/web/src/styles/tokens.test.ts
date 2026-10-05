import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastViolations } from '../lib/contrast';
import { CONTRAST_PAIRS, READER_PRESETS, TOKEN_VALUES, resolvedScopes } from './token-values';

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Every `--name: #hex;` declaration listed in `TOKEN_VALUES`. */
function declarations(): Array<[string, string]> {
  const scopes = [TOKEN_VALUES.light, TOKEN_VALUES.dark, ...Object.values(TOKEN_VALUES.reader)];
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
