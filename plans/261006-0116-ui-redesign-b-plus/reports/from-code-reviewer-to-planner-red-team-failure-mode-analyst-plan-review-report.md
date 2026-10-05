# Red team: Failure Mode Analyst, plan `261006-0116-ui-redesign-b-plus`

Reviewer: code-reviewer (Flow Tracer). Mode: overnight, read-only. Plan files and code were not edited.
Method: checked each plan claim against code with grep/read. Measured header text widths with Playwright Chromium against the real Fontsource woff2 files (be-vietnam-pro 500, literata, plus-jakarta-sans 5.3.0).

Measured widths (px): "Novel Hub" Literata 600/18 = 94, Plus Jakarta Sans 800/19 = 95; "Đăng nhập" BVP 500/14 = 74, PJS 500-600/14 = 70; "Đăng ký" BVP = 56, PJS = 53.

---

## Finding 1: The phase 3 mobile header cannot fit 360px for guests, so header-mobile.spec fails
- **Severity:** High
- **Location:** Phase 3, section "Requirements" (Header desktop / Header mobile), "Implementation Steps" step 3
- **Flaw:** The mobile header keeps the desktop logo (a 34px square plus the "Novel Hub" wordmark at 19/800), adds a 44px search link (`size-11` from phase 2), and keeps both "Đăng nhập" and "Đăng ký" pills. Nothing in the plan says to shrink the logo or the buttons below `sm`. The current header already has only ~4px of slack at 360.
- **Failure scenario:** Current guest header at 360: logo 94 + gap 8 + icon 36 + 4 + "Đăng nhập" (74+32) + 4 + "Đăng ký" (56+32) = 340px. The flex row starts at x=16, so it ends at 356 of 360. The phase 3 header comes to 137 (logo) + 8 + 44 + 8 + 102 + 4 + 85 ≈ 388px, ending at ~404, which is ~44px of horizontal scroll. Phase 2 step 9 has a fallback (`size="sm"`, px-3), but even with it the header is ≈372px and still overflows. `header-mobile.spec.ts:46-49` (`expectNoHorizontalScroll` after guest `/`) goes red. Hiding "Đăng ký" is not an option, because `:51` expects it visible in the banner. The worker gets one fix attempt, and the plan gives it no layout rule to apply. Secondary issue: the desktop header starts at exactly 768 (md). For guests, the plan's nav pills ("Tủ truyện", "Viết truyện") plus the two auth pills leave the search pill about 100px. No e2e covers this case (the tablet test at `header-mobile.spec.ts:90-100` is signed-in only), so it would ship broken.
- **Evidence:** `apps/web/src/components/site-layout.tsx:47` (`px-4 gap-2`), `:49` (logo `font-serif text-lg`), `:85` (`size="icon"` = 36px), `:109-116` (guest nav, `gap-1`); `apps/web/src/components/ui/button.tsx:21` (`h-9 px-4`); `apps/web/e2e/header-mobile.spec.ts:7,46-51`; plan `phase-03…md:20-21,95`; plan `phase-02…md:20` (icon `size-11`).
- **Suggested fix:** Add a width budget to phase 3 Requirements. Below `sm`, the logo is the square only, with the wordmark `sr-only` so the link name "Novel Hub" stays. Guest auth links at < md use `size="sm"`. At md..lg, hide the desktop nav pills for guests, or start the desktop header at `lg`. Run `header-mobile.spec` right after step 3.

## Finding 2: The phase 2 "link bìa" wording invites a second link per card and breaks strict locators in search.spec
- **Severity:** High
- **Location:** Phase 2, section "Requirements" → **StoryCard** (line 28); also Phase 9 `/search` using `StoryRowList`
- **Flaw:** Today a card has exactly one link: the title link stretched over the whole card with `after:absolute after:inset-0`. The cover is not a link. The plan says "Link tên chứa tiêu đề; link bìa giữ img 'Bìa truyện {tên}'", which reads as "the cover is a link". It never states the invariant "one link per card". Playwright `name` matching is a case-insensitive substring match, so a cover link named "Bìa truyện {title}" also matches `{ name: title }`.
- **Failure scenario:** The worker wraps the cover (grid or 60px row) in `<a>`. Then `search.spec.ts:63` (`results.getByRole('link', { name: ongoing.title })` + `toBeVisible`) hits a strict-mode violation: 2 elements. The same happens at `:68-69`, `:82-83` and `:108`. Phase 9 moves search to `StoryRowList`, so the row layout carries the same risk. `catalog.spec` survives only because it uses `.first()`.
- **Evidence:** `apps/web/src/components/story/story-card.tsx:23-39` (single stretched link, cover not linked); `apps/web/src/components/search/search-results.tsx:59`; `apps/web/e2e/search.spec.ts:63,68-69,82-83,108`; plan `phase-02…md:28`.
- **Suggested fix:** Replace the wording with: "Exactly one `<a>` per card (title, stretched with `after:absolute after:inset-0`); the cover stays `role=img`, never a link, in both layouts." Add a unit assertion in `story-card.test.tsx` that the rendered HTML contains exactly one `<a `.

## Finding 3: `--reader-card` is never declared in the `:root` defaults, so every reader without a preset gets transparent reader surfaces
- **Severity:** High
- **Location:** Phase 1, section "Requirements" (line 20 vs 21), "File inventory" `token-values.ts` (line 53), "Test scenario matrix" (line 77)
- **Flaw:** `--reader-primary*` is explicitly declared in `:root` light, `:root` dark and each preset. `--reader-card` is only added to `reader[preset]` / the 6 `[data-reader-theme]` blocks. The default reading state is "no preset": the boot script removes `data-reader-theme` when no theme is stored, and "Khôi phục mặc định" does the same. In that state the page reads `:root`, which has `--reader-bg/fg/muted` but no `--reader-card`. The new contrast test only runs "Mỗi preset", so the `light`/`dark` scopes never check it.
- **Failure scenario:** Phase 6 puts the rail, the "Chương N" pill, the author-note block and the "Chương trước" button on `bg-reader-card`. For every first-time visitor (and every e2e run) these render with no background. The gate stays green while the default reading page is visibly wrong. If the worker instead runs `READER_CONTRAST_PAIRS` on every scope, as the Architecture box says, `contrastViolations` counts the missing variable as a violation and `tokens.test.ts` goes red. Either way the plan's own two statements contradict each other.
- **Evidence:** `apps/web/src/styles/tokens.css:30-33,83-86` (`:root` reader defaults); `apps/web/src/lib/boot-script.ts:43` (no theme → `removeAttribute('data-reader-theme')`); `apps/web/src/lib/reader/use-reader-settings.ts:119` (reset sets `theme: undefined`); `apps/web/e2e/reader-settings.spec.ts:75`; `apps/web/src/lib/contrast.ts:39` (missing var = violation); `apps/web/src/styles/token-values.ts:36-38,60-62,126-129`; brainstorm §2.3 ("Không chọn preset = light → ngà, dark → xám tối").
- **Suggested fix:** Declare `--reader-card` in `:root` light (`#f3ecdd`, the ivory value) and `:root` dark (`#363636`, the dark-gray value) in both `tokens.css` and `token-values.ts` light/dark. Change matrix row 77 to "every scope (light, dark, reader:*)".

## Finding 4: The phase 8 hook boundaries do not match who sets which state, so the "move only" split can change autosave/conflict behaviour
- **Severity:** High
- **Location:** Phase 8, section "Requirements" → **Tách** and "Architecture"
- **Flaw:** The plan assigns `status` to `useEditorAutosave`, `notice`/`publishing` to `useChapterPublishing`, and `restoreRevision` to a third hook. In the code, the setters cross these boundaries:
  - the autosave effect's `onSaved` sets `unpublished`;
  - `restoreRevision` sets `status` (conflict), `words`, `unpublished` and `notice`;
  - `resolveConflict` sets `words`;
  - `publishNow` reads `chapter.status`.

  `unpublished`, `words` and `chapter` have no owner in the Architecture. The hooks would need each other's setters, so either the state is lifted back into `ChapterEditor` or callbacks are passed between hooks.
- **Failure scenario:** The worker passes an inline callback such as `onSaved` into `useEditorAutosave`. `react-hooks/exhaustive-deps` (from `reactHooks.configs.flat.recommended`) pushes it into the effect deps. The effect then re-runs on every render. Each re-run disposes the autosave and rebuilds it with `initialBase: loadedRef.current.updatedAt`, the first loaded version. The next save sends a stale base, the server answers 409, and the "Chương đang được sửa ở nơi khác." banner appears. `editor.spec.ts:31` / `publish.spec.ts:77` (`toHaveCount(0)`) go red. Worse, a version that passes lint but uses stale closures (e.g. `publishNow` reading an old `chapter.status`) can pass the gate and show the wrong notice.
- **Evidence:** `apps/web/src/components/editor/chapter-editor.tsx:74,78,87-88,95` (state), `:121-132` (`initialBase` from `loadedRef`, `onSaved → setUnpublished`), `:181` (deps), `:201`, `:254-256`, `:277` (`chapter.status` in closure), `:329-331,341` (`restoreRevision → setWords/setUnpublished/setNotice/setStatus`); `eslint.config.js` react-hooks recommended; plan `phase-08…md:20,39-42`.
- **Suggested fix:** Keep all `useState` in `ChapterEditor`. Pass raw setters (stable identity) into the hooks; never pass wrapper callbacks. Keep the effect deps `[editor, publicId, number]` and add a comment explaining why. Add a step-1 check: grep that `createAutosave(` is called once per mount (a log counter, or a unit test of the hook with `renderHook`).

## Finding 5: The adaptive Sheet class string pins both "right" and "left" sheets to the left edge at ≥ lg
- **Severity:** Medium
- **Location:** Phase 2, section "Implementation Steps" step 3 (line 113); consumed by Phase 6 ("Sheet cài đặt", `lg:pr-96`) and Phase 8 (revision history)
- **Flaw:** The one class string given for both `adaptive-right` and `adaptive-left` uses `lg:inset-x-auto` (`left:auto; right:auto`) and never adds `lg:right-0` / `lg:left-0`. A `position:fixed` box with both insets `auto` sits at its static position, which is the left edge for a body portal.
- **Failure scenario:** At 1280 the settings panel opens on the left. Phase 6 then adds `lg:pr-96` to `main`, which pushes the text column left, under the panel: the exact opposite of the success criterion "cột chữ không bị panel che". The revision history sheet also opens on the left. No e2e checks position, and the success criterion is "kiểm tay hoặc screenshot", which an unattended worker skips. The bug ships green.
- **Evidence:** `apps/web/src/components/ui/sheet.tsx:56-59` (current `right-0` / `left-0` per side); plan `phase-02…md:24,113`; `phase-06…md:26,111`.
- **Suggested fix:** Split the string per side: `adaptive-right` adds `lg:right-0 lg:left-auto lg:border-l` plus slide-from-right, and `adaptive-left` gets the mirror. Add a Playwright assertion at 1280 in `mobile-navigation.spec.ts`: the settings dialog's `boundingBox().x > 640`.

## Finding 6: The sticky CTA covers the site footer on the mobile story page, and the plan gets the viewport of the e2e that exercises it wrong
- **Severity:** Medium
- **Location:** Phase 5, sections "Requirements" (CTA dính đáy mobile, line 33), "Test scenario matrix" (line 82), "Risk Assessment" (line 149)
- **Flaw:**
  1. `SiteLayout` puts `<SiteFooter/>` after `<main>`, and phase 3 only reserves bottom space when `tabBar` is true. The story page passes `tabBar={false}`, and phase 5's "trang chừa `pb-24`" sits inside `main`. The fixed CTA (`z-30`, ~72px + safe area) therefore covers the footer ("Điều khoản", "Quy định nội dung") at the bottom of the page.
  2. The matrix says `library.spec` checks `'Đọc tiếp chương 2'` strictly "(1280)". The whole describe actually runs at 390×600, so the gate exercises the sticky CTA instance, not the hero one.
- **Failure scenario:** On a 360/390 story page, footer links sit under the CTA bar and cannot be tapped. No e2e checks footer links on the story page at mobile size, so this ships. The planner believes the hero path is the tested one; in fact any regression in `StoryStickyCta`/`ContinueReadingButton` (`size`, `className`, handoff) breaks `library.spec.ts:64-74` while the plan's risk notes point elsewhere.
- **Evidence:** `apps/web/src/components/site-layout.tsx:32-36`; plan `phase-03…md:24`; `apps/web/e2e/library.spec.ts:35-38,64,74`; plan `phase-05…md:33,82,149`.
- **Suggested fix:** Generalise the `SiteLayout` prop to `bottomInset: 'tabBar' | 'cta' | 'none'` so the frame (not `main`) carries the bottom padding. Correct the matrix to say "390 (sticky CTA)". Add to `mobile-navigation.spec.ts`: at 360, scroll to the bottom and `footer.getByRole('link', { name: 'Điều khoản' }).click()` succeeds without `force`.

## Finding 7: Readers who already saved settings stay pinned to Literata, which is no longer preloaded, so text swaps fonts after load
- **Severity:** Medium (pre-launch: only dev/staging accounts and browsers are affected today)
- **Location:** Phase 1, section "Requirements" (font enum / default, line 24) and "Luồng dữ liệu font"
- **Flaw:** `update()` writes `{ ...snapshot, ...change }`, and the snapshot defaults to `DEFAULT_READER_SETTINGS`. So anyone who ever changed theme or size has `font: 'literata'` stored explicitly, in localStorage and in `users.preferences.reader`. Phase 1 changes the default to Source Serif and stops preloading Literata, but only maps `be-vietnam-pro`/`inter`. A stored `'literata'` cannot be told apart from "old default".
- **Failure scenario:** For those readers, every chapter page loads Literata late with no preload. Text paints in Georgia first and then re-flows, which also shifts `--reader-column` (in `ch` units). They never see the new content font. Nothing in the gate catches this, because e2e uses fresh contexts.
- **Evidence:** `apps/web/src/lib/reader/use-reader-settings.ts:55,111`; `packages/shared/src/schemas/reader.ts:97-99`; `apps/web/src/routes/__root.tsx:16-21` (preload list being replaced); `apps/web/src/styles/reader.css:11,23` (`ch` column on the reader font).
- **Suggested fix:** Decide explicitly, and record it in plan.md, between:
  - (a) accepting this because the site is pre-launch (staging data only); or
  - (b) bumping a settings version or a one-time map of `literata` to `source-serif-4` for records with `updatedAt` before the deploy.

  Do not silently leave it out.

## Finding 8: Phase 1's grep success criterion contradicts its own legacy-font fixtures
- **Severity:** Medium
- **Location:** Phase 1, section "Success Criteria" (line 138) vs "File inventory" (lines 60-61) / "Test scenario matrix" (rows for `boot-script.test.ts`, `settings.test.ts`)
- **Flaw:** The criterion demands no `be-vietnam-pro` string in `apps/web/src`, except "alias legacy trong reader.css/shared". But the plan also requires legacy fixtures (`inter`, `be-vietnam-pro`) in `apps/web/src/lib/boot-script.test.ts` and `apps/web/src/lib/reader/settings.test.ts`, both under `apps/web/src`.
- **Failure scenario:** An unattended worker that follows the success criteria literally deletes the legacy fixtures to make the grep clean. The parity test (`boot-script.test.ts:136-138`) then no longer proves that boot and React map `inter`/`be-vietnam-pro` the same way, which was the whole point of the "[auto] map font cũ" decision. Or the worker gets stuck reconciling the two rules and wastes its single retry.
- **Evidence:** `apps/web/src/lib/boot-script.test.ts:60-74,136-138`; `apps/web/src/lib/reader/settings.test.ts:21-25`; plan `phase-01…md:60-61,82-83,138`.
- **Suggested fix:** Change the exception to "except legacy alias declarations and `*.test.ts` fixtures", and list the expected grep hits.

---

## Verified (no finding)
- Boot script with the alias map: ~1167 chars, under the 1536 limit (`boot-script.test.ts:141`); `A.hasOwnProperty` and `Object.hasOwn` give the same result for `toString`/`__proto__`.
- `z.preprocess` keeps `field<T>(ZodType<T>)` in `settings.ts:41` type-compatible (output type is unchanged, input becomes `unknown`).
- Both font packages exist at 5.3.0 with `*-{latin,vietnamese}-wght-normal.woff2`; `wght.css` references exactly those files; family names are `'Plus Jakarta Sans Variable'` / `'Source Serif 4 Variable'`.
- `ring-ring/70` appears in exactly the 8 files listed; `font-serif` appears in 36 `.tsx` places and the 6 "keep" lines are correct.
- `mature-gate.tsx:112` focuses `main h1[tabindex]`: phase 5 hero and phase 6 `ChapterHeader` stay inside `main`.
- Gate z-40 sits above the reader bars and sticky CTA (z-30).
- `plans/` and `docs/` are in `.prettierignore`, so `format:check` is unaffected by phase 9 docs.

## Unresolved questions
- Phase 3: are the desktop nav pills "Tủ truyện"/"Viết truyện" shown to guests? The current code shows them only to signed-in users (`site-layout.tsx:122-130`). This decides the 768px width budget in Finding 1.
- Finding 7: accept the stored-Literata behaviour as pre-launch, or add a one-time migration? This is a business call for the user.
