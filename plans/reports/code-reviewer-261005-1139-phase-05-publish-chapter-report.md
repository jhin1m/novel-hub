# Code Review: Phase 5, publish chapter and scheduling

## Scope
- Files: 32 modified, about 30 new (core/content, core/publishing, worker publishing/content, web publish UI, migration 0001, tests)
- LOC: about 940 changed and about 2,300 new
- Focus: the uncommitted diff, checked against `plans/261004-1654-giai-doan-1-doc-va-viet/phase-05-dang-chuong-va-hen-gio.md`
- Probes: a scratchpad `.mjs` imported `walker.ts` and `sanitize.ts`. Walker output was byte-identical to sanitized output for CR/LF, NUL, lone surrogate, BOM, `&copy` (no `;`), `AT&T;`, `&#x26;`, `</p><script>`, quotes, empty heading and empty blockquote. A 20k-word chapter renders and sanitizes in about 2-4 ms, so rendering while holding locks is cheap.

## Overall Assessment
This is a solid implementation and no blocking defects were found. Every acceptance criterion except the UI part of AC8 matches the code:
- Render pipeline: parse, then normalize pids, walker, sanitize, word count and sha256. Heading level and pid are also enforced by `parseEditorDoc`.
- Locking: story, chapter and draft are locked in that order, with the base checked under the draft lock and a conditional pid write that throws to roll back.
- Errors: every `err()` return in a transaction happens before any write, so a commit on those paths never leaves partial rows.
- Revisions: written only when the hash changes, keeping the newest 20.
- Counters: recomputed from scratch, and a story moves from draft to published only when it was draft.
- Outbox: written in the same transaction on every public path.
- Drain: SKIP LOCKED, a 10 s timeout, attempts incremented on failure, and no `jobId`.
- Sweeper: candidate filter, a re-check under the locks, one transaction per chapter.
- Worker: queues, intervals, concurrency and shutdown order are correct.

The remaining issues are UX and state-consistency gaps around scheduling and the "unpublished changes" badge, plus some operational hygiene.

## Critical Issues
None.

## High Priority
None.

## Medium Priority

1. **"Update scheduled version" is rejected in the last 5 minutes and whenever the sweeper is late.** Files: `apps/web/src/components/editor/chapter-editor.tsx:361`, `packages/core/src/publishing/schedule-chapter.ts:33`.
   - The banner sends the existing `scheduledAt` again, and `validateScheduleTime` requires it to be at least 5 minutes ahead.
   - Scenario: a chapter is scheduled for 20:00. At 19:56 the author fixes a typo and clicks "Cập nhật bản hẹn giờ". The server returns 422 `INVALID_SCHEDULE_TIME`, with a message about choosing a time 5 minutes ahead, which the author never did.
   - The same happens after `scheduledAt` has passed but before the sweep runs.
   - Fix: when the chapter is already `scheduled` and `scheduledAt` is unchanged, skip `minLeadMs`. Alternatively, give the banner action its own content-only path. Either way, show a clear message in the UI.

2. **The "Có thay đổi chưa đăng" badge goes out of sync with the server.** Files: `packages/core/src/chapters/drafts.ts:68`, `packages/core/src/publishing/publish-chapter.ts:106`.
   - (a) The author publishes, edits (autosaved), reverts the edit (autosaved again) and clicks "Cập nhật". The server answers `unchanged` and writes nothing. The UI clears the badge, but after a reload `draft.updated_at > max(revision.created_at)` and the badge comes back. It stays until the content really changes.
   - (b) `saveDraft` computes `updatedAt` before it waits on the draft row lock. A save from another tab that is queued behind a publish without pid changes then commits with `updated_at` older than the revision's `created_at`. The badge says "no changes" although the draft differs from what was published.
   - Fix: base the flag on content, not timestamps. One option is to render the draft and compare `contentHash` with `chapter_contents.content_hash` (about 3 ms). Another is to store the source draft version on the revision.

## Low Priority

3. **`setEditable(false/true)` causes a spurious update and an unsaved state right after publishing.** File: `chapter-editor.tsx` (`runPublish`).
   - In Tiptap 3.31 `setEditable(editable, emitUpdate = true)` emits `update`. That runs `autosave.change` and `mirror.write`.
   - No data is lost, because the flush finds identical JSON. But for about 2 s after publishing the status shows unsaved, `hasPendingChanges()` is true (closing the tab then triggers a beforeunload prompt), and the local mirror is rewritten.
   - Fix: call `setEditable(x, false)`.

4. **The minimum time in the publish dialog can be rejected by the server.** File: `publish-dialog.tsx:72`.
   - `min` is `now + 5 min` cut to the minute, so picking exactly that value is up to 59 s short of the server rule. It also goes stale while the dialog stays open.
   - Fix: round `min` up to the next minute and add a 1-minute margin.

5. **Deleting a chapter does not refresh the story query.** File: `apps/web/src/lib/chapters.ts:177`.
   - `useDeleteChapter` invalidates only the chapters key (exact). After deleting a published chapter, the story's counters and last update stay stale in the writing area.
   - Fix: invalidate `myStoryQueryKey(publicId)` as well.

6. **No UI resync after 409s from races.** If the sweeper publishes just before the author clicks "Huỷ hẹn" (`NOT_SCHEDULED`), or a reschedule returns `ALREADY_PUBLISHED`, the editor keeps `chapter.status = 'scheduled'` and the banner stays.
   - Fix: refetch the chapter view on these codes.

7. **The outbox prune runs every 5 s without an index.** File: `packages/core/src/content/outbox.ts:132`.
   - `DELETE ... WHERE processed_at < now() - 7 days` sequentially scans up to 7 days of processed events on every tick.
   - Fix: prune from the 60 s sweep or once per N ticks, or add an index on `processed_at`.

8. **A throwing `mapChange` would block the outbox.** File: `outbox.ts:91`.
   - A throw rolls back the whole batch without incrementing `attempts`. The same head-of-line event then fails on every tick, so the outbox never drains.
   - This cannot happen today because `jobsForChange` returns `[]`. It becomes a risk in phase 9 and later.
   - Fix: wrap each event's mapping in try/catch and count failures per event.

9. **Failed periodic jobs pile up in Redis.** File: `apps/worker/src/publishing-worker.ts:70`.
   - With `removeOnFail: { age: 86400 }` on a 5 s job, a one-day DB outage keeps about 17k failed jobs with stack traces in Redis.
   - Fix: use `{ count: 100 }` or a shorter age.

10. **Chapters without content block the sweeper's candidate list.** File: `packages/core/src/publishing/publish-due.ts:55`.
    - A scheduled chapter without `chapter_contents` is skipped and logged every minute forever, and stays at the head of the `ORDER BY scheduled_at LIMIT 100` list. Data in this state cannot be produced through the API.

11. **The worker's DB pool is smaller than its worst-case demand.** `max: 5` against publishing concurrency 2 plus content concurrency 4. That is fine for now because no content job exists yet. Revisit in phase 9 or 11.

## Edge Cases Checked (no defect)
- **Two tabs publishing with the same base:** the second waits on the story lock. If pids changed it gets `DRAFT_CONFLICT`, otherwise `unchanged` with nothing written.
- **Sweeper races with publish, unschedule, reschedule or delete:** the re-check under the story and chapter locks rejects all of them, and lock order is the same everywhere.
- **Foreign keys:** the FK `KEY SHARE` locks taken by the inserts (contents, revisions) fall on rows already locked, so there is no deadlock cycle.
- **Publishing a scheduled chapter now:** it renders the current draft. If the hash matches, no new revision is written. `scheduledAt` is cleared.
- **API bodies:** `now` cannot be injected through the request (Zod strips unknown keys). Responses contain no internal ids.
- **Seed:** `{ docJson, ...render() }` spreads extra keys into the insert, and Drizzle ignores them. `truncatePublicTables` already covers `content_events`.
- **Regressions:**
  - `updateChapterMeta` is now transactional, with the story then chapter lock, and maps `CHAPTER_HIDDEN_BY_MOD` to 409 with a web message.
  - `getDraft` gains a field.
  - The signatures of `updateStory`, `setStoryCover` and `removeStoryCover` are unchanged.
  - `seedDatabase` has a new optional parameter.
- **XSS:** text and attributes are escaped, there is a `sanitize-html` allowlist with no schemes and `discard` mode, and `parseEditorDoc` rejects invalid pids and heading levels.

## Positive Observations (for risk calibration)
- Concurrency tests run on a real DB: a held draft lock with publish and autosave queued behind it, concurrent sweeps, concurrent drains, and concurrent publishes plus deletes on counters.

## Recommended Actions
1. Fix #1: allow a content-only reschedule at the same time.
2. Fix #2: base `hasUnpublishedChanges` on content.
3. Make the one-line fixes #3, #4 and #5.
4. Note #7, #8 and #9 for phase 9, when the first content job lands.

## Plan Follow-ups
- All items in the Function / Interface Checklist are present in the code.
- Checkbox 4 of Giai đoạn 1 in `docs/project-spec.md` is not marked yet (step 13).
- The plan lists `routes/write/stories/$publicId/chapters/$number.tsx` as modified, but it is unchanged. That does not appear to be needed, because `ChapterEditor` takes care of it.

## Unresolved Questions
- Should an author be able to soft-delete a `hidden_by_mod` chapter? The plan freezes publish, schedule and metadata edits, but says nothing about delete. Phase 15's restore would need to handle deleted chapters.
- Should a late sweep set `published_at` to the sweep time or to `scheduled_at`? The current code uses the sweep time.
