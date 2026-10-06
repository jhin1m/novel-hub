# Quality Gate Report: Themed Contests Feature

**Date:** 2026-10-06  
**Feature:** Themed contests (phase 09, stage 2)  
**Scope:** Full sequential gate (typecheck → lint → format:check → test → test:int → test:e2e)  
**Verdict:** ✘ **FAILED** — 1 failing E2E spec unrelated to core contest functionality

---

## Test Results Summary

| Step | Result | Details |
|------|--------|---------|
| `pnpm typecheck` | ✓ PASS | All 7 workspaces pass TypeScript strict checks |
| `pnpm lint` | ✓ PASS | ESLint clean, no violations |
| `pnpm format:check` | ✓ PASS | Prettier formatting compliant |
| `pnpm test` (unit) | ✓ PASS | 130 test files, 802 tests passed |
| `pnpm test:int` (integration) | ✓ PASS | 56 test files passed, 1 skipped (S3 config absent—expected); 411 tests passed |
| `pnpm test:e2e` | ✘ FAIL | 109 passed, 1 failed; see below |

---

## Failing Test: Mobile Responsive Regression

**Test:** `e2e/mobile-navigation.spec.ts:149:3`  
**Name:** "the moderation filters wrap instead of overflowing"  
**Status:** ✘ FAILED  
**Viewport:** 360px (mobile)

### Error Details
```
Error: expect(received).toBeLessThanOrEqual(expected)
Expected: <= 360
Received: 375

at expectNoHorizontalScroll (/home/admin-srv/novel-hub/apps/web/e2e/mobile-navigation.spec.ts:28:23)
at /home/admin-srv/novel-hub/apps/web/e2e/mobile-navigation.spec.ts:161:5
```

### Root Cause
**File:** `apps/web/src/routes/moderation.tsx:28`  
**Cause:** The contests feature added a 4th tab (`'contests'`) to the moderation tab bar. The tab row uses `inline-flex gap-1` (no wrap) to render 4 pill-shaped tabs, which exceeds the 360px mobile viewport width. Calculated width is now 375px.

```typescript
// apps/web/src/routes/moderation.tsx:28
const MODERATION_TABS = ['reports', 'tags', 'featured', 'contests'] as const;
```

The TabLinks component renders these with `SEGMENTED_LIST_CLASS` (`inline-flex gap-1 rounded-full`) which does not wrap. The "Cuộc thi" (Contests) tab label adds ~15px to the tab bar width, pushing it from ~360px to 375px on a 360px mobile screen.

### Test Purpose
The test verifies that the moderation page's filter navigation fits the 360px mobile viewport without horizontal scroll—a mobile UX requirement. The test itself is correct; the feature introduced a regression.

### Is This Contest-Related?
**Yes.** The failure directly stems from adding the contests tab. No other changes in the feature affect the moderation page layout. The new tab is the cause.

---

## Contest Feature Test Coverage

**Core contest E2E test:** ✓ PASS  
- `e2e/contests.spec.ts:20:1` — "a moderator runs a contest: an author enters a new story, the moderator awards first place" (12.5s)

All contest API routes, schemas, database migrations, and integration tests passed without failures.

---

## Detailed Test Metrics

### Unit Tests (Vitest, no Docker)
- **Files:** 130 passed
- **Tests:** 802 passed  
- **Duration:** 13.01s
- **Status:** ✓ All pass

### Integration Tests (Vitest on real Postgres/Redis)
- **Files:** 56 passed, 1 skipped
- **Tests:** 411 passed, 1 skipped
- **Duration:** 139.01s
- **Skipped:** S3 config absent (expected; MinIO not used in test env)
- **Contest-related:** Passing (contests API integration test in `packages/api/src/routes/contests.int.test.ts`)
- **Status:** ✓ All functional tests pass

### E2E Tests (Playwright on localhost:3100, test DB/Redis)
- **Total:** 110 tests, 109 passed, 1 failed
- **Duration:** 7.9 minutes
- **Passed:** Auth, editor, chapters, publishing, ratings, comments, follows, library, rankings, search, mobile nav (most), desktop nav, all catalog pages, reader settings, 18+ content gates, footer links
- **Failed:** Mobile responsive check on moderation page (375px > 360px limit)
- **Status:** ✘ Regression in mobile responsive behavior

---

## Coverage Impact: Contests Feature

| Area | Result | Notes |
|------|--------|-------|
| **Schema** | ✓ Pass | All contest schema migrations validated; no type errors |
| **API routes** | ✓ Pass | Contests API GET/POST/DELETE passing; perms enforced |
| **Database** | ✓ Pass | Drizzle schema and migrations compile; int tests pass |
| **Core logic** | ✓ Pass | Contest create, list, award placement, perms logic covered |
| **UI components** | ✓ Pass | Contest form, admin list, placements render; `e2e/contests.spec.ts` passes |
| **Footer link** | ✓ Pass | "Cuộc thi" link added to footer; test suite still runs |
| **Moderation UI** | ✘ Fail | New "Cuộc thi" tab breaks 360px mobile viewport width constraint |

---

## Unresolved Questions

1. **Intended behavior on mobile:** Should the moderation tabs:
   - Wrap to multiple lines on 360px? (requires CSS: `flex-wrap: wrap`)  
   - Scroll horizontally with overflow? (breaks UX requirement)  
   - Use a dropdown/select for mobile? (design choice)  
   - Compress tab labels? (e.g., abbreviate "Cuộc thi" → "CT")

2. **Is this a blocker?** The test explicitly checks that filters wrap instead of overflow, so the regression is intentional or an oversight. Need controller clarification on which is correct.

3. **Retest after fix:** Once the CSS is adjusted (e.g., `inline-flex flex-wrap`), the test should pass. The tab labels already fit on 360px with wrapping.

---

## Next Steps (for controller)

1. **Fix the mobile responsive issue** in `apps/web/src/components/moderation/moderation-tab-links.tsx` or CSS classes:
   - Add wrap behavior for mobile (media query or conditional class based on tab count)
   - OR update test expectation if intentional overflow is acceptable  
   - OR redesign tab layout (dropdown, abbreviations, etc.)

2. **Rerun E2E gate** after fix:  
   ```bash
   pnpm test:e2e
   ```
   Should see all 110 tests pass.

3. **Contests feature itself is solid:** All unit, integration, core contest E2E, API, and database tests pass. Only the mobile responsive regression needs attention.

---

**Status:** DONE_WITH_CONCERNS  
**Summary:** Full gate executed; 5 of 6 steps pass cleanly. E2E has 1 failing responsive test caused by adding the contests tab to the moderation page mobile view. Contest feature core functionality is fully tested and passes.  
**Concerns:** Moderation tabs exceed 360px viewport width on mobile (375px actual vs 360px expected). Requires CSS fix or test update. Not a feature logic issue, purely a responsive design regression.


## Rerun sau khi sửa (controller)

Tab mod cuộn trong hàng riêng (`moderation-tab-links.tsx`) + sửa finding review. Gate đầy đủ: typecheck, lint, format:check xanh; unit 803/803; int 412 pass + 1 skip (S3); e2e 110/110 (7,9 phút). `GATE_EXIT=0`.
