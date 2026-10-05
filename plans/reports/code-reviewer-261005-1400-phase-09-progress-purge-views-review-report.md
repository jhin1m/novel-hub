# Code review: phase 9 (reading progress, CDN purge, view counting)

## Scope
- Files: 31 modified + ~25 untracked (api `routes/reading.ts`, `lib/peer-ip.ts`; core `cdn/*`, `views/*`, `reading/progress.ts`, `reader/readable-chapter-ref.ts`, `testing/story-fixture.ts`; worker `processors/{purge-urls,flush-view-counters}.ts`, `scripts/cdn-purge.ts`; web `lib/reader/{scroll,use-reading-progress,use-view-beacon}.ts`, e2e `reader-progress.spec.ts`)
- LOC: ~+345/-51 tracked, ~1.5k untracked (incl. tests)
- Focus: uncommitted working tree vs `240c8b4`
- Verified: focused unit run (api reading, cdn purge, hooks, content-router, views) 23/23 green; hono 4.13.12 csrf source; Cloudflare purge limits (Free: 100 URLs/request, 800 URLs/s, matches code); srvx `NodeRequest` has a `get ip()` getter; Start `requestHandler` passes the request through; compose Redis = `noeviction`, no `maxmemory`.

## Overall assessment
Solid, well-tested phase. Outbox → `purge-urls` wiring is correct and idempotent, `canReadChapter` gates both reading endpoints via `findReadableChapterRef`, cookie is path-scoped and the e2e proves chapter HTML stays cookie-free, CSRF holds for the beacon path, no token logging. Main defect: the Lua script writes a fresh Redis key per anonymous request before any cap check, on an unthrottled unauthenticated endpoint, on a `noeviction` Redis shared with BullMQ.

## Critical
None.

## High

**H1. Unbounded Redis key creation from `/api/v1/reading/view` (memory DoS, also wrong cap semantics)**
`packages/core/src/views/view-counter.ts:29-36` does `INCR viewer` (+`EXPIRE` 2 days) before checking the IP cap. `packages/api/src/routes/reading.ts:26-40` mints a new viewer id for every request without a valid `nh_vid`. A cookie-less client therefore creates one new `v:viewer:{date}:{chapterId}:a:{rand}` key per request (TTL 48 h), even though the IP cap (10) blocks counting after the 10th. The endpoint has no rate limit (plan defers it permanently: "Rate limit riêng cho /reading/* không làm ở phase 13"). Redis runs `--maxmemory-policy noeviction` with no `maxmemory` (`docker-compose.yml:38`), so growth goes until host memory, taking down BullMQ and co-located Postgres on the single VPS.
Side effect of the same ordering: a signed-in reader behind a busy IP (CGNAT) burns their own 3/day allowance on reads the IP cap rejects.
Fix: check before writing, e.g.
```lua
local seen = tonumber(redis.call('GET', KEYS[1]) or '0')
if seen >= tonumber(ARGV[2]) then return 0 end
if ARGV[5] == '1' and tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[3]) then return 0 end
-- then INCR/EXPIRE viewer (and ip), INCR views, PFADD, SADD as today
```
This bounds keys per (IP, chapter, day) to ~10 and keeps the int-test numbers (3 per viewer, 10 per IP). Consider also shortening cap-key TTL to "end of stats day + slack" (they are only consulted for the current day).

## Medium

**M1. Flush loses popped chapters on a Redis error between SPOP and the DB write**
`packages/core/src/views/flush.ts:34-37,60-66`: ids are removed by `SPOP` first; if `pipeline.exec()` rejects (connection drop) or one reply errors, `takeCounters` throws without putting ids back. Views keys whose `GETDEL` did not run are orphaned (no dirty marker) and expire unflushed unless another read re-dirties the chapter that day; ones whose `GETDEL` ran are lost. The doc comment "nothing is lost or counted twice" is only true for DB failures. Fix: wrap `takeCounters` in try/catch that `SADD`s the popped ids back (best effort) before rethrowing.

**M2. Purge gives up after ~2.5 min of Cloudflare errors**
`DEFAULT_JOB_OPTIONS` (`packages/core/src/queue/job-options.ts:9-10`: 5 attempts, exponential 10 s) applies to `purge-urls`. A short Cloudflare API incident during a moderation hide/ban leaves hidden content in the CDN until `s-maxage` expires, with only a `failed` log line. Plan accepts this with `pnpm cdn:purge` as fallback, but nobody is alerted. Suggest per-job opts for purge (more attempts / longer backoff, e.g. 10 attempts, 30 s base) or at least a distinct log on final failure (`attemptsMade === attempts`).

**M3. `/view` is an unthrottled unauthenticated endpoint doing a session lookup + chapter join per call**
`packages/api/src/routes/reading.ts:75-87`. Independent of H1, every call costs 1-2 Postgres queries. Acceptable for now behind Cloudflare, but the plan's decision to never rate-limit `/reading/*` should be revisited in phase 13 (a cheap per-IP limiter would cover it).

## Low

- **L1.** `packages/core/src/views/flush.ts` + `apps/worker/src/processors/flush-view-counters.ts:19` only flush today and yesterday; worker down > ~24 h loses D-2 counters still alive in Redis (TTL 48 h). Accepted by spec §11 in spirit; worth a comment.
- **L2.** `packages/core/src/cdn/urls-for.ts:100-118` is N+1 (2 queries per story of the author, plus a story re-read). Fine in a worker; one join query would do.
- **L3.** `packages/core/src/views/record-chapter-view.ts:32-37` logs one `console.error` per read while Redis is down; under traffic that floods logs. Consider rate-limited/once-per-interval logging.
- **L4.** `apps/web/src/lib/reader/use-reading-progress.ts:74-79` cleanup clears a pending debounced save without sending it. Reader nav uses full page loads today (`pagehide` covers it), but any SPA exit (site header `<Link>`) within 3 s of scrolling drops the last position. Flush via beacon in cleanup when `timer !== null`.
- **L5.** Debounced `PUT` and leave-time beacon can land out of order (slow PUT after beacon) → older `scroll_pct` wins. Rare; ignore or add a client timestamp guard later.
- **L6.** Raw IPs live in Redis key names for 48 h (`view-keys.ts:15`). Short-lived, internal; hashing with a server secret would remove the PII.
- **L7.** `reading.ts:80` sets `nh_vid` before the readability check, so 404 responses also set the cookie. Harmless nit.
- **L8.** `apps/worker/src/content-router.ts:6` `ContentJobDeps = PurgeUrlsDeps` ties the router contract to one processor; becomes an intersection when search sync lands. Fine for now.
- **L9.** IP cap 10/IP/chapter/day also applies to signed-in users; on VN mobile CGNAT this will undercount popular chapters. User-validated threshold (Validation Session 1) — flagging only, not proposing a reversal.

## Contract / regression check
- `ContentJobName` → literal union `'purge-urls'`: intended by plan; only consumers are `ContentQueue` and `ContentJob`; outbox test updated. OK.
- `ApiDeps.viewCounter` (required): both constructors updated (`apps/web/src/server/api-app.ts`, `makeTestApiDeps` default `null`). OK.
- `PublishingJobDeps` += `statsRedis`, `queuePrefix`; `ContentJobDeps` += `cdn`, `appUrl`: intended; all call sites updated. OK.
- Outbox drain: now enqueues one job per event (was none); dev purger is a no-op, so no behavior change in dev beyond queue traffic. OK.
- Publishing worker (concurrency 2): flush adds a third scheduler; the int test asserts all three and cleans all. OK.
- Auth update: `after` hook only fires on `/update-user` with `name`, swallows insert errors, rejected updates record nothing (int test). No other display-name write path exists in core. OK.
- Reader page: hooks are effect-only; SSR HTML unchanged; e2e asserts no `set-cookie` on chapter HTML. OK.
- Worker boot: `loadOptionalEnv(cdnEnvSchema)` after `loadServerEnv`, inside the boot try/catch → production without `CF_*` exits 1. OK.

## Acceptance criteria (phase file)
| Criterion | Status |
|---|---|
| Progress saved by debounce and on leave | Met (unit/int/e2e incl. tab close) |
| Every `ContentChange` → purge with right URLs; hidden story / banned author purges every ever-published chapter | Met (`urls-for.int.test.ts`) |
| Production without `CF_*` refuses to start; manual purge command | Met in code/tests; real `pnpm cdn:purge -- --story <id>` smoke not evidenced |
| Reads land in `chapter_daily_stats` ≤ 5 min with viewer/IP/chapter/day caps | Met functionally; see H1 / M1 |
| Gate green; spec checkbox 6 `[x]` | Gate reported green; `docs/project-spec.md` checkbox "Trang đọc chương theo mục 6 và mục 8." still `[ ]` |

Test matrix: all Critical/High/Medium rows have a corresponding test; purge-timeout test checks the signal + abort path rather than fake-timer firing (acceptable, documented in-test).

## Positive observations (risk calibration)
- Purge payload = the change, URLs resolved from current state: idempotent under at-least-once delivery.
- CSRF: beacon uses `application/json` Blob (not a form type), cross-site `text/plain` blocked; test exists.
- Cookie: HttpOnly, SameSite=Lax, Secure on https, `Path=/api/v1/reading`; e2e proves HTML stays cookie-free.
- No token/URL logging in the purger; `loadOptionalEnv` warning tested not to leak secrets.

## Recommended actions
1. Fix H1 (check-before-write Lua); keep int-test expectations.
2. Fix M1 (re-`SADD` popped ids on `takeCounters` failure).
3. Decide on M2 (purge-specific retry opts or final-failure alert).
4. Run the manual `pnpm cdn:purge` smoke and mark the spec checkbox once the lead accepts.

## Metrics
- Type coverage: strict TS, no `any`; two casts (`defineCommand` method lookup, test-only `{} as Redis`).
- Tests: unit + int + e2e for every matrix row (focused unit run 23/23).
- Lint issues: 0 reported by gate.

## Unresolved questions
1. Production request path (Nitro → Start → Hono): is `request.ip` actually present? srvx defines it and Start passes the request through, but not smoke-tested on a fresh build; if it is `null`, the IP cap silently turns off.
2. Was `pnpm cdn:purge -- --story <id>` run against real Cloudflare (plan step 9, "thủ công")?

Score: 8/10
