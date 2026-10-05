import { DEFAULT_READER_SETTINGS } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { BOOT_SCRIPT, MATURE_FLAG_KEY } from './boot-script';
import {
  READER_SETTINGS_KEY,
  type ReaderRoot,
  applyReaderSettings,
  parseStoredSettings,
} from './reader/settings';

/** A fake `<html>` recording what was set on it. */
function fakeRoot() {
  const attributes: Record<string, string> = {};
  const styles: Record<string, string> = {};
  const root: ReaderRoot = {
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

const json = (patch: Record<string, unknown>) =>
  JSON.stringify({ ...DEFAULT_READER_SETTINGS, ...patch });

const FIXTURES: Array<[string, string | null]> = [
  ['nothing stored', null],
  ['defaults', json({})],
  [
    'every field changed',
    json({
      theme: 'oled-black',
      font: 'inter',
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
        'data-reader-font': 'literata',
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

  it('keeps the 18+ hint when the reader settings are broken', () => {
    const result = run((key) => (key === MATURE_FLAG_KEY ? '1' : '{broken'));
    expect(result.attributes).toEqual({ 'data-mature-ok': '' });
  });

  it.each(FIXTURES)('%s: gives the same result as applyReaderSettings', (_, raw) => {
    expect(runWithReader(raw)).toEqual(applied(raw));
  });

  it('stays small enough to inline in every page', () => {
    expect(BOOT_SCRIPT.length).toBeLessThan(1536);
  });
});
