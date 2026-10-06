# Code review: paragraph comments (working tree, 2026-10-06)

## Scope
- Files: 24 modified + 13 new (`git status`, `.claude/` excluded). ~520 LOC added in diff, ~600 LOC in new files.
- Focus: uncommitted working tree vs HEAD 1f71f23.
- Gates I ran: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 110 files / 718 tests passing. I did not run int/e2e because another agent is using the shared test DB.
- Scout: chapter navigation always does a full page load (`<a href>` in `chapter-end.tsx`, `window.location.assign` in `use-arrow-keys.ts`). So route-level state such as `paragraph`, `paragraphs` and `byParagraph` is never carried over to another chapter. `@theme inline` in `styles/app.css:22` maps `--color-reader-*` straight to `var(--reader-*)`, so remapping them under `.site-comment-colors` does take effect. `useArrowKeys` does nothing while any `[role=dialog]` is open, so arrow keys cannot leave the page while the sheet is open.

## Overall assessment
The feature is solid and matches the plan. I found no Critical or High issues. The SQL is correct, the counts and list scopes agree, a reply always takes its thread's paragraph, `paragraphId` is validated on both sides, and no node is added to `.reader-content`. What remains is mobile/desktop UX around the sheet, plus some selection edge cases.

## Acceptance criteria check
| # | Verdict | Evidence |
|---|---|---|
| a | OK | `create-comment.ts:66-77`: a reply takes `thread.paragraphId` and ignores the client value. A top-level comment passes `isPublishedParagraph` (`@>` on `paragraph_ids` scoped by the chapter PK) or gets `COMMENT_PARAGRAPH_INVALID`, which `core-errors.ts:27` maps to 422. Zod `isValidPid` gives 400 for a malformed id. |
| b | OK | `paragraph-counts.ts`: the root needs `visibleCommentWhere(users)`; replies are LEFT JOINed with `status='visible'`; the reply author is LEFT JOINed with `status<>'banned'`; the count is `count(distinct root)+count(replyAuthor.id)`. This equals `countShown` semantics. `inPublishedText` drops gone pids. `findReadableChapterRef` returns 404. |
| c | OK | `paragraph-scope.ts:18-29`. `orphanedParagraph` is set only in the unfiltered list (`list-comments.ts:148`). `total` uses the same `threadWhere`. |
| d | Mostly | FAB is fixed and sits outside `.reader-content`. Sheet is `adaptive-right`. Marking uses only the `data-pc-active` attribute. Index follows DOM order. No listener while gated (`use-paragraph-selection.ts:24`). Counts load only on `near`. See M1, M2 for UX gaps. |
| e | OK | The reading-area click handler is on `<article>` only, and the FAB and index live outside it, so a tap on them never toggles the bars. `useNavVisibility` is unchanged. Moderation is untouched. The chapter list now excludes paragraph threads, which is intended. |
| f | OK | All changes are additive: optional `paragraphId`, optional `paragraph` query, new endpoint, new error code, new DTO boolean. `paragraphId` itself is never sent to clients. |
| g | OK | TS strict, no `any`. Comments are in English. A grep for plan refs (phase / F-codes / Red Team) in the new code found nothing. |

### SQL semantics verified
- `pid = any(coalesce((select paragraph_ids …), '{}'::text[]))`. The `coalesce` matters here. A bare `= any((select …))` would be parsed as the **subquery** form (text compared to a text[] row), which is a type error. Wrapped in `coalesce`, it is the array form. The subquery is uncorrelated and keyed on the PK (`chapter_contents.chapter_id`), so it runs once as an InitPlan and returns at most one row.
- Orphan branch: `paragraph_id IS NULL OR NOT (pid = any(arr))`. When pid is NULL the left side covers it. `paragraph_ids` is `notNull` and pids are never NULL elements, so `NOT(...)` never yields NULL for a non-null pid.
- The partial index `comments_chapter_paragraph_idx (chapter_id, paragraph_id) WHERE paragraph_id IS NOT NULL AND parent_id IS NULL` matches both the paragraph-list and counts predicates. The snapshot chain is OK (0004.prevId equals 0003.id).

## Critical
None.

## High
None.

## Medium

**M1. Opening the sheet auto-focuses the composer textarea, so the Android keyboard pops up over the thread list.** `paragraph-comments-sheet.tsx:58`
- What happens: Radix Dialog focuses the first tabbable non-link element. For a verified reader that is the `CommentComposer` textarea, which sits above the feed.
- Failure scenario on Android Chrome: reader long-presses, taps the FAB, and the keyboard opens at once. That covers most of a sheet that can be up to 90dvh, so the reader cannot see the existing comments they came to read.
- Same path from the index: on Android this also opens the keyboard. iOS usually suppresses it because the focus happens outside the user gesture.
- Fix: add `onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}` to `SheetContent`, or focus the title. Keep `tabIndex=-1` on the content.

**M2. The `data-pc-active` highlight is mostly invisible: the default modal overlay dims it, and the sheet can cover the paragraph.**
- Code: `paragraph-comments-sheet.tsx:58`, `routes/…chapter-{$number}.tsx:116,187`, `reader.css:587`.
- Cause: the sheet uses the default `bg-black/50` overlay. Compare the reader settings sheet, which passes `overlayClassName="bg-transparent"` and pushes the column with `lg:pr-96`.
- Desktop at 1280px: the 68ch column (~650px, centred) overlaps the 384px right panel by about 60–70px. The highlighted paragraph sits under a 50% black scrim.
- Mobile, FAB path (`scroll=false`): if the selection was in the lower half, the bottom sheet covers the paragraph. Since `placement === 'top'` in that case, this is the common case.
- The plan intends the highlight to show which paragraph is being discussed, so the feature currently has little effect.
- Fix options:
  - Use `overlayClassName="bg-transparent lg:bg-transparent"`, or a lighter scrim.
  - On `lg`, also reserve the column space (`lg:pr-96` when `paragraph?.open`), the same way settings does.
  - On mobile, scroll the paragraph to the top before opening, or accept this and rely on the excerpt shown in the sheet header.

## Low

**L1. Triple-click edge cases return `null`, so no FAB appears.** `paragraph-selection.ts:66-72`
- Last paragraph: in Chrome the range end can land outside `.reader-content`, in the next sibling or the article sentinel. `paragraphOf(end)` is then `null`, which yields `null`.
- Paragraph followed by a blockquote: the end can be `(blockquote, 0)`. The blockquote has no pid, so the result is `null`.
- Fix: if the end lies outside any pid element but `range.endOffset === 0` and the start paragraph ends before it, accept `start`. Or clamp with `range.intersectsNode`. A simpler option: compute the pid from `range.startContainer` and check that `range.toString().trim()` equals the trimmed text of the selection intersected with the start element.

**L2. FAB `placement` goes stale after scrolling.** `use-paragraph-selection.ts:34-35`
- Placement is computed only on `selectionchange`. If the reader selects in the top half and then scrolls so the selection is in the bottom half, the bottom FAB now covers it.
- Fix: also recompute on a passive `scroll` listener, throttled with rAF, while `selected !== null`.

**L3. On touch devices, `onMouseDown preventDefault` does not protect the selection.** `paragraph-comment-fab.tsx:31-33`
- On iOS and Android, a tap outside the selection can clear it during touch handling, before `mousedown`.
- It works today only because `onClick` uses the `selected.pid` state and the 150ms debounce keeps the FAB mounted long enough.
- Recommendation: verify on a real device. If needed, keep the last pid in a ref for about 300ms after deselection.

**L4. The tab count can disagree with the index when the cached page is stale.** `chapter-comments.tsx:156,209`; `paragraph-thread-index.tsx:23`
- "Theo đoạn (M)" sums the counts for every pid in the DB's `paragraph_ids`. The index only shows pids present in the possibly stale cached DOM, so the tab can say "(3)" while the index shows the "reload" message.
- Pids are stable across republish, so this only happens while the CDN purge lags. Acceptable, but M could be computed from `paragraphTexts` ∩ counts once that list is read.

**L5. Index button's accessible name is the whole paragraph text.** `paragraph-thread-index.tsx:30-40`
- `line-clamp-2` is visual only, so screen readers announce a long paragraph for every entry.
- Fix: `aria-label` with a truncated excerpt (about 80 chars) plus the count, or `aria-describedby`.

**L6. Inaccurate comment in the route.** `routes/…chapter-{$number}.tsx:115`
- The comment says "the bars stay as they were". In fact `scrollIntoView` upward from the comments fires scroll events, and `useNavVisibility` then shows the bars (delta < −8).
- Harmless, but fix the comment, or say the bars follow the scroll as usual.

**L7. `byParagraph` stays true after the counts drop to 0.** `chapter-comments.tsx:157,160`
- After the last paragraph comment is deleted, the UI falls back to the chapter view, which is correct. But when a new paragraph comment is posted, the UI jumps back to the paragraph tab unprompted.
- Fix: reset with `if (paragraphTotal === 0 && byParagraph) setByParagraph(false)`, or derive the tab from the current state only.

**Info. Benign race between the pid check and a republish.** `create-comment.ts:69-82`
- A republish that drops the pid between `isPublishedParagraph` and the INSERT creates an immediately orphaned thread. It still appears in the chapter list with the label. This matches the existing "not wrapped in a transaction" note. No action needed.

## Edge cases found by scout
- Full-page chapter navigation, so route state never crosses chapters. Verified, no issue.
- Selection inside the sheet or textarea resolves to `null` because it is outside the root. The FAB is already hidden while the sheet is open. No issue.
- `findParagraph` and `paragraphTexts` compare `dataset.pid` instead of building a selector. `pidFromSelection` re-validates with `isValidPid`. No CSS or selector injection.
- Focus return when opened from the index goes to the index button with `preventScroll` (Radix FocusScope), so closing does not scroll back to the comments. With the FAB, focus falls back to `body` because the FAB has unmounted. Acceptable.
- The cache key `['comments', id, n, 'paragraph-counts']` cannot collide with `[…, viewer, 'threads', pid]`: usernames match `^[a-z0-9_]{3,30}$` and cannot contain `-`.
- Create and delete invalidate the `chapterCommentsKey` prefix, so the counts, the paragraph thread and the chapter list all refresh. A disabled counts query (not yet `near`) is not fetched.

## Positive observations
- Each piece of logic lives in one place:
  - `threadScopeWhere` is shared by the list and its total.
  - `inPublishedText` is shared by the counts and the lists.
  - `CommentFeed` is extracted, so the chapter list and the sheet share their states.
- `pidFromSelection` is pure and unit-tested with a fake DOM, including the triple-click case where the selection ends at offset 0 of the next paragraph.
- The DTO does not expose `paragraphId`; only the boolean flag goes out.
- The e2e asserts that `.reader-content.innerHTML` is byte-identical after the whole flow, and that a tap with nothing selected still toggles the bars.
- The int tests cover a heading pid, a reply ignoring a client pid, hidden and banned exclusion, and an orphan after a republish.
- The FAB is rendered inside `.reader-page`, so it picks up the reading preset's accent. The sheet portals out and remaps the `--reader-*` tokens to site colours.

## Recommended actions
1. M1: stop the sheet from auto-focusing the textarea.
2. M2: make the active paragraph visible, using a transparent or lighter overlay and reserving column space on `lg`.
3. L1/L2: harden selection edge cases (triple-click on the last paragraph or before a blockquote; recompute placement on scroll).
4. L5–L7: small fixes (a11y label, route comment, tab reset).
5. After the gate is green, tick spec §5 Gđ2 checkbox 1. Note that "Bình luận chương (2 cấp), sau đó bình luận theo đoạn" covers both phase 1 and phase 2.

## Plan follow-ups (not edited)
- Done per code: Zod + migration, Core + API, selection + FAB + sheet + paragraph tab, i18n, e2e scenario written.
- Pending: the int/e2e gate run (another agent is running it) and the spec checkbox.

## Metrics
- Type coverage: strict, 0 `any` in the diff.
- Lint: 0 issues.
- Unit tests: 718/718 passing.
- Int/e2e: not run here, by instruction.

## Unresolved questions
- Should "Theo đoạn (M)" count comments, as now, or paragraphs? The plan's "(M)" is ambiguous; the e2e expects 1 for 1 comment on 1 paragraph, so both readings pass.
- Does the user want the paragraph sheet to be non-modal on desktop (read the text while the thread stays open, as with settings)? That would also resolve M2.

**Status:** DONE_WITH_CONCERNS
**Summary:** No Critical/High issues. The SQL semantics, counts join, scope filtering, validation and no-DOM-injection rule are all correct, and typecheck, lint and unit tests pass. There are 2 Medium UX issues: the sheet auto-focuses the textarea, so the Android keyboard covers the threads; and the modal overlay or the sheet hides the `data-pc-active` highlight. There are also 7 Low edge cases.
