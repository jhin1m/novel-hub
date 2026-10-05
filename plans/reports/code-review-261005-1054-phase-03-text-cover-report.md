# Code review: Phase 3, default text cover

Scope: uncommitted diff (9 modified + 4 new files, ~350 LOC). Gate reported green by lead (typecheck, lint, 218 unit, int, e2e 10/10). This review re-read the code and ran extra probes.

## Verdict

No Critical/High findings. Every acceptance criterion is met except the spec checkbox (lead follow-up). Score **8.5/10**.

## Findings (by severity)

### Medium
None.

### Low
1. **Dark theme: cover edges disappear.** `--cover-9` `#3A3632` against dark `--background` `#1C1A18` is about 1.5:1, and `--cover-6`/`--cover-5` are close to that. The text cover has no border or ring (`apps/web/src/components/story-cover.tsx:72`), so in dark mode a grid of these covers loses its card outlines. Plan step 8 asks for a visual check in light **and** dark, but the lead only reported widths 375 and 1280. Confirm the dark-mode check. If the edges look weak, add `ring-1 ring-inset ring-border` or a darker shadow line, applied only in dark mode.
2. **Preview and saved cover look different.** The local preview has `border bg-muted` (`cover-upload.tsx:62`). The saved image comes from `StoryCover` with no border (`story-cover.tsx:62`), so the frame jumps when an upload completes. Either drop `border` from the preview or pass `className="border"` to `StoryCover` at `cover-upload.tsx:65`.
3. **`fetchpriority="auto"` is added to every image** (`story-cover.tsx:59`). This is harmless, but `fetchPriority={priority ? 'high' : undefined}` keeps the markup clean.
4. **Seeded genres share colours.** Of the 9 genre tags in `packages/db/src/seed/fixtures.ts`, the hash uses only 7 slots: `huyen-huyen`/`kiem-hiep` share slot 4 and `kinh-di`/`tu-tien` share slot 5. Slots 0 (the red re-picked during validation), 1 and 7 go unused. The plan accepted collisions, so this is not a defect. If it looks dull, one option is a fixed slug-to-slot map for the curated genres with the hash as fallback. That is a design decision for the user (see Questions).

### Info
- On `/write`, a screen reader announces each card twice: the `role="img"` label "Bìa truyện X", then the link "X" (`write/index.tsx:64-78`). This is acceptable and the e2e test relies on the img role, so no change is needed.
- `docs/project-spec.md:155` is still `[ ]`, and the phase file `status: pending`. Mark both after this review.

## Checks requested

- **(a) Acceptance criteria.** Met:
  - 2:3 frame, colour from the main tag, title and pen name shown.
  - Uploaded covers use `srcset` 300w/600w with `width=600 height=900`. Tailwind preflight `height:auto` keeps the aspect ratio, so there is no layout shift.
  - Contrast tests and component tests pass, and the palette count test checks both TS and CSS.
  - Every prop, default and attribute in the Requirements section is present: `sizes` default, `priority` → eager/high, `decoding=async`, lazy by default, `line-clamp-6`, `text-balance`, `wrap-anywhere`, `truncate` on the pen name, `role="img"` + `aria-label` + `aria-hidden` on the inner text, and the `rem` fallback before `cqw` inside `@supports`.
- **(b) Regressions.** None found:
  - `/write` keeps visibility, status, chapter count and date; the link target is unchanged.
  - `authorName` comes from `useMe()`, which `WriterGate` has already resolved (`writer-gate.tsx:18-30`), so the `?? ''` fallback is never reached in practice.
  - Edit page: the "Chưa có bìa" caption now only shows when there is no cover and no preview. The remove button logic is unchanged.
  - Cover URLs are content-hashed (`core/stories/cover.ts:52`), so a re-upload gets a new URL and resets the failed-image state.
- **(c) Public contract.**
  - No references to `cover_current_alt` remain.
  - `CoverUpload` has one caller (`write/stories/$publicId/index.tsx:60`), and it was updated.
  - No API or DB changes.
- **(d) Patterns.**
  - Tokens follow the phase 1 approach: `TOKEN_VALUES` scope, string matching against `tokens.css`, `contrastViolations`.
  - Code is English only. Vietnamese appears only in `vi.json`, test fixtures and docs.
  - No new dependencies, and Vitest compiles TSX without config changes.
- **(e) Hydration and a11y.**
  - The FNV-1a hash is pure 32-bit integer maths, and the tests pin known values, so server and client pick the same colour.
  - SSR and the first client render both produce `<img>` (`failedUrl` starts as `null`), so hydration matches. The mount effect catches errors that fire before hydration.
  - Probe: Chromium reports `complete=false, naturalWidth=0` for a deferred lazy image below the fold, whether it came from parsed HTML or was created client-side. So the effect at `story-cover.tsx:41-44` does not wrongly switch below-the-fold covers to text. WebKit was not probed (not installed), but the behaviour follows the HTML spec.
  - The stretched link's `::after` uses the `li` as its containing block, so `line-clamp-2` (overflow hidden) on the link does not clip it. The link's focus outline is not clipped either.

## Questions
1. Was the grid checked visually in dark mode (Low 1)?
2. Should curated genre tags get fixed palette slots so they never collide (Low 4), or keep the pure hash as the plan decided?

Status: DONE
Summary: Phase 3 meets its acceptance criteria with no Critical/High/Medium issues. There are four Low findings (dark-mode cover edges, preview border mismatch, redundant fetchpriority, genre colour collisions); the spec checkbox is still unmarked.
