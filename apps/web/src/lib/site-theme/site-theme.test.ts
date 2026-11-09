import { describe, expect, it } from 'vitest';
import {
  SITE_THEME_KEY,
  type ThemeRoot,
  applySiteTheme,
  isSiteThemeChoice,
  parseStoredSiteTheme,
  readLocalSiteTheme,
  writeLocalSiteTheme,
} from './site-theme';

/** A fake `<html>` recording its attributes. */
function fakeRoot(initial: Record<string, string> = {}) {
  const attributes: Record<string, string> = { ...initial };
  const root: ThemeRoot = {
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    removeAttribute: (name) => {
      delete attributes[name];
    },
  };
  return { root, attributes };
}

describe('isSiteThemeChoice', () => {
  it.each(['system', 'ivory', 'dark'])('%s → true', (value) => {
    expect(isSiteThemeChoice(value)).toBe(true);
  });

  it.each([['neon'], ['toString'], ['__proto__'], [1], [null], [undefined]])(
    '%s → false',
    (value) => {
      expect(isSiteThemeChoice(value)).toBe(false);
    },
  );
});

describe('applySiteTheme', () => {
  it('ivory and dark set data-theme', () => {
    const { root, attributes } = fakeRoot();
    applySiteTheme(root, 'ivory');
    expect(attributes).toEqual({ 'data-theme': 'ivory' });
    applySiteTheme(root, 'dark');
    expect(attributes).toEqual({ 'data-theme': 'dark' });
  });

  it('system removes data-theme so the OS setting decides', () => {
    const { root, attributes } = fakeRoot({ 'data-theme': 'dark', lang: 'vi' });
    applySiteTheme(root, 'system');
    expect(attributes).toEqual({ lang: 'vi' });
  });
});

describe('parseStoredSiteTheme', () => {
  it.each([
    ['nothing stored', null],
    ['broken JSON', '{"choice":'],
    ['a JSON array', '["dark"]'],
    ['a JSON number', '42'],
    ['JSON null', 'null'],
    ['a bare string', '"dark"'],
    ['an unknown choice', JSON.stringify({ choice: 'neon', updatedAt: 1 })],
    ['an Object.prototype key', JSON.stringify({ choice: 'toString', updatedAt: 1 })],
    ['no choice', JSON.stringify({ updatedAt: 1 })],
  ])('%s → null', (_, raw) => {
    expect(parseStoredSiteTheme(raw)).toBeNull();
  });

  it('a valid value', () => {
    expect(parseStoredSiteTheme(JSON.stringify({ choice: 'dark', updatedAt: 9 }))).toEqual({
      choice: 'dark',
      updatedAt: 9,
    });
  });

  it.each([
    ['missing', undefined],
    ['negative', -1],
    ['a string', '9'],
    ['fractional', 1.5],
  ])('a valid choice with %s updatedAt → updatedAt 0', (_, updatedAt) => {
    expect(parseStoredSiteTheme(JSON.stringify({ choice: 'ivory', updatedAt }))).toEqual({
      choice: 'ivory',
      updatedAt: 0,
    });
  });

  it('ignores extra fields', () => {
    expect(
      parseStoredSiteTheme(JSON.stringify({ choice: 'system', updatedAt: 2, extra: true })),
    ).toEqual({ choice: 'system', updatedAt: 2 });
  });
});

describe('local storage', () => {
  it('round-trips through the storage key', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    writeLocalSiteTheme(storage, { choice: 'dark', updatedAt: 4 });
    expect(data.has(SITE_THEME_KEY)).toBe(true);
    expect(readLocalSiteTheme(storage)).toEqual({ choice: 'dark', updatedAt: 4 });
  });

  it('blocked storage reads as nothing stored and never throws on write', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readLocalSiteTheme(blocked)).toBeNull();
    expect(() => writeLocalSiteTheme(blocked, { choice: 'dark', updatedAt: 1 })).not.toThrow();
  });
});
