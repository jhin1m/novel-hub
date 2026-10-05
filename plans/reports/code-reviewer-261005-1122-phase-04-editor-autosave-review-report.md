# Phase 4 review: Tiptap editor and autosave

Scope: uncommitted diff (20 modified, ~35 untracked files). Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-04-editor-tiptap-autosave.md`.
Score: **7.5/10**. Server side (core, API, shared schema check, ESLint boundaries) is solid. The client lifecycle has one real data-integrity race and a few smaller state-machine gaps.

Probes run (no repo edits): TanStack Query invalidate/refetch semantics (node probe), autosave edge cases (node probe importing `autosave.ts`), ESLint deep `@tiptap/pm/model` import, Tiptap `getJSON` after destroy, UniqueID paste/onCreate source.

## Critical

None.

## High

### H1. Saving the chapter title or author note re-fetches the draft and recreates autosave, which can cause false 409 conflicts and unmount the editor
- `apps/web/src/lib/chapters.ts:104`: `useUpdateChapterMeta` invalidates `myChaptersQueryKey(publicId)`. The draft query key is `[...myChaptersQueryKey, number, 'draft']` (`chapters.ts:58`), so the prefix match includes it. Invalidation refetches active queries even with `staleTime: Infinity` (checked with a probe: `calls 1 → 2`).
- `apps/web/src/components/editor/chapter-editor.tsx:140`: the effect deps include `draft.updatedAt`. When the refetched version differs, cleanup runs `autosave.flush()` on the old instance. A new instance starts right away with `initialBase` = the refetched version and `initialJson` = the current editor JSON.
- **Failure scenario:** at least one autosave has already run. The author types in the editor, then edits the title or note and blurs it within the 2 s debounce (or while a PUT is in flight). The GET returns version Vn. Cleanup flushes the pending edits with the old base, so the server moves to Vn+1. The new instance holds Vn, so the next keystroke gets 409 and the conflict banner appears for the author's own edits. The old and new instances can also have requests in flight at the same time (this breaks "one request in flight"), and both call `setStatus`, so status flickers.
- **Second failure:** `retry: false`, so a single failed refetch puts the query in `status: 'error'` while `data` is kept (probe: `isError true`). `$number.tsx:42` then swaps `ChapterEditor` for a generic error. The editor unmounts mid-writing, and the undo history is gone.
- **Fix:** load the draft once.
  - Move the draft key out of the chapters prefix (e.g. `['me', 'draft', publicId, number]`), or invalidate with `exact: true` / a predicate that skips `'draft'`.
  - Drop `draft.updatedAt` from the effect deps. Read the initial draft through a ref, since `ChapterEditor` is already keyed per chapter.
  - Optionally render from `draft.data` whenever it exists, even when `isError` is true.
  - Add an e2e step: type, blur the title, type, and expect no conflict.

## Medium

### M1. `canEditChapter` is never used
- `packages/core/src/policies/story.ts:15`, `packages/core/src/chapters/load-owned-chapter.ts:21`: chapter access goes through `loadOwnedStory` → `canEditStory`. The plan says "every chapter route: ... + `canEditChapter`", and spec §7/§9 say permissions go through `core/policies`. Behaviour is the same today. But once chapter permission diverges from story permission (mods, co-authors), changing `canEditChapter` would have no effect. Only its unit test calls it.
- **Fix:** in `loadOwnedChapter`, load the story without the story policy and then call `canEditChapter`. The alternative is to delete `canEditChapter` until it is needed.

### M2. A save that lands on the server but loses its response turns into a conflict with the author's own edit
- `apps/web/src/lib/chapters.ts:87` and `autosave.ts:147`: the server commits the update, then the response is lost (proxy 502/504, timeout, or `res.json()` throws). This is treated as `retryable`. The retry sends the old base, so the server returns 409 and the user sees "Chương đang được sửa ở nơi khác" for their own write.
- **Fix:** on 409, `GET` the draft. If `sameDoc(latest.doc, sentDoc)`, call `rebase(latest.updatedAt, json)` silently. Otherwise enter the conflict state.

### M3. `WriterGate` can unmount the editor when the background `/me` refetch fails
- `apps/web/src/lib/me.ts` (staleTime 60 s, default `refetchOnWindowFocus`, 3 retries) and `writer-gate.tsx:19`: when the author returns to the tab during a 5xx window (deploy restart), `me.isError` replaces the whole editor. This was a pre-existing component, but the editor is the first page where unmounting costs work in progress. The mirror saves the text, but the session is lost.
- **Fix:** in `WriterGate`, keep rendering children when `me.data` exists, even with `isError`.

## Low

- **L1. `autosave.ts:169-172`: the error status sticks after an undo.** Retry fails, then the author undoes back to the saved content. `flush` skips the save but keeps `status: error` (probe: `pause() → {kind:'error', retryInMs:2000}` with `hasPendingChanges() === false`). Phase 5's "publish only when `pause()` returns `saved`" would then refuse a fully saved draft, and the UI shows "thử lại sau 2s" forever. Fix: emit `saved` whenever the JSON equals the last saved JSON.
- **L2. `autosave.ts:113-121, 176`: latent hang if `save` throws synchronously.** `inFlight = null` runs before `inFlight = runSave(...)` is assigned, so `inFlight` stays as a resolved promise forever. Saving stops and `hasPendingChanges()` stays true (probe confirmed). Any later `flush()` would spin `while (inFlight) await inFlight` and freeze the tab. This does not happen today because `saveDraftRequest` is `async`. Fix: call `opts.save` behind `await Promise.resolve()`, or have `flush` clear `inFlight` after awaiting.
- **L3. `autosave.ts:199`: `rebase()` during an in-flight save gets overwritten** by that request's outcome (`base = outcome.updatedAt`, or `stopped = true` on 409). Phase 5/6 follow pause→rebase, so they are safe. Document the precondition or guard it (`if (inFlight) throw`).
- **L4. `chapter-editor.tsx:117-120`: `pagehide` flush does nothing while a save is in flight.** `flush` awaits `inFlight`, and the page is gone before the keepalive request is sent. The mirror covers it, which matches the plan. Worth a comment.
- **L5. `chapter-editor.tsx:55-58, 167-174`: Restore ignores `mirror.baseUpdatedAt`.** If another device saved after the mirror was written, "Khôi phục" silently replaces newer server content. It can be undone within the session but nothing warns about it. Mirrors that equal the server doc are never deleted either, so keys pile up in localStorage. Fix: when `sameDoc`, clear the mirror at load; when `mirror.baseUpdatedAt !== draft.updatedAt`, change the banner wording.
- **L6. `chapter-editor.tsx:115`: `beforeunload` only calls `preventDefault()`.** Also set `event.returnValue = ''` for older Safari/WebKit.
- **L7. `focus-toggle.tsx:29`: `Escape` also leaves focus mode while an IME is composing** (Vietnamese input methods). Check `event.isComposing`.
- **L8. Two tabs share the mirror key `draft:{publicId}:{number}`** and overwrite each other's mirror. Acceptable, but undocumented.
- **L9. Dev databases seeded before this change still have pids like `p1`.** UniqueID keeps them and `parseEditorDoc` rejects them, so every save returns 422 and autosave stops with a fatal error. The plan notes `pnpm db:seed --reset`; say it in the handoff. In general a fatal 413/422 only shows the generic "Lỗi, không lưu được" with no reason.
- **L10. Duplicated error message.** `DRAFT_TOO_LARGE` lives in `CORE_ERROR_STATUS` although core never returns it, and the message is repeated in `routes/chapters.ts:64`. Use `coreError(c, 'DRAFT_TOO_LARGE')` in `onError`, or keep the code API-local.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Debounce 2 s / maxWait 10 s / one in flight / extra save after in-flight edits / skip unchanged JSON | OK in the unit tests. In the component, H1 breaks "one in flight". |
| Backoff 2-4-8-16-30 s on retryable errors; stop on conflict and fatal errors | OK (L1 is an edge case) |
| pause / resume / rebase | OK, with caveats L1 and L3 |
| 5 save statuses | OK (`save-status.tsx`) |
| Mirror `draft:{publicId}:{number}` + restore banner; sameDoc ignores key order | OK (L5, L8) |
| Conflict banner: load latest / keep mine | OK. `setContent(..., {emitUpdate:false})` + rebase is correct. |
| Focus mode hides everything but text + faint status, Esc exits, stored in `editor:focus` | OK (L7) |
| Chapter numbers never reused (soft-deleted rows counted, concurrent creates safe) | OK: story `FOR UPDATE` + `max()` over all rows + `onConflictDoNothing` retry; int test with 5 parallel creates |
| No internal ids in API/URL/localStorage | OK (`expectNoInternalIds` in API int test) |
| 409/422/413 in `{error:{code,message}}` | OK. `bodyLimit` runs after the auth guard, so unauthenticated large bodies are not read. |
| Server validates the doc against the editor schema before storing | OK: `parseEditorDoc` (fromJSON + check + pid/level attrs), and the normalized JSON is what gets stored |
| core/db still blocked in all browser web files, incl. the editor area | OK. Shared constants, no option override, `lint-boundaries.test.ts`. Deep `@tiptap/pm/model` is blocked too (probe). |

Timestamp precision: correct. Reads and compares both use `date_trunc('milliseconds')`, and writes set the time in the app. `nextDraftVersion` guarantees a later version within the same millisecond. Two concurrent saves with the same base: the second re-checks its WHERE after the first commits (READ COMMITTED), matches 0 rows and gets `DRAFT_CONFLICT`. The int test covers a microsecond-precision seed row.

Touchpoints: no regressions found.
- The chapters sub-app inherits the stories `sessionMiddleware` and does not run it twice.
- The seed's local `countWords` was never exported, so the seed change breaks no public contract.
- ESLint restrictions for core/db/env/server are kept.
- `@novel-hub/shared` main entry still pulls in no Tiptap.

Public contract additions only: `/api/v1/stories/:publicId/chapters/*` and `/api/v1/me/stories/:publicId/chapters`.

## Unresolved questions

1. H1: should the draft query move out of the chapters key prefix, or should meta saves invalidate only the list query? Either fixes it; the first also protects later phases.
2. M1: route chapter permission through `canEditChapter` now, or delete it until a policy actually differs?
3. M2: is the silent auto-rebase on a 409 whose server doc equals the sent doc acceptable product-wise? It changes what "conflict" means slightly.
