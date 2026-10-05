# Code review: phase 1 "Tokens và font"

## Scope
- Files: 19 modified + 1 new (`apps/web/src/styles/token-contrast-pairs.ts`), ~366+/184-
- Focus: uncommitted diff on `overnight/261006`
- Checked against: `phase-01-tokens-va-font.md` (requirements, checklist, success criteria), brainstorm final §2.1–2.4, §3
- Re-ran myself: web vitest `src/styles`, `boot-script`, `reader/settings` (56 pass); shared `src/schemas` (88 pass); prettier on all changed files (clean); success-criteria greps

## Overall
Clean, well-scoped change. Every hex value matches brainstorm exactly (light, dark, cover, 6 presets + `--reader-card`, `--reader-primary*`). Legacy font migration is consistent across Zod, `BOOT_SCRIPT`, and CSS, and it is prototype-safe. Contrast tests now cover every scope. One real unintended side effect: `body` 500 weight leaks into long-form serif text (M1).

## Critical
None.

## High
None.

## Medium

**M1. `body font-medium` makes chapter text and editor text weight 500.** `app.css:72` sets `font-medium` on `body`. Long-form containers never reset the weight, so they inherit 500:
- reading page: `.reader-column` / `.reader-content` (`reader.css:26-32`, `chapter-content.tsx:26`)
- editor: `.chapter-editor-content` (`app.css:88-`, `chapter-editor.tsx:465`)
- revision preview: `.chapter-preview-content` (`revision-history-sheet.tsx:133`)

Source Serif 4, Literata and Noto Serif are all variable `wght` fonts, so this renders as true medium, not the 400 used before. The phase file says the reading area and editor are "not affected because they have their own size". That holds for size only, not weight. Brainstorm §3 sets 15/500 for the UI scale and gives no reading weight. Inline `<strong>` stays at 700 (`bolder` from 500 gives 700), so the gap between body text and emphasis shrinks from 400→700 to 500→700. No test checks weight, which is why the gate stays green.
Fix (CSS only, no component change):
```css
/* reader.css */
.reader-column { font-weight: 400; }
/* app.css */
.chapter-editor-content, .chapter-preview-content { font-weight: 400; }
```
If medium reading text is actually intended, record that in the plan instead.

## Low / informational

- **L1. `hc` input type loosens for `reader.font`.** Zod 4 `z.preprocess` has input type `unknown`, so `api.v1.me.preferences.$patch({ json })` no longer checks `reader.font` at compile time (`reader.ts:108`). Current caller `lib/preferences.ts:19` types its argument as `PreferencesPatch` (output type), so nothing is lost today. Runtime validation is unchanged. To keep the input typed, an alternative is `z.enum([...READER_FONTS, 'be-vietnam-pro', 'inter']).transform(...)`. Accepting as is is fine.
- **L2. The legacy CSS selectors can never match.** `reader.css:46-50` targets `be-vietnam-pro` and `inter`, but both writers (`BOOT_SCRIPT`, `applyReaderSettings` via the schema) map these values before setting `data-reader-font`. This is harmless, the plan requires it, and the comment describes it correctly.
- **L3. Radius scale changes existing components immediately.** `rounded-sm` goes from 4px to 8px (`dropdown-menu.tsx:61,79,110,182`, `select.tsx:100`), and `rounded-xs` goes from 2px to 6px (`sheet.tsx:70`, `dialog.tsx:65`). The plan risk table accepts this, and later phases update the components.
- **L4. Docs are stale.** `docs/design-guidelines.md:18,47,50,52,72` still mention `--radius`, Be Vietnam Pro and `--font-reader-inter`. Phase 12 handles this.
- **L5. Stored legacy values stay in the DB.** Rows in `users.preferences.reader` keep `font: 'inter'` until the next PATCH. They are mapped on every read (`core/users/preferences.ts` parses through `userPreferencesSchema`). `pickNewer` sees equal `updatedAt`, so nothing is written back. Acceptable: no migration needed.
- **Intended deviation from brainstorm.** Brainstorm §2.3 says each preset overrides `--primary`. The plan (Red Team) replaced this with `--reader-primary*` plus the `.reader-page` remap. The implementation follows the plan, and a test enforces it (`tokens.test.ts` "reader presets never override the site accent").

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| Hex §2.1 light/dark, §2.2 cover + `--cover-fg #f6f1e7`, §2.3 six presets + `--reader-card` | Met. Checked each value by hand in `tokens.css` and `token-values.ts`, block by block. |
| `--reader-card` in `:root` light (`#f3ecdd`), dark (`#363636`), and 6 presets | Met (8 occurrences) |
| `--reader-primary*` in `:root` light/dark and every preset; presets do not set `--primary` | Met. `--primary:` appears only at `tokens.css:19` and `:81`. |
| `.reader-page` remaps `--primary`, `--primary-foreground`, `--primary-soft`, `--ring` | Met (`reader.css:14-19`). `@theme inline` means `bg-primary` resolves at the element, so the remap takes effect. |
| `READER_CONTRAST_PAIRS` checked in every scope | Met (`tokens.test.ts:45-50`) |
| §2.4 pairs + card/input, card/ring | Met (`token-contrast-pairs.ts`) |
| `READER_FONTS` order, default `source-serif-4`, legacy map, `Object.hasOwn` | Met |
| `userPreferencesSchema.reader` keeps a legacy font | Met (preferences.test) |
| Boot script maps legacy fonts before the allowlist; `typeof` guard; `toString` fixture; parity test | Met. Length assert still passes. |
| Preload exactly 4 files with crossorigin | Met (e2e asserts length 4) |
| body 15/500, no `--text-*` scale | Met, with side effect M1 |
| Only 4 font packages, pinned 5.3.0 | Met |
| Legacy-name grep only in `LEGACY_READER_FONTS` and the commented CSS selectors | Met (src). Docs remain (phase 12). |
| Code files ≤ 200 lines | Met (largest: `tokens.css` 173) |
| Removed vars `--radius`, `--font-reader-inter` have no remaining users | Met (src grep empty) |
| No plan refs or phase numbers in code comments; comments in English | Met |
| `format:check` | Changed files clean. Failures come only from git-ignored `project.inlang/{.meta.json,README.md}` (ignored by `project.inlang/.gitignore:18`). They predate this change. |

## Touchpoint regression check
- `settings.ts` `field(shape.font, …)`: `ZodType<T>` with default input `unknown` accepts the preprocess schema; tests pass.
- `preferences.ts` `.optional().catch(undefined)`: a legacy font is mapped and not dropped; tested.
- API `me` PATCH and GET: output types unchanged. Input loosening noted in L1.
- `applyReaderSettings` and `BOOT_SCRIPT` parity: the fixtures cover `inter`, `be-vietnam-pro` and `toString`.
- `[data-reader-theme]` vs `@media dark :root`: same specificity, and the presets come later in the file, so presets win. Unchanged.
- `MatureGate` sits inside `.reader-page` on `bg-reader-bg`, so its ring is now `--reader-primary`, which passes contrast. Better than before.

## Recommended actions
1. Fix M1: reset `font-weight: 400` on the reading column and the editor/preview content, or confirm with the user that 500 reading weight is intended.
2. Optional: L1 alternative if `hc` input typing matters for future consumers.

## Unresolved questions
- Is medium (500) weight for chapter and editor text intended? Brainstorm defines only UI body 15/500.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 1 meets every acceptance criterion: all hex values match brainstorm, the legacy font migration is consistent across Zod, boot script and CSS, and contrast is tested in every scope. No critical or high issues.
**Concerns:** M1. Body `font-medium` is inherited by chapter text, editor and revision preview (serif at weight 500). This is a likely unintended visual change that no test catches. The fix is two CSS lines.
