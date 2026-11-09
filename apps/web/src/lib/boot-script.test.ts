import { DEFAULT_READER_SETTINGS } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_HINT_KEY,
  type AccountHintRoot,
  applyAccountHint,
  parseAccountHint,
} from './account-hint';
import { BOOT_SCRIPT, MATURE_FLAG_KEY } from './boot-script';
import {
  READER_SETTINGS_KEY,
  type ReaderRoot,
  applyReaderSettings,
  parseStoredSettings,
} from './reader/settings';
import { SITE_THEME_KEY, applySiteTheme, parseStoredSiteTheme } from './site-theme/site-theme';

/** A fake `<html>` recording what was set on it. */
function fakeRoot() {
  const attributes: Record<string, string> = {};
  const styles: Record<string, string> = {};
  const root: ReaderRoot & AccountHintRoot = {
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    removeAttribute: (name) => {
      delete attributes[name];
    },
    style: {
      setProperty: (name, value) => {
        styles[name] = value;
      },
      removeProperty: (name) => {
        delete styles[name];
      },
    },
  };
  return { root, attributes, styles };
}

/** Runs the script against fake `window`/`document`; returns what it set on `<html>`. */
function run(getItem: (key: string) => string | null) {
  const { root, attributes, styles } = fakeRoot();
  const window = { localStorage: { getItem } };
  // Runs the static inline script the way the browser would, against the fakes.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const script = new Function('window', 'document', BOOT_SCRIPT) as (
    w: unknown,
    d: unknown,
  ) => void;
  script(window, { documentElement: root });
  return { attributes, styles };
}

function runWithReader(raw: string | null) {
  return run((key) => (key === READER_SETTINGS_KEY ? raw : null));
}

/** What the React side applies for the same stored value. */
function applied(raw: string | null) {
  const { root, attributes, styles } = fakeRoot();
  const settings = parseStoredSettings(raw);
  if (settings) applyReaderSettings(root, settings);
  return { attributes, styles };
}

function runWithTheme(raw: string | null) {
  return run((key) => (key === SITE_THEME_KEY ? raw : null));
}

/** What `applySiteTheme` sets for the same stored value. */
function appliedTheme(raw: string | null) {
  const { root, attributes, styles } = fakeRoot();
  applySiteTheme(root, parseStoredSiteTheme(raw)?.choice ?? 'system');
  return { attributes, styles };
}

function runWithAccount(raw: string | null) {
  return run((key) => (key === ACCOUNT_HINT_KEY ? raw : null));
}

/** What `applyAccountHint` sets for the same stored value. */
function appliedAccount(raw: string | null) {
  const { root, attributes, styles } = fakeRoot();
  applyAccountHint(root, parseAccountHint(raw));
  return { attributes, styles };
}

const account = (patch: Record<string, unknown>) => JSON.stringify(patch);

const ACCOUNT_FIXTURES: Array<[string, string | null]> = [
  ['nothing stored', null],
  ['letter and rows', account({ initial: 0x110, continueRows: 2 })],
  ['letter outside the BMP', account({ initial: 0x1f600, continueRows: 3 })],
  ['no rows', account({ initial: 65, continueRows: 0 })],
  ['too many rows', account({ initial: 65, continueRows: 4 })],
  ['rows as a string', account({ initial: 65, continueRows: '2' })],
  ['fractional values', account({ initial: 65.5, continueRows: 1.5 })],
  ['a control character', account({ initial: 10 })],
  ['past the last code point', account({ initial: 0x110000 })],
  ['an infinite number', '{"initial":1e400}'],
  ['CSS injection attempt', account({ initial: '"; display:none; content:"' })],
  ['an empty object', '{}'],
  ['broken JSON', '{"initial":'],
  ['a JSON array', '[65]'],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

const theme = (choice: unknown, updatedAt: unknown = 1) => JSON.stringify({ choice, updatedAt });

const THEME_FIXTURES: Array<[string, string | null]> = [
  ['nothing stored', null],
  ['ivory', theme('ivory')],
  ['dark', theme('dark')],
  ['system', theme('system')],
  ['dark with a broken updatedAt', theme('dark', 'soon')],
  ['unknown choice', theme('neon')],
  ['Object.prototype key', theme('toString')],
  ['attribute injection attempt', theme("dark'] body{display:none} [x='")],
  ['broken JSON', '{"choice":'],
  ['a JSON array', '["dark"]'],
  ['a bare string', '"dark"'],
  ['JSON null', 'null'],
];

const json = (patch: Record<string, unknown>) =>
  JSON.stringify({ ...DEFAULT_READER_SETTINGS, ...patch });

const FIXTURES: Array<[string, string | null]> = [
  ['nothing stored', null],
  ['defaults', json({})],
  [
    'every field changed',
    json({
      theme: 'oled-black',
      font: 'noto-serif',
      fontSize: 24,
      lineHeight: 2.2,
      paragraphSpacing: 1.75,
      width: 'wide',
      align: 'justify',
    }),
  ],
  ['lower bounds', json({ fontSize: 14, lineHeight: 1.5, paragraphSpacing: 0, width: 'narrow' })],
  ['upper bounds', json({ fontSize: 28, lineHeight: 2.2, paragraphSpacing: 2 })],
  ['float step', json({ lineHeight: 1.7 })],
  ['out of range', json({ fontSize: 13, lineHeight: 2.25, paragraphSpacing: 3 })],
  ['off a step', json({ fontSize: 18.5, paragraphSpacing: 0.3 })],
  ['numbers as strings', json({ fontSize: '24', lineHeight: '2' })],
  ['legacy font inter', json({ font: 'inter' })],
  ['legacy font be-vietnam-pro', json({ font: 'be-vietnam-pro' })],
  ['Object.prototype key as font', json({ font: 'toString' })],
  [
    'unknown enum values',
    json({ theme: 'neon', font: 'comic-sans', width: 'huge', align: 'center' }),
  ],
  [
    'CSS injection attempt',
    json({ theme: "sepia'] body{display:none} [x='", fontSize: '1px;display:none' }),
  ],
  ['unknown and missing fields', JSON.stringify({ theme: 'sepia', extra: 1 })],
  ['broken JSON', '{"theme":'],
  ['a JSON array', '["sepia"]'],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

describe('BOOT_SCRIPT', () => {
  it('marks <html> when the 18+ flag is set', () => {
    expect(run((key) => (key === MATURE_FLAG_KEY ? '1' : null)).attributes).toEqual({
      'data-mature-ok': '',
    });
  });

  it('leaves <html> alone without anything stored', () => {
    expect(run(() => null)).toEqual({ attributes: {}, styles: {} });
  });

  it('does not throw when storage is blocked', () => {
    expect(
      run(() => {
        throw new Error('SecurityError');
      }),
    ).toEqual({ attributes: {}, styles: {} });
  });

  it('applies stored reader settings', () => {
    expect(runWithReader(json({ theme: 'sepia', fontSize: 24 }))).toEqual({
      attributes: {
        'data-reader-theme': 'sepia',
        'data-reader-font': 'source-serif-4',
        'data-reader-width': 'medium',
        'data-reader-align': 'left',
      },
      styles: {
        '--reader-font-size': '24px',
        '--reader-line-height': '1.8',
        '--reader-paragraph-gap': '1em',
      },
    });
  });

  it('maps a legacy font to its replacement', () => {
    expect(runWithReader(json({ font: 'be-vietnam-pro' })).attributes['data-reader-font']).toBe(
      'plus-jakarta-sans',
    );
  });

  it('keeps the 18+ hint when the reader settings are broken', () => {
    const result = run((key) => (key === MATURE_FLAG_KEY ? '1' : '{broken'));
    expect(result.attributes).toEqual({ 'data-mature-ok': '' });
  });

  it.each(FIXTURES)('%s: gives the same result as applyReaderSettings', (_, raw) => {
    expect(runWithReader(raw)).toEqual(applied(raw));
  });

  it('marks a browser last signed in, with the avatar letter as a hex escape', () => {
    expect(runWithAccount(account({ initial: 0x110, continueRows: 2 }))).toEqual({
      attributes: { 'data-signed-in': '', 'data-continue-rows': '2' },
      styles: { '--account-initial': '"\\110 "' },
    });
  });

  it.each(ACCOUNT_FIXTURES)(
    'account hint, %s: gives the same result as applyAccountHint',
    (_, raw) => {
      expect(runWithAccount(raw)).toEqual(appliedAccount(raw));
    },
  );

  it('a broken account hint keeps the site theme', () => {
    const result = run((key) =>
      key === ACCOUNT_HINT_KEY ? '{broken' : key === SITE_THEME_KEY ? theme('dark') : null,
    );
    expect(result).toEqual({ attributes: { 'data-theme': 'dark' }, styles: {} });
  });

  it.each(THEME_FIXTURES)('site theme, %s: gives the same result as applySiteTheme', (_, raw) => {
    expect(runWithTheme(raw)).toEqual(appliedTheme(raw));
  });

  it('a broken site theme keeps the 18+ hint and the reader settings', () => {
    const reader = json({ theme: 'sepia' });
    const result = run((key) =>
      key === MATURE_FLAG_KEY
        ? '1'
        : key === SITE_THEME_KEY
          ? '{broken'
          : key === READER_SETTINGS_KEY
            ? reader
            : null,
    );
    expect(result).toEqual({
      attributes: { 'data-mature-ok': '', ...applied(reader).attributes },
      styles: applied(reader).styles,
    });
  });

  it('broken reader settings keep the site theme', () => {
    const result = run((key) => (key === SITE_THEME_KEY ? theme('dark') : '{broken'));
    expect(result).toEqual({ attributes: { 'data-theme': 'dark' }, styles: {} });
  });

  it('applies the site theme together with the reader settings', () => {
    const reader = json({ theme: 'oled-black' });
    const result = run((key) =>
      key === SITE_THEME_KEY ? theme('ivory') : key === READER_SETTINGS_KEY ? reader : null,
    );
    expect(result.attributes).toEqual({ 'data-theme': 'ivory', ...applied(reader).attributes });
  });

  it('stays small enough to inline in every page', () => {
    expect(BOOT_SCRIPT.length).toBeLessThan(2048);
  });
});
