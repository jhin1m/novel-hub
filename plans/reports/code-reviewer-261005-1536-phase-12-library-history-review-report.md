# Code review: Phase 12, library and reading history

Scope: the uncommitted diff plus untracked files (`.claude/` ignored). About 1.9k LOC across shared, core, api and web.
Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-12-tu-truyen-lich-su-doc.md`.
Checks I ran: unit tests for reading/library api, shared schema, `lib/reader` (29 pass). I also ran a Playwright probe of the header width at 360/390/414 px in a scratchpad clone. Nothing in the repo was modified.

## Overall

The work is solid. SQL is correct, ownership is scoped (no IDOR), there is no UUID leak, and the cache boundary is respected. All four intentional deviations are sound (verified below). Remaining issues: one mobile layout regression, one spec-8 card-field gap, and one avoidable per-row sort in the shared lateral. Nothing critical.

Score: **8/10**

## Critical

None.

## High

None.

## Medium

### M1. The header link widens horizontal overflow on mobile for signed-in users
`apps/web/src/components/site-layout.tsx:107-111`

- Probe, signed in, on `/`: the header content is **512 px wide** at 360, 390 and 414 px viewports. `documentElement.scrollWidth = 512`, so every `SiteLayout` page scrolls sideways.
- The new "Tủ truyện" button adds about 102 px. Before the change the header was about 410 px wide: it already overflowed at 360/390 but fit at 414. The overflow is now worse, and 414 px phones are newly broken. The spec is mobile-first.
- Fix: follow the Settings pattern. Use an icon plus `<span className="sr-only sm:not-sr-only">`, for example `LibraryBigIcon`. Better still, put "Tủ truyện" and "Viết truyện" in the account dropdown below `sm`. Re-check with an e2e assertion `scrollWidth <= clientWidth` at 360 px.

### M2. The library and history rows drop spec-8 card fields
`apps/web/src/components/library/library-item.tsx:19-55`

- The plan asks for a compact `StoryCard`. `LibraryStoryRow` re-implements the card instead.
- It omits the **AI label** (`isAiAssisted`, spec 8: "nhãn có dùng AI nếu có", a reader-facing disclosure) and the last update (`lastChapterAt`).
- Fix: extract the facts block of `StoryCard` (`story-card.tsx` tag/status, chapters/words, updated, AI/18+ badges) into a shared `StoryCardFacts` and use it in both. At minimum, add the `story_card_ai` badge and the `story_card_updated` line.

### M3. `resumeChapter` reads and sorts every published chapter of the story for each row
`packages/core/src/reading/continue.ts:34-37`

- `ORDER BY (number > saved), abs(number - saved) LIMIT 1` cannot be served by `chapters_story_id_status_number_idx`. Postgres reads every published chapter of the story, then sorts.
- Cost: history and library pages pay this 20 times. `getContinueReading` pays it on every story-page view by a signed-in reader. Long web novels (1–3k chapters) mean about 60k rows per history page.
- Fix: two index-backed probes inside the lateral (both are `(story_id, status, number)` range scans with LIMIT 1; `deleted_at` stays a residual filter), keeping the same semantics.
  ```sql
  select * from (
    (select id, number, title from chapters
      where story_id = rp.story_id and status = 'published' and deleted_at is null
        and number <= saved_chapter.number order by number desc limit 1)
    union all
    (select id, number, title from chapters
      where story_id = rp.story_id and status = 'published' and deleted_at is null
        and number > saved_chapter.number order by number asc limit 1)
  ) c order by (c.number > saved_chapter.number) limit 1
  ```
- This could also be deferred and noted in the plan. It is correct today, just O(chapters) per row.

## Low

### L1. `bodyLimit` scoping
`packages/api/src/routes/reading.ts:60-61`

- Scoping is sound: `.use('/progress')` matches the exact path only, so `GET /progress/:publicId` and `DELETE /history/:publicId` skip it. `PUT|POST /progress` and `POST /view` stay limited.
- Two gaps:
  - **`/view` lost its 413 test.** The old global `use` covered it implicitly; only `/progress` is tested (`reading.test.ts:59`). Add the same test for `/view`.
  - A future body route on this sub-app gets no limit silently. Extend the comment to say "add `limitBody` to any new route that reads a body".

### L2. `useSetShelf` rollback race
`apps/web/src/lib/library.ts:54-63`

- Sequence: mutation A (prev P) is in flight, B starts (prev = A's optimistic value), then A fails. The rollback writes P over B's optimistic value.
- A's `onSettled` invalidation can also refetch before B commits, which causes flicker.
- It self-heals on B's settle. Fix (optional):
  - add `mutationKey: [...libraryQueryKey, 'set']`;
  - in `onError`/`onSettled`, skip rollback and invalidation when `queryClient.isMutating({ mutationKey }) > 1`.

### L3. Failed writes are silent
`library-button.tsx`, `library-item.tsx`, `history-list.tsx`

- Add, move and remove roll back with no message, and a failed history removal does nothing visible.
- Fix: show `m.error_generic()` near the control on `mutation.isError`, or use whatever feedback pattern the editor uses.

### L4. `useResumeScroll` and the 18+ gate
`apps/web/src/lib/reader/use-resume-scroll.ts:23-50`

- It consumes the handoff and scrolls even when the 18+ gate is shown, so the position is lost once the reader passes the gate. This is rare: progress implies the reader once had 18+ enabled.
- A user scroll during the ≤500 ms font wait is overridden.
- The timeout timer is not cleared on cleanup (harmless).
- Fix (optional): pass `enabled = !gated` and defer the take until enabled.

### L5. `/library` pagination reloads the page
`apps/web/src/routes/library.tsx:22-26`, `:134`

- Pagination uses `Pagination`, which renders `<a>` document links. Every page change reloads the app on a personal page whose tabs are SPA links.
- Two URL forms exist: the header and tabs emit `page=1`, while `libraryHref` omits it.
- Harmless (noindex, no-store), but inconsistent. Either accept it or pass a `Link`-based renderer.

### L6. Test placement
- `getContinueReading` is tested in `reading/history.int.test.ts`. The plan listed `continue.int.test.ts`.
- `core/library/library.test.ts` tests `SHELVES` (shared) and `resumeScrollPct` (continue).
- Fine functionally. Moving them next to their modules makes them easier to find.

## Deviations, verified

1. **µs cursor: sound.**
   - Postgres 18 (`docker-compose.yml`), where `extract(epoch …)` returns numeric, so `*1e6::bigint` is exact.
   - Rebuilding the timestamp as `timestamptz 'epoch' + n * interval '1 µs'` is exact: interval time is int64 µs and n < 2^53.
   - Writes use `now()`/`defaultNow()` (µs). The row comparison and `ORDER BY` use the same pair and collation.
   - The int test covers ties plus ±1 µs neighbours on page boundaries (limit 4, 12 pages).
2. **Shared lateral instead of `resolveReadableChapter`: sound.**
   - Order `(n > saved) asc, abs(n - saved)` gives: the saved chapter if readable, else the nearest below, else the nearest above, which equals the smallest readable. That matches the plan.
   - It uses `status = 'published' AND deleted_at IS NULL`, the chapter half of `canReadChapter`; the story half comes from `publicStoryWhere`.
   - A left lateral with no progress returns NULLs (the `story_id = NULL` predicate). No N+1.
   - Only the cost caveat in M3 remains.
3. **Tracking off while resuming: sound.**
   - `useMe` is pending on the first client render after a document load, so the tracker cannot fire before `setRestoring(true)`. The layout-effect setState re-renders before paint.
   - Re-enabling after the scroll records the restored position, not 0.
   - The e2e asserts that no PUT goes below the saved value minus 10.
   - StrictMode: the ref keeps the taken pct across the double effect and is cleared after the scroll, so there is no double take and no re-scroll.
4. **Page clamp: sound.** The response returns the effective `page` and the UI renders it (removing the last item on page N then shows N-1).

## Acceptance checklist

| Criterion | Result |
|---|---|
| API shapes match the plan | OK |
| 401 for guests on all routes, `no-store` | OK (`library.test.ts:46`) |
| No UUID in responses | OK (int tests regex the bodies) |
| PUT draft/unknown → 404 `NOT_FOUND` | OK |
| DELETE is idempotent 204 | OK |
| `added_at` kept on a shelf move | OK (`onConflictDoUpdate` sets `shelf` only) |
| Hidden stories and banned authors filtered, rows kept, return when restored | OK |
| Story page stays public cache with no cookie | OK (e2e) |
| SSR markup matches the first client render | OK (me pending → neutral buttons), no hydration mismatch |
| Document navigation to public pages | OK (`ResumeLink` uses `location.assign`; titles are plain `<a>`) |
| Handoff in sessionStorage, not a query | OK |
| `/library` `NO_STORE` + noindex, no personal SSR data | OK |
| i18n | OK: all strings via `m.*` |
| Sign-out drops the caches | OK: keys live under `['me', …]`, and `useSignOut` removes keys longer than `['me']` |
| Public contract | Additions only: `/library/*`, 3 reading routes, shared exports |
| IDOR | None: every query is keyed on the session user |
| CSRF on PUT/DELETE | Covered by the v1 `csrf` middleware (tested) |

## Recommended actions

1. M1: make the header fit 360 px (icon-only below `sm`, or move items into the account menu).
2. M2: add the AI badge and last update to the library/history rows, ideally through a shared facts block.
3. M3: use index-backed resume lookups, or log this as known debt.
4. L1: add a 413 test for `/view`.
5. L2/L3: optional mutation race guard and an error message.

## Unresolved questions

- Is the pre-existing header overflow at 360/390 px (without the new link) a known issue? If not, M1's fix should cover the whole header, not just the new item.

Status: DONE_WITH_CONCERNS
Summary: Phase 12 is functionally complete. SQL, keyset, auth and cache boundaries are verified and all four deviations are sound. Three Medium issues: mobile header overflow (probe: 512 px content at 360–414 px), the library row missing the AI label and last update, and the O(chapters) resume lateral.
