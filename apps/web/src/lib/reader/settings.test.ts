import { DEFAULT_READER_SETTINGS, type ReaderSettings } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import {
  READER_SETTINGS_KEY,
  parseStoredSettings,
  pickNewer,
  readLocalSettings,
  writeLocalSettings,
} from './settings';

const at = (updatedAt: number): ReaderSettings => ({ ...DEFAULT_READER_SETTINGS, updatedAt });

describe('parseStoredSettings', () => {
  it('returns null when nothing usable is stored', () => {
    for (const raw of [null, '', '{', '[]', '42', 'null', '"text"']) {
      expect(parseStoredSettings(raw), String(raw)).toBeNull();
    }
  });

  it('keeps valid fields and replaces each invalid one with its default', () => {
    const raw = JSON.stringify({ theme: 'sepia', fontSize: 99, font: 'inter', updatedAt: 'x' });
    expect(parseStoredSettings(raw)).toEqual({
      ...DEFAULT_READER_SETTINGS,
      theme: 'sepia',
      // A font removed from the list is mapped to its replacement, not reset to the default.
      font: 'plus-jakarta-sans',
    });
  });
});

describe('readLocalSettings / writeLocalSettings', () => {
  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const settings = { ...at(5), theme: 'dark-gray' as const };
    writeLocalSettings(storage, settings);
    expect(store.has(READER_SETTINGS_KEY)).toBe(true);
    expect(readLocalSettings(storage)).toEqual(settings);
  });

  it('treats blocked storage as nothing stored and never throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readLocalSettings(blocked)).toBeNull();
    expect(() => writeLocalSettings(blocked, at(1))).not.toThrow();
  });
});

describe('pickNewer', () => {
  it('nothing on either side → none', () => {
    expect(pickNewer(null, null)).toBe('none');
  });

  it('only one side → that side', () => {
    expect(pickNewer(at(1), null)).toBe('local');
    expect(pickNewer(null, at(1))).toBe('server');
  });

  it('the more recent copy wins', () => {
    expect(pickNewer(at(2), at(1))).toBe('local');
    expect(pickNewer(at(1), at(2))).toBe('server');
  });

  it('equal times → none', () => {
    expect(pickNewer(at(3), at(3))).toBe('none');
  });
});
