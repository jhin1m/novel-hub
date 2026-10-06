# Code review: Phase 10, editor chương (giao diện)

Date: 2026-10-06 · Scope: uncommitted diff + untracked files in `apps/web` (editor components, 2 new lib hooks, route, mobile e2e).
Note: files were still being edited while this review ran (`publish-dialog.test.ts` became `word-meter.test.ts` + `word-meter.ts` at 00:46). The findings below match the tree as of about 00:48.

## Verdict

No critical or high issues. All 8 checks pass. There is 1 medium UX issue on phones and a few low items.

Checks run: `npx tsc --noEmit -p apps/web` passed (exit 0). `npx vitest run apps/web/src/components/editor` passed (2 files, 7 tests). `lint-boundaries.test.ts` passed (2 tests). I did not run lint, format or e2e, as instructed.

## Checklist

| # | Check | Result |
|---|---|---|
| a | Acceptance criteria | Met, apart from the deviations listed below. Header grid 64/68px, floating pill toolbar / bottom bar, 680px column, serif 18/20, title 26/36 bold, author-note card, banners (warning-soft+Clock, card+destructive+TriangleAlert, band), status dot tones, dialog 520 / bottom sheet, word meter `aria-hidden` with min marker, radio cards, `adaptive-right` + `lg:max-w-[560px]`, "Đang đăng" `variant=default`, focus corner 60%/40% |
| b | Hook/lib files unchanged | Yes. `git diff HEAD` is empty for `lib/{autosave,draft-mirror,chapters}.ts` and `use-{editor-autosave,chapter-publishing,revision-restore}.ts` |
| c | One DOM node each | Yes. Word count, pill and the chapter `isDesktop` gating all use the same `DESKTOP_QUERY` in `editor-header.tsx:123,129` and `chapter-editor.tsx:180`. `ChapterStatusBadge` appears once (`editor-header.tsx:119`). `SaveStatusText` appears once (header, or the focus corner from the early return at `editor-header.tsx:88`) |
| d | `dangerouslySetInnerHTML` | Only 3 files: `routes/__root.tsx`, `reader/chapter-content.tsx`, `editor/revision-preview.tsx:62`. `RevisionPreview` calls `useRevisionPreview` itself and has no `html` prop. The sanitize comment is kept |
| e | ≤ 200 lines | Yes. Largest: `chapter-editor.tsx` at exactly 200, `publish-dialog.tsx` 180, `revision-history-sheet.tsx` 166, `editor-toolbar.tsx` 161 |
| f | Accessible names | Kept. Radio label is exactly "Hẹn giờ", datetime label is "Giờ đăng", and the hint is `aria-describedby` (not a label), so substring `getByLabel` matches one control each. History trigger is `aria-label` "Lịch sử". Focus toggle uses `aria-label`. Back link: text on desktop, `aria-label` on phone. The toolbar left `<header>` but `banner` still holds "Nháp"/"Đã đăng"/"Hẹn giờ" |
| g | Tailwind conflicts | None break layout (details below) |
| h | Hooks | Correct (details below) |

## Medium

**M1. On phones the caret can end up hidden behind the fixed bottom toolbar while typing.** `chapter-editor.tsx:63-75`, `editor-toolbar.tsx:303-305`
- ProseMirror scrolls the caret into view with its default `scrollMargin` of 5px. That margin ignores the 53px fixed toolbar, which `useKeyboardOffset` also lifts above the keyboard.
- Result: when writing at the end of a chapter on a phone, the current line sits under the toolbar. `pb-20` on `<main>` does not help here, because the caret is scrolled relative to the visual viewport.
- On desktop the same applies at the top (68px header + 8px gap + ~56px toolbar). The header part existed before this phase.
- Fix: add `scrollMargin: { top: 140, bottom: 72 }` and `scrollThreshold` with the same values to `editorProps` in `useEditor`.
- `chapter-editor.tsx` is already at 200 lines, so the editor options may need to move into `chapter-editor-helpers.ts`.
- E2E does not cover this; check by hand on a real phone.

## Low

**L1. `max-md:px-0` on the History trigger never applies.** `revision-history-sheet.tsx:77`
- The `sm` size adds `has-[>svg]:px-3`. Its `:has(>svg)` selector has specificity (0,1,1), which beats the media-scoped `.max-md\:px-0` at (0,1,0).
- Result: the 36px-wide button gets 12px side padding and the 16px icon overflows its 12px content box. It still looks centred because of `justify-center`, so nothing visibly breaks.
- Fix: use `size="icon-sm"` on phones, or `max-md:has-[>svg]:px-0`.

**L2. Pinch-zoom lifts the toolbar.** `use-keyboard-offset.ts:16`
- While zoomed in, `innerHeight − vv.height − vv.offsetTop` is greater than 0 even with no keyboard, so the bar floats up.
- The handler also runs `setProperty` on `<html>` for every visual-viewport `scroll` event, which forces a style recalc each time.
- Acceptable as is. Optionally ignore the offset when `viewport.scale > 1` and throttle with rAF.

**L3. The phone dialog has no slide-from-bottom animation.** `publish-dialog.tsx:22-26`
- It keeps the dialog's `zoom-in-95` and `fade` animations.
- Layout is correct: twMerge keeps both `max-md:rounded-none` and `max-md:rounded-t-[28px]`, and v4 property order lets the longhand radius win. `max-md:top-auto/left-0/translate-*-0` override the base classes inside the media query.
- Cosmetic only.

**L4. The revision sheet is always 90dvh tall below `lg`.** `revision-history-sheet.tsx:85`
- `max-lg:h-[90dvh]` fixes the height, even when there are only 2 revisions. The base class already sets `max-h-[90dvh]`.
- This looks like a deliberate choice (no height jump when opening a preview). Flagging it only.

**L5. The chapter heading is very short at 360px for published chapters.** `editor-header.tsx:116`
- Actions take about 172px (History 36 + Focus 36 + "Cập nhật" ~92 + gaps), so "Chương 12" shrinks to about 35px and shows as "Ch…" next to the badge.
- This matches the spec (ellipsis). It is a visual trade-off, not a bug.

**L6. Test and function moved to a different file than the spec says.**
- The spec says `wordMeter` lives in `publish-dialog.tsx` and is tested in `publish-dialog.test.ts`. The code now has `word-meter.ts` and `word-meter.test.ts`.
- Likely reason: the node-env unit tests have no `@/` alias, and `publish-dialog.tsx` imports via `@/`. `save-status.tsx` switched to relative imports for the same reason, matching `status-badges.tsx` / `story-cover.tsx`.
- Fine. Update the phase file / test matrix.

## Details for (g) and (h)

### (g) Tailwind classes, all valid

- **Header grid** (`editor-header.tsx:23-27`):
  - v4 turns `_` into spaces in the arbitrary `grid-template-areas`, giving `'back title actions' 'back status actions'` on phones and 6 named areas from `md` up.
  - The `pill` and `words` areas are only rendered when `isDesktop`, so no implicit tracks appear on phones.
  - `minmax(0,…)` tracks plus `min-w-0`/`truncate` let the text shrink.
- **Dialog** (`publish-dialog.tsx:22-26`):
  - `max-w-none` / `sm:max-w-none` replace the base `max-w-[calc(100%-2rem)]` / `sm:max-w-lg`. `md:max-w-[520px]` restores the width from `md` up.
  - Radix `translate` (v4 `translate` property) and the tw-animate `transform` keyframes are separate properties, so they do not fight.
- **Toolbar** (`editor-toolbar.tsx:303-305`):
  - `fixed` and `md:sticky` coexist.
  - `md:bottom-auto` and `md:inset-x-auto` cancel the phone positioning.
  - `size-10` replaces the `icon` size's `size-11`.
  - `aria-pressed:` matches `[aria-pressed="true"]`, and buttons that are not toggles get no attribute.
- **Sheet**: `lg:max-w-[560px]` replaces `lg:max-w-sm` from `ADAPTIVE_BASE`, and `gap-0` replaces `gap-4`.
- **Schedule banner**: `border-current` replaces the outline variant's `border-foreground`. The outline variant sets no text colour, so the buttons inherit `text-warning-foreground`.

### (h) Hooks

- **`useMediaQuery`**:
  - `subscribe` is memoised on `query`, the snapshot is a primitive boolean, and the server snapshot is `false`. The route is `ssr: false` (`$number.tsx:17`), so there is no hydration mismatch.
  - Both callers (header and editor) read the same query, and React keeps the stores consistent within one render.
  - `getSnapshot` allocates a new `MediaQueryList` on every call. This is negligible.
- **Hook order in `EditorHeader`**: `useMediaQuery` and `useMyStory` run before the `if (focus)` early return, so the order is stable.
- **`useKeyboardOffset`**:
  - The formula matches the spec and is clamped to ≥ 0.
  - It listens to both `resize` and `scroll` on the visual viewport, and cleanup removes both listeners and the CSS variable.
  - It is mounted inside `EditorToolbar`, so it unmounts in focus mode.
  - There is no `viewport-fit=cover` in `__root.tsx:35`, so the missing safe-area padding on the fixed bar does not matter.

## Other notes

- `RevisionPreview` only mounts when a revision is selected. This replaces the old `open ? selectedKey : null` gating. On close it stays mounted only through the exit animation, and the query is cached with `staleTime: Infinity`, so this is harmless.
- The mobile e2e `toBeCloseTo(844, 0)` needs a difference under 0.5px. The bar uses `bottom: 0`, and headless Chromium has a keyboard offset of 0, so it is stable. `getByText('0 chữ', {exact:true})` count 1 matches the single-node gating.
- Existing desktop e2e (default viewport ≥ 768) still sees the word count, pill and status in the header. Substring `getByText('8 chữ')` / `('300 chữ')` match only the header node, because the dialog and sheet are closed at those steps.

## Recommended actions

1. (Medium) Add `scrollMargin`/`scrollThreshold` to the editor props. Check by hand on a phone with the keyboard open.
2. (Low) Fix the dead `max-md:px-0` on the History trigger.
3. (Low) Update the phase file to match `word-meter.ts` / `word-meter.test.ts`.

## Unresolved questions

- Is the fixed `max-lg:h-[90dvh]` on the revision sheet intended, or should it use only the base `max-h`?
- Should the phone bottom sheet slide in from the bottom? The spec does not say.
