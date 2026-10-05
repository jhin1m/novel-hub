import { describe, expect, it } from 'vitest';
import { preferencesPatchSchema, userPreferencesSchema } from './preferences';
import { DEFAULT_READER_SETTINGS } from './reader';

describe('userPreferencesSchema', () => {
  it('an empty object (the DB default) → showMature off, no reader settings', () => {
    expect(userPreferencesSchema.parse({})).toEqual({ showMature: false });
  });

  it('keeps a value that was turned on', () => {
    expect(userPreferencesSchema.parse({ showMature: true })).toEqual({ showMature: true });
  });

  it('rejects a wrong type', () => {
    expect(userPreferencesSchema.safeParse({ showMature: 'yes' }).success).toBe(false);
  });

  it('keeps valid reader settings', () => {
    const reader = { ...DEFAULT_READER_SETTINGS, theme: 'sepia', updatedAt: 5 };
    expect(userPreferencesSchema.parse({ reader })).toEqual({ showMature: false, reader });
  });

  it('keeps stored reader settings that use a removed font, mapped to its replacement', () => {
    const reader = { ...DEFAULT_READER_SETTINGS, font: 'inter', updatedAt: 5 };
    expect(userPreferencesSchema.parse({ reader })).toEqual({
      showMature: false,
      reader: { ...reader, font: 'plus-jakarta-sans' },
    });
  });

  it('drops stored reader settings that no longer parse, keeping the rest', () => {
    expect(userPreferencesSchema.parse({ showMature: true, reader: { theme: 'neon' } })).toEqual({
      showMature: true,
      reader: undefined,
    });
  });
});

describe('preferencesPatchSchema', () => {
  it('accepts any subset of the fields', () => {
    expect(preferencesPatchSchema.safeParse({}).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ showMature: true, confirmAdult: true }).success).toBe(
      true,
    );
    expect(preferencesPatchSchema.safeParse({ reader: DEFAULT_READER_SETTINGS }).success).toBe(
      true,
    );
  });

  it('rejects unknown fields and invalid reader settings', () => {
    expect(preferencesPatchSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(
      preferencesPatchSchema.safeParse({ reader: { ...DEFAULT_READER_SETTINGS, fontSize: 40 } })
        .success,
    ).toBe(false);
  });
});
