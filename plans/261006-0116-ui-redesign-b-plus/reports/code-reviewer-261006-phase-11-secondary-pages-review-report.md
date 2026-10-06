# Code review: phase 11, secondary pages (uncommitted working tree)

## Scope
- 24 modified files and 8 new ones under `apps/web` (+254/-488 tracked, plus about 600 new LOC). Reviewed `git diff` plus the untracked files.
- Moved code was compared against `HEAD` line by line: `report-card.tsx` to `report-actions.ts` / `report-target-context.tsx`, and `MatureSetting`.
- Gate run by me: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm format:check` 0, `pnpm test` 104 files / 693 tests pass. I did not run e2e or int tests (the tester owns those).

## Acceptance criteria (Success Criteria in phase file)
| Check | Result |
| --- | --- |
| Line counts for the 4 split files and every new file ≤ 200 | PASS: settings 117, moderation 160, report-card 137, story-form 197, mature-setting 102, report-actions 107 (+ test 146), report-target-context 105, tab-links 48, page-shell 36, segmented 28 |
| `rg -l font-serif --glob '*.tsx'` only lists content/brand files | PASS: the 9 allowed files plus 2 tests that assert `not.toContain('font-serif')` (`page-shell.test.tsx`, existing `story-cover.test.tsx`). Every hit is a content element |
| `status === 'published' ? 'default'` | PASS (no matches) |
| `\bSTATUS_LABELS\b\|SegmentedLinks` | PASS (no matches) |
| `max-w-(sm\|xl\|2xl\|3xl\|5xl\|6xl)` in the secondary pages | PASS: remaining hits are `write/index.tsx` (empty-state text, out of scope), reader top bar and sheet |
| `packages/` unchanged; routes, URLs and head unchanged | PASS (`git status packages` is empty; no `head`, `loader`, `createFileRoute` path or `seo()` edits) |
| No new i18n keys | PASS |

## Business-logic regressions (b): none found
- **report-actions.ts**: verbatim apart from `export` keywords and Prettier wrapping. `ACTION_LABELS`, `CardAction`, `storyActions`, `userActions`, `Viewer`, `canActOn` and `actionsFor` behave the same. `ReportCard.run` / `button` are byte-identical apart from class changes. The ban `ConfirmDialog` and the destructive/outline variant logic are intact.
- **report-target-context.tsx**: same structure and links (`canonicalPath`). Only badge variants changed (hidden → `destructive`, draft/deleted → `muted`, scheduled/muted → `warning`), and a `TargetLabel` helper was extracted. Open report badge → `warning`, as required.
- **MatureSetting**: verbatim apart from the section and h2 classes. The confirm flow, `patch.reset()`, the dialog lock while pending, and the `showMature: true, confirmAdult: true` payload are intact.
- **story-form**: `STORY_STATUS_LABELS` maps the same three keys to the same messages, so the "Hoàn thành" option is unchanged.
- **tag-picker**: `checked` / `disabled={!checked && full}` / `onCheckedChange` are unchanged. Radix `Checkbox` stays `role=checkbox` with an accessible name from `<Label htmlFor>`. The checkbox sits at `relative z-10` above the label's `after:inset-0` overlay, so Playwright `.check()` and pointer clicks on the box both land on it. I verified the cascade by compiling with Tailwind 4.3.3: `has-[[data-state=checked]]:bg-primary` comes after `hover:bg-secondary`, so a checked chip keeps its fill on hover, and `data-[state=checked]:border-primary-foreground` beats `focus-visible:border-ring`.
- **LibraryTabs**: still `<Link to="/library" search={{ shelf: tab, page: 1 }}>` with a manual `aria-current`. The `-mx-4 overflow-x-auto` scroller is kept on mobile.
- **TabLinks**: moved with the same signature, still `<Link to="/moderation" search={item.search}>` with `aria-current`. With `small`, the row uses `SEGMENTED_CHIP_LIST_CLASS` (`flex flex-wrap`); both filter rows (lines 110 and 120) pass `small`.
- **Auth**: `FormMessage` is still one `<p role=alert|status>` node, so the sign-in form has a single alert. The check icon is `aria-hidden`.

## Contracts (c): no breaks
- `ModerationSearch` is now `export type` from `routes/moderation.tsx`. It is type-only and erased at build, so route code splitting is unaffected.
- `Pagination` restyle (size `sm`, status pill) changes the look on `/tags`, `/search`, `/library` and `/moderation` together. Expected.

## Critical
None.

## High
None.

## Medium
1. **Invisible keyboard focus on checked tag chips** (`apps/web/src/components/tag-picker.tsx:22`, `:108`)
   - **Problem:** `Checkbox` shows focus with `focus-visible:ring-[3px] ring-ring`, and `--ring` is the same colour as `--primary` (`styles/tokens.css:19,34`). A checked chip is `bg-primary`, so a 3px #0e6b5b ring on a #0e6b5b chip cannot be seen (fails WCAG 2.4.7). Unchecked chips are fine.
   - **Fix:** put the ring on the chip itself, for example add `has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background` to `TAG_CHIP_CLASS`. Alternatively, pass `data-[state=checked]:focus-visible:ring-primary-foreground/60` to the Checkbox.
2. **Disabled chips fade twice** (`tag-picker.tsx:22`, with `ui/label.tsx` `peer-disabled:opacity-50` and `ui/checkbox.tsx` `disabled:opacity-50`)
   - **Problem:** the chip's `has-disabled:opacity-60` multiplies with the existing 0.5 on the label and checkbox, leaving text at about 0.3 opacity. Once 10 tags are selected, the unselected names become very hard to read. Disabled hover also still turns the chip `bg-secondary`.
   - **Fix:** drop `has-disabled:opacity-60` (the label and box already fade), or add `peer-disabled:opacity-100` on the Label. Add `has-disabled:hover:bg-card` (or `has-disabled:pointer-events-none` on the li).

## Low
1. **Layering**: `components/moderation/moderation-tab-links.tsx:2` imports a type from `@/routes/moderation`, so a component depends on a route file and creates a cycle. It works because the import is type-only, but consider moving `moderationSearchSchema` / `ModerationSearch` to `lib/moderation.ts`. Not urgent.
2. **`PageShell width="narrow" className="max-w-[720px]"`** (`routes/write/stories/new.tsx:20`, `$publicId/index.tsx:29`, `static-page.tsx:17`): "narrow" is used here only to be overridden. That works through `cn`/twMerge and a test covers it, but the 720px "prose" width now appears 3 times. Consider a `width: 'prose'` option. This is a YAGNI call, so it is optional.
3. **`/moderation` at 1240px** (auto decision): report cards and the note textarea now stretch to the full grid on desktop; the old layout used `max-w-3xl` (768px). Line length for report detail text gets long. Consider `PageShell className="max-w-[960px]"` or a 2-column grid. Needs a user or design call.
4. **Tag kind badge** (`routes/tags.$tagSlug.tsx:69`): every kind uses the default (primary-soft) variant. `kind === 'warning'` could use `variant="warning"` to match how status badges are used elsewhere.
5. **Pagination touch target** (`story/pagination.tsx:19,32`): `size="sm"` (h-9, 36px) replaces the default h-11 (44px) on mobile. It still meets WCAG 2.5.8 (24px), but it is a small step down from the site's 44px rule for buttons.
6. **`pageCardClass` uses `rounded-3xl`** (`page-shell.tsx:5`): this is Tailwind's default `--radius-3xl` (1.5rem = 24px), which is outside the project scale in `app.css:58-63`, where 24px is `rounded-xl`. It matches existing `writer-gate` / `mature-gate` usage, so it is consistent, but `rounded-xl` would keep everything on the token scale.

## Edge cases checked
- `/library` at 360px: 5 tabs (about 400px) overflow inside the nav scroller (`overflow-x-auto`), not the document. The new e2e asserts this.
- Moderation main tabs (2 items) dropped the scroller wrapper; this is safe at 360px. The reason row (many items) wraps through `small`.
- The e2e that promotes a user to mod via direct DB `update users set role` follows the existing `moderation.spec.ts` pattern.
- `Pagination` still returns `null` when `totalPages <= 1`, so the pill never shows for a single page.
- Author initial uses `formatInitial` (grapheme-safe via `Array.from`) and is `aria-hidden`; the h1 still carries the name.

## Accessible names (e)
Preserved: regions "Truyện" / "Tác giả" (`SectionHeading` puts the `id` on the h2; the icon is `aria-hidden`), searchbox, heading "Kiểm duyệt" level 1, link "Đã xong", the library `main` h3 holds only story titles, `role=checkbox` in the tag picker, the 404 heading and link, the report `<article>` labelled by its reason h2, and the exact "Ẩn chương" button.

## Positive
- Splits are clean and verbatim, and `report-actions` has a solid unit test (roles, owner, statuses).
- Links stay typed and the decision against a shared tab component was respected.
- `cn`/twMerge overrides are covered by a test.
- No code comments reference the plan.

## Recommended actions
1. Fix Medium 1 (focus on checked chips). It is a one-line class change.
2. Fix Medium 2 (drop the double opacity).
3. Optionally, Low 1 (move the type out of the route) and Low 3 (needs a user call).

## Unresolved questions
- `/moderation` width: keep 1240px (auto decision) or cap it around 960px for readable report text?
- Pagination prev/next shrinking from 44px to 36px: accepted as the new pill size?

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 11 meets every rg/size criterion, typecheck/lint/format/unit tests are green, and the moved moderation and settings logic is verbatim with no contract changes. Two Medium a11y issues in the tag-picker chip styling.
**Concerns/Blockers:** On checked tag chips, keyboard focus is invisible because the ring and the fill are both `--primary`. Disabled chips stack opacity to about 0.3. Both are fixable in `tag-picker.tsx:22` without touching logic.
