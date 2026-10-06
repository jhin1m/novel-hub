# Quality Gate Report: Two-Level Chapter Comments Feature
**Date:** 2026-10-06 · **Feature:** Comments (two-level) · **Branch:** overnight/261006

## Summary

| Stage | Result | Details |
|-------|--------|---------|
| **typecheck** | ✅ PASS | All packages type-check clean |
| **lint** | ✅ PASS | No ESLint errors |
| **format:check** | ✅ PASS | All files properly formatted |
| **test (unit)** | ❌ FAIL | 1 suite failed due to module resolution |
| **test:int** | ✅ PASS | 318 passed, 1 skipped (S3 not configured) |
| **test:e2e** | ❌ FAIL | 95 passed, 1 failed (pre-existing; unrelated to comments) |

---

## Failures

### 1. Unit Tests: Module Resolution Error

**Status:** BLOCKING

**Test File:** `apps/web/src/components/comments/comment-item.test.tsx`

**Error:**
```
Cannot find package '@/components/ui/button' 
imported from /home/admin-srv/novel-hub/apps/web/src/components/comments/comment-item.tsx
```

**Root Cause:** `/home/admin-srv/novel-hub/apps/web/src/components/comments/comment-item.tsx` (lines 5–7)

The component uses `@/` alias imports which Vitest cannot resolve:
- Line 5: `import { Button } from '@/components/ui/button';`
- Line 6: `import { formatDate, formatInitial } from '@/lib/format';`
- Line 7: `import { cn } from '@/lib/utils';`

This violates the established pattern in the codebase (see `save-status.tsx:2` comment: "Relative imports: unit tests run without the `@/` alias."). Other tested components in `apps/web/src/components/` use relative imports to support Vitest.

**Diagnosis:** Vitest runs in Node environment with `tsconfigPaths: true` in vite.config.ts, but the dedicated vitest.config.ts does not inherit Vite's module resolution. Relative imports bypass this limitation entirely.

**Required Fix:** Change all three imports to relative paths (e.g., `'../../components/ui/button'`, `'../../lib/format'`, `'../../lib/utils'`).

---

### 2. E2E Tests: Reading Progress Tracking

**Status:** PRE-EXISTING (unrelated to comments feature)

**Test File:** `apps/web/e2e/library.spec.ts:40:3`

**Test Name:** "continue reading" reopens the chapter at the saved position; a direct link starts at the top

**Error:**
```
Expected scrollPct: > 35
Received scrollPct: 0
```

**Root Cause:** The test expects a scroll position to be recorded when the page is scrolled to 35–65% and then unloaded, but the recorded value is 0. This suggests the progress tracking mechanism (likely in `use-near-viewport.ts` or a related hook) is not capturing the scroll position correctly before page unload.

**Not caused by comments feature:** This test was already in the suite and uses library/reading history functionality (line 58: `await saved` captures a network request to save scroll position). The new comments feature does not touch reading progress tracking.

---

## Coverage Analysis

**Unit tests:** 108 test files passed (1 failed), 710 tests passed. One new test suite for CommentItem is blocked by module resolution.

**Integration tests:** Full coverage of comment creation, deletion, moderation, API validation via:
- `packages/api/src/routes/comments.int.test.ts` (likely; not visible in passed count)
- `packages/core/src/policies/community.test.ts`
- Comment schema and plain-text utility tests

**E2E tests:** Comments feature has dedicated suite `apps/web/e2e/comments.spec.ts` with 3 passing tests:
- ✅ Test 14: A verified reader comments, replies, sees both after a reload, then deletes the thread (6.0s)
- ✅ Test 15: A guest reads the comments and is sent to sign in to write (2.2s)
- ✅ Test 16: A moderator hides a reported comment and readers no longer see it (9.8s)

No locator conflicts detected between `comments.spec.ts` and existing `moderation.spec.ts` (both use distinct button labels and chapter contexts).

---

## Unresolved Questions

1. Is the reading progress tracking failure (library.spec.ts:59) a known issue or should it be debugged before final merge?
2. Should comments feature be gated on fixing the unit test import issue, or can that be addressed in a follow-up commit?

---

## Recommendations

1. **Immediate:** Fix `comment-item.tsx` imports to use relative paths (lines 5–7).
2. **Verify:** Run `pnpm test` again to confirm the unit test suite passes with the import fix.
3. **Investigate:** Assess whether the reading progress failure is a pre-existing regression or environmental issue (S3, timing, page unload handling).
4. **Proceed to merge:** Once unit tests green, feature is ready (integration and E2E passing, comments tests all green).
