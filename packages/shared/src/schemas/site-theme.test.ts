import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_THEME, SITE_THEME_CHOICES, siteThemeSettingsSchema } from './site-theme';

describe('siteThemeSettingsSchema', () => {
  it.each(SITE_THEME_CHOICES)('accepts %s', (choice) => {
    expect(siteThemeSettingsSchema.parse({ choice, updatedAt: 5 })).toEqual({
      choice,
      updatedAt: 5,
    });
  });

  it('accepts the default', () => {
    expect(siteThemeSettingsSchema.safeParse(DEFAULT_SITE_THEME).success).toBe(true);
  });

  it('rejects an unknown choice', () => {
    expect(siteThemeSettingsSchema.safeParse({ choice: 'neon', updatedAt: 1 }).success).toBe(false);
  });

  it('rejects a negative, fractional or missing updatedAt', () => {
    expect(siteThemeSettingsSchema.safeParse({ choice: 'dark', updatedAt: -1 }).success).toBe(
      false,
    );
    expect(siteThemeSettingsSchema.safeParse({ choice: 'dark', updatedAt: 1.5 }).success).toBe(
      false,
    );
    expect(siteThemeSettingsSchema.safeParse({ choice: 'dark' }).success).toBe(false);
  });
});
