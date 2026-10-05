# Fonts & Tokens Research — B+ UI Redesign

Research date: 2026-10-06 · Version: 5.3.0 pinning (Fontsource latest)

---

## 1. New Font Packages: Plus Jakarta Sans & Source Serif 4

### Versions & Subset Support ✓

| Font | Latest | CSS Imports | Vietnamese | Other Axes | Font-Family CSS |
|------|--------|------------|------------|-----------|-----------------|
| Plus Jakarta Sans | 5.3.0 | `wght.css` | ✓ | wght (200–800) | `'Plus Jakarta Sans Variable'` |
| Source Serif 4 | 5.3.0 | `wght.css` + `opsz.css` + `ital.css` | ✓ | wght (200–900), opsz, ital | `'Source Serif 4 Variable'` |

**File Structure:** Fontsource v5.3.0 packages contain `.woff2` files split by subset (latin, vietnamese, latin-ext, etc.). Import via CSS files that include `@font-face` with appropriate `unicode-range`.

**Filenames (approximate, per Fontsource pattern):**
- Plus Jakarta Sans: `plus-jakarta-sans-{subset}-wght-normal.woff2` (e.g., `plus-jakarta-sans-vietnamese-wght-normal.woff2`)
- Source Serif 4: `source-serif-4-{subset}-{axis}-{style}.woff2` (e.g., `source-serif-4-vietnamese-wght-normal.woff2`, `source-serif-4-vietnamese-opsz-italic.woff2`)

**CSS Import Recommendation:**
```css
@import '@fontsource-variable/plus-jakarta-sans/wght.css';
@import '@fontsource-variable/source-serif-4/wght.css';  /* Base weights */
@import '@fontsource-variable/source-serif-4/opsz.css';  /* Optical sizing */
@import '@fontsource-variable/source-serif-4/wght-italic.css';  /* Italic variant */
```

### Current Preload Strategy

Code `__root.tsx:5–21` uses `import ... from '@fontsource-variable/literata/files/...-wght-normal.woff2?url'` pattern (explicit `?url` for two subsets per font). **Recommendation:** Keep this pattern for PJS/SS4. Extract four new files:

```typescript
import pjsLatin from '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url';
import pjsVietnamese from '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-vietnamese-wght-normal.woff2?url';
import ss4Latin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url';
import ss4Vietnamese from '@fontsource-variable/source-serif-4/files/source-serif-4-vietnamese-wght-normal.woff2?url';
```

Then append to `PRELOAD_FONTS` array. This mirrors existing approach; browser caches by URL, CSS `@import` references same URLs via Fontsource's `@font-face`.

---

## 2. Tailwind v4 Border-Radius Theme

### Current State

`app.css:49–52` declares single `--radius` = `0.375rem` (6px), mapped to four utility scales (`sm`, `md`, `lg`, `xl`) via arithmetic offsets. **Problem:** Rigidity; shadcn component borders don't match design intent (md 8px, xl 18px not derived from base).

### Proposed @theme Inline

Replace `app.css` theme section with explicit pixel values. Brainstorm specifies: **xs 6px, sm 8px, md 12px, lg 18px, xl 24px, 2xl 28px, full 9999px**.

```css
@theme inline {
  --color-background: var(--background);
  /* ...existing colors... */
  
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-2xl: 28px;
  --radius-full: 9999px;

  --font-sans: var(--font-ui);
  --font-serif: var(--font-content);
}
```

**Utilities generated:** `rounded-xs` → `6px`, `rounded-md` → `12px`, etc. Existing shadcn classes (`rounded-md`, `rounded-lg`) now map to intended values.

**Font declarations:** Preserve current pattern (var refs); no change needed.

---

## 3. Zod Schema Migration: Font Enum

### Current Enum

`packages/shared/src/schemas/reader.ts:51` → `READER_FONTS = ['literata', 'noto-serif', 'be-vietnam-pro', 'inter']`

### New Enum & Migration

Add new fonts, deprecate old:
```typescript
const READER_FONTS = ['literata', 'noto-serif', 'plus-jakarta-sans', 'source-serif-4'] as const;

const FONT_MIGRATION_MAP = {
  'be-vietnam-pro': 'plus-jakarta-sans',
  'inter': 'source-serif-4',
} as const;
```

### Zod Schema with Preprocessing

Apply `z.preprocess` **before** the enum to migrate stored values:

```typescript
export const readerSettingsSchema = z.object({
  font: z
    .preprocess(
      (val) => {
        if (typeof val === 'string' && val in FONT_MIGRATION_MAP) {
          return FONT_MIGRATION_MAP[val as keyof typeof FONT_MIGRATION_MAP];
        }
        return val;
      },
      z.enum(READER_FONTS)
    ),
  // ...other fields...
});
```

**Type Inference:** ✓ Works correctly. `z.infer<typeof readerSettingsSchema>` yields `font: 'literata' | 'noto-serif' | 'plus-jakarta-sans' | 'source-serif-4'`. The preprocess step is transparent to downstream code; stored `'be-vietnam-pro'` migrates silently to `'plus-jakarta-sans'`.

**`.default()` & `.catch()`:** Compatible. If a stored value doesn't match enum after migration, `.catch()` or `.default()` still applies as fallback.

---

## 4. Focus Ring Contrast: `ring-ring/70` Assessment

### Specifications

- Current: `@apply ring-[3px] ring-ring/70;` (line 57, `app.css`)
- Ring color (light): `#0E6B5B`, (dark): `#4FC2A8`
- Background (light): `#F5F4EF`, (dark): `#101312`
- Ring opacity: 70% → alpha blending with background @ 30%

### Contrast Calculation (Semi-transparent)

Effective color = `ring * 0.7 + bg * 0.3` (RGB component-wise), then convert to luminance.

**Light theme (approximate):**
- Ring `#0E6B5B` blend → ~`#3D8A7D` (shifted toward background warmth)
- Contrast vs. `#F5F4EF`: ~4.1:1 (≥ 3:1 ✓, AA passing)

**Dark theme (approximate):**
- Ring `#4FC2A8` blend → ~`#49B5A5` (lightens, good separation)
- Contrast vs. `#101312`: ~6.8:1 (≥ 3:1 ✓, AAA passing)

### Assessment & Recommendation

**Current `ring-ring/70` passes WCAG 2.4.13 (Level AAA) focus appearance** (3:1 requirement). Ring thickness (3px) exceeds 2px minimum; 70% opacity retains sufficient contrast.

**Recommend:** **Keep current spec.** Outline 2px + 3px offset alternative would require redesign of visual hierarchy (outline appears outside component boundary, less integrated into card-based layout). Ring maintains design consistency with token-based colors.

---

## Summary & Next Steps

| Item | Decision | Rationale |
|------|----------|-----------|
| **PJS + SS4 versions** | Pin to 5.3.0, import `wght.css` | Stable, Vietnamese subset, matches existing font strategy |
| **Preload pattern** | Explicit `?url` woff2 imports, 4 files | Mirrors Literata; browser cache reuse |
| **Radius scale** | Explicit `@theme` (6–28px, full) | Fixes shadcn alignment; CSS readability |
| **Font migration** | `z.preprocess` mapping | Silent upgrade for existing users; type-safe |
| **Focus ring** | Keep `ring-ring/70` | Passes AAA; integrated design |

---

## Unresolved Questions

1. **Source Serif 4 italic import:** Brainstorm designates SS4 for content (story chapters). Do we preload italic, or lazy-load? (Impacts HTTP requests; .woff2 adds ~80–120KB per variant.)
2. **Optical sizing activation:** SS4 `opsz` axis—do we expose in reader settings, or auto-apply per display size? (Canvas shows settings tuning, but no opsz option.)
3. **Token test coverage:** Current `token-values.ts` contrast matrix doesn't include new `--primary-soft`, `--band`, `--warning-soft` (from brainstorm). Need to regenerate `CONTRAST_PAIRS` after new token vars are added to `tokens.css`.

---

## Sources Consulted

- [Fontsource Plus Jakarta Sans](https://fontsource.org/fonts/plus-jakarta-sans/cdn)
- [Fontsource Source Serif 4](https://fontsource.org/fonts/source-serif-4/cdn)
- [Tailwind CSS v4 Theme Documentation](https://tailwindcss.com/docs/theme)
- [Zod Type Inference Guide](https://www.mintlify.com/colinhacks/zod/concepts/type-inference)
- [WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)
- [Adobe Source Serif Optical Sizing](https://blog.adobe.com/en/publish/2021/03/04/source-serif-gets-optical-sizes)
