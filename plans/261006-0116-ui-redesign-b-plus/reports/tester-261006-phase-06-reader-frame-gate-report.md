# Phase 6 Reader Frame Redesign — Quality Gate Report

**Date:** 2026-10-05 22:41 UTC  
**Branch:** `overnight/261006`  
**Scope:** Reader page redesign (UI refactor, components, styles, i18n)

---

## Gate Execution Summary

| Step | Status | Duration | Details |
|------|--------|----------|---------|
| `pnpm typecheck` | ✅ PASS | 10.36s | All 7 workspaces: no type errors |
| `pnpm lint` | ✅ PASS | <1s | Clean; no ESLint violations |
| `pnpm format:check` | ✅ PASS | <1s | All files conform to Prettier |
| `pnpm test` (unit) | ✅ PASS | 10.36s | 672/672 tests pass; 100 test files |
| `pnpm test:int` (integration) | ❌ FAIL | 97.86s | 1 failed, 300 passed, 1 skipped |
| `pnpm test:e2e` | ⏭️ SKIPPED | — | Stopped at first gate failure |

**Gate Status:** STOPPED AT INTEGRATION (step 5 of 6)

---

## Failures

### Integration Test Failure

**File:** `apps/worker/src/publishing-worker.int.test.ts`  
**Test:** "a sweep job publishes due chapters and a drain job empties the outbox" (line 152)  
**Error:**

```
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ apps/worker/src/publishing-worker.int.test.ts:152:55
    150|     const left = await db.select().from(contentEvents);
    151|     expect(left.length).toBe(pending.length + 1);
    152|     expect(left.every((e) => e.processedAt !== null)).toBe(true);
       |                                                       ^
    153|     expect(info).toHaveBeenCalledWith('[publishing] published 1 schedu…
```

**Root Cause:** After the drain job completes, not all `contentEvents` rows have `processedAt` set (at least one event has `processedAt === null`). The test expects 100% of events to be marked as processed.

**Relevance to Phase 6 Changes:** This failure appears **unrelated** to reader page redesign. Phase 6 touched only:
- Reader UI components (chapter-header, reader-controls, reader-top-bar, etc.)
- Reader styles (reader.css)
- Localization strings (vi.json)
- Mobile navigation spec

The publishing-worker test exercises the job queue and database logic, which were not modified in this phase.

---

## Test Coverage by Category

### Unit Tests: PASS
- **Count:** 672 tests in 100 test files
- **Coverage:** Includes reader utilities (chapter-heading.test.ts), core services, API layer
- **New test:** `apps/web/src/lib/reader/chapter-heading.test.ts` (part of phase 6) passes

### Integration Tests: PARTIAL
- **Count:** 300 passed, 1 failed, 1 skipped (S3 not configured, expected)
- **Passed:** 39 test files including story, chapter, auth, and database layer
- **Failed:** 1 test in publishing worker (pre-existing or environment-related)

### E2E Tests: NOT RUN
- Execution blocked by integration test failure per gate protocol
- Mobile navigation spec updated as part of phase 6

---

## Unresolved Questions

1. **Is the publishing-worker test failure pre-existing?** Need to check if this test passed on main before phase 6 changes.
2. **Is there an environment issue with Redis/Postgres?** The test touches real infrastructure; timing or concurrency could cause intermittent failures.
3. **Should phase 6 gate be conditional?** The failure is in a different subsystem (worker publishing). Should the reader UI gate proceed to e2e while worker issues are resolved separately?

---

## Recommendations

1. **Isolate the worker failure:** Run only the publishing-worker.int.test.ts on main to confirm it's pre-existing.
2. **If pre-existing:** Proceed to e2e tests for phase 6 reader redesign (unaffected subsystem).
3. **If caused by phase 6 indirectly:** Review any schema or service layer changes that might affect event processing.
4. **If intermittent:** Mark as flaky and rerun once on current branch after fixing any detected issues.

---

**Status:** BLOCKED  
**Summary:** Typecheck, lint, format, and unit tests all pass. One integration test fails (publishing-worker, likely unrelated). E2E gate not executed pending resolution.  
**Concerns:** Worker integration test failure blocks full gate; appears unrelated to reader UI changes but needs confirmation.
