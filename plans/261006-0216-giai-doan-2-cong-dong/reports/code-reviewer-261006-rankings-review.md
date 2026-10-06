# Code review: phase 5 rankings (uncommitted diff, 2026-10-06)

## Scope
- 42 modified + 19 untracked files (~450 LOC diff + ~700 LOC new), `.claude/` ignored.
- Checks run: `pnpm --filter <all 7 pkgs> typecheck` green; `eslint` on every changed/new ts/tsx: 0 issues; web unit tests `src/components/rankings` + `cache-headers.test.ts`: 7/7 pass (the `ReferenceError: module is not defined` line is pre-existing noise, also printed by `comment-body.test.tsx`).
- `computeRankings` SQL run for real (4 periods x 2 variants) on the dev Postgres against a session-local TEMP `story_daily_stats` table (dev DB has not applied 0007 yet): all 8 queries execute; param typing (`between $n and $m` vs `date`, `greatest(bigint, $n)`) resolves fine. Nothing persisted.
- Int/e2e not run, per instructions (tester owns them).

## Overall
Solid, matches spec and neighbouring patterns. Acceptance criteria (a)-(h) all verified in code. Lua is atomic and correct. Writes are atomic. Mature content cannot reach cached HTML (filtered twice: `general` variant + `publicStoryWhere`). No Critical or High findings.

## Acceptance criteria verification
| | Verdict | Evidence |
|---|---|---|
| (a) | OK | `view-counter.ts:38-66`: story block runs only after the chapter read is counted; `sip` check before PFADD, INCR only when `PFADD==1`; no-IP path skips `sip`; old KEYS[1..5] logic is byte-identical. `flush-story-readers.ts` upserts with `greatest()` and joins `stories` (deleted ones skipped) |
| (b) | OK | `shared/src/rankings.ts:45-60` windows; `compute-rankings.ts` `having cur >= 20 and cur > prev` = score > 0; `publicStoryWhere` + `includeMature`; `keep: 100` |
| (c) | OK | `write-rankings.ts:25-36` MULTI DEL/ZADD/EXPIRE/RENAME, errors checked; empty → `DEL live`; TTL carried by RENAME |
| (d) | OK | `ranking-reader.ts` timeout 500 ms, `null` on failure, logs once per outage; route `headers` → `DEGRADED_LIST_CACHE` (`public, s-maxage=60`); producer conn has `enableOfflineQueue:false` so outages fail fast |
| (e) | OK | SSR server-fn always `includeMature:false`; API `stories.ts:38-42` uses account `showMature` |
| (f) | OK | `catalog/urls.ts` both story and user branches; sitemap `sitemap.ts:96` |
| (g) | OK | `MAINTENANCE_INTERVALS` 900 000 ms, router case, `statsRedis`/`queuePrefix` wired in `worker/src/index.ts:103-107` |
| (h) | OK | index route 301 (cacheable), `throwNotFound` for unknown period, case variants 301 no-store, tabs/50 rows/no score/empty states/footer + md+ header link |

## Critical
None.

## High
None.

## Medium

### M1. API degrades to `200 []` on Redis outage, which overrides a good SSR list for 18+ readers
- `packages/core/src/catalog/lists.ts:46-51` drops `available`; `apps/web/src/lib/use-mature-aware-list.ts:27` replaces the SSR list with any successful API response.
- Scenario: CDN serves a filled `/rankings/week` (cached up to 10 min + SWR 1 h). Redis hiccups. A reader with `showMature` loads it, `GET /api/v1/stories?list=ranking&period=week` answers 200 `{stories: []}`, the hook swaps in the empty list, and the page shows `ranking_empty` ("Chưa đủ lượt đọc...") because `available` in the SSR loader data is `true`. That is both a lost list and a false statement. The hook's own contract says "if that request fails, the SSR list stays", but the API never reports a failure.
- Fix: surface the outage as an error, following the `SEARCH_UNAVAILABLE` / `STORAGE_UNAVAILABLE` pattern:
  ```ts
  // lists.ts: return availability for the ranking case
  case 'ranking': {
    const r = await readRanking(db, o.rankings ?? null, query.period, { includeMature: o.includeMature, limit: RANKING_RULES.pageSize });
    return r.available ? { stories: r.stories, page: 1, totalPages: 1 } : 'unavailable';
  }
  // stories.ts route
  if (list === 'unavailable') return c.json(errorBody('RANKINGS_UNAVAILABLE', 'Rankings are temporarily unavailable'), 503);
  ```
  (or check `query.list === 'ranking'` in the route and call `readRanking` there). Then the hook keeps the SSR list. Update the api int test (`rankings: null` → 503 for `list=ranking`).

## Low

### L1. Sitemap always lists the 4 ranking URLs, but empty rankings render `noindex`
- `packages/core/src/seo/sitemap.ts:96` vs `apps/web/src/routes/rankings.$period.tsx:41`.
- Scenario: `rising` is empty for weeks after launch (needs >= 20 readers/week and growth); Search Console reports "Submitted URL marked noindex" on every crawl. Same for all four until reads arrive.
- Fix (pick one): drop `noindex` for an empty ranking whose read succeeded (only `available === false` needs it), or leave ranking URLs out of the sitemap until non-empty. First option is simpler and keeps the sitemap static.

### L2. Story-reader flush is skipped whenever the chapter flush throws
- `apps/worker/src/processors/flush-view-counters.ts:23-26`.
- Scenario: one recurring failure in `flushViewCounters` (e.g. a bad batch, FK race) makes every run throw before `flushStoryReaders`; `sdirty` keys expire after `keyTtlSec` (2 days) and that day's story readers never reach `story_daily_stats`. The two flushes are independent.
- Fix: run both and rethrow afterwards, e.g. `const results = await Promise.allSettled([...])` sequentially or `try { chapters } finally { stories }`, then throw the first rejection.

### L3. Copy hardcodes values owned by `RANKING_RULES`
- `packages/shared/messages/vi.json:595` ("mỗi 15 phút") and `:607` ("ít nhất 20 người đọc"), while `RANKING_RULES.refreshMinutes` / `minRisingReaders` are the source of truth.
- Fix: parametrize (`{minutes}`, `{readers}`) and pass the constants at the call sites in `rankings.$period.tsx`.

### L4 (ops note, not a code defect). Dev DB has not applied migration 0007
- Verified: `relation "story_daily_stats" does not exist` on `DATABASE_URL`. Until `pnpm db:migrate` runs, the dev worker's `flush-view-counters` job throws at the story step every 5 min and `recompute-rankings` fails every 15 min. Production order must be migrate before starting the new worker (the new web Lua only writes Redis, so web-first is safe).

## Edge cases checked (no defect)
- Lua: no-IP path never touches `KEYS[7]` (the placeholder is the viewer key); IP cap reached → `return 1` before PFADD, so no key is created; `suv` TTL refreshed even when PFADD returns 0; `sdirty` marked only on HLL change (flush uses PFCOUNT + `greatest`, so skipping unchanged stories is lossless).
- Bypass: rotated cookies over many chapters stop at 10/IP/story (int test covers 30 chapters → 10 + 1 no-IP). Multi-IP / IPv6 rotation is out of scope per plan.
- Concurrent recompute from two worker processes: each MULTI is atomic, last writer wins, no partial set.
- Story hidden/banned/deleted after recompute: purged via `catalogUrls`, re-filtered by `publicStoryWhere` on read, cascade deletes stats; `readRanking` reads the full 100 so holes are refilled.
- `GROUP BY stories.id` + `ORDER BY stories.last_chapter_at` valid (PK functional dependency). Date index serves the window predicate; PK serves the flush upsert.
- No internal UUIDs leave the server: `toStoryCard` DTO only; Redis key built from enum-validated period.
- Header: link is `hidden md:inline-flex`, so the 360px mobile header is unchanged; `aria-current` on a plain `<a>` (no TanStack auto-active surprise); footer nav now wraps.
- Public contract changes are additive: `ApiDeps.rankings`, `storyListQuery` ranking variant, `CanonicalTarget` ranking, `MaintenanceJobDeps` fields, `ViewRecord.storyId` (required; only caller updated, typecheck green).

## Positive observations
- Score stored as position in the ZSET keeps the SQL tie-break exactly.
- Unavailable vs empty distinction carried to cache headers and copy.
- Purging rankings on every story/chapter/user change is cheap and closes the hidden-story window.
- Tests cover the anti-inflation cap, flush retry, empty-recompute deletion, outage path, and API mature gating.

## Plan follow-ups (for lead)
- Phase 5 todo items appear implemented; phase file `status: pending` and checkboxes untouched; spec §5 Gđ2 checkbox 4 not yet `[x]` (expected after gate).
- Recommend fixing M1 before marking done; L1-L3 optional.

## Unresolved questions
- Per-IP caps (10/story/day) undercount readers behind mobile CGNAT (common on VN carriers). Same trade-off already accepted for chapter caps; flagging only so it is a conscious decision before public launch.

**Status:** DONE_WITH_CONCERNS
**Summary:** Rankings implementation meets all acceptance criteria (a)-(h); typecheck and lint green; ranking SQL validated against Postgres; no Critical/High issues.
**Concerns/Blockers:** M1: API answers 200 [] during a Redis outage, which makes `useMatureAwareList` replace a good SSR ranking with an empty one plus a misleading "no reads yet" message for 18+ readers (fix: 503 `RANKINGS_UNAVAILABLE`). Low: sitemap lists noindex pages, story flush coupled to chapter flush, hardcoded numbers in copy; dev DB needs `pnpm db:migrate`.
