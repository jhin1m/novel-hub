# Code review: Phase 4 (Hono mount, hc client, /api/v1/health)

Score: **7.5/10**. Critical: **0**. High: 1. Medium: 4. Low: 6.

## Scope
- packages/core (with-timeout, infra/redis, health), packages/api (app, deps, client, errors, no-store, health route, tests), apps/web (server/api-app.ts, routes/api/$.ts, lib/api-client.ts, package.json, routeTree.gen.ts), eslint.config.js
- Gate re-run independently: `pnpm typecheck` OK, `pnpm lint` OK, `pnpm test` 57/57, `pnpm test:int` 31/31.
- Probes (scratchpad clone, repo untouched): ESLint rule coverage, ioredis `quit()` with Redis down, `hc('')` behavior, srvx shutdown code in `.output`.

## Acceptance criteria
| Criterion | Status |
|---|---|
| 200 on first health after boot; 503 on Redis stop / PG pause; self-recovers | Met (unit + int + manual) |
| Unified error shape for 404/500, no stack | Met (`app.test.ts`) |
| `hc` typed, typecheck green; ESLint blocks bad imports | Partly met: package imports blocked, but relative `server/*` imports are not (M1) |
| Client bundle clean (sourcemap), build runs | Met (reported by implementer; not re-built here) |
| SIGINT/SIGTERM close pool and Redis | Met only while Redis is up (H1) |
| Gate green; spec checkbox 4 = `[x]` | Gate green; checkbox still `[ ]` at docs/project-spec.md:146, phase `status: todo` |

Deviations 1-4: accepted. (1) is better than the plan's version. (2) is reasonable. (3) see L1. (4) works the same as allSettled because each check catches its own errors.

## High

**H1. If Redis is down when SIGTERM arrives, the process stays alive until SIGKILL.** `apps/web/src/server/api-app.ts:33`
`healthRedis.quit()` checks `enableOfflineQueue: false` before its "not connected, just disconnect" shortcut. So it rejects with "Stream isn't writeable…" and ioredis keeps its reconnect timer running. Probe: after a failed connect, `quit()` rejected and the process was still alive with status `reconnecting` 4s later. In production, srvx's `gracefulShutdown` (`.output/server/_libs/h3+rou3+srvx.mjs:374`) never calls `process.exit`. It relies on the event loop draining, so `othersWillExit === true` and the reconnect timer keeps the process up until Docker sends SIGKILL. The comment at :61-62 ("others will exit") is wrong for Nitro.
Related: `close()` has no time limit. `pool.end()` waits for checked-out clients. If Postgres is paused, a timed-out health ping keeps holding its client for up to `query_timeout` (20s), and longer if the socket never closes. In the no-other-listener branch, `process.exit` waits on that.
Fix:
```ts
const close = async () => {
  healthRedis.disconnect(); // health connection has nothing to flush; quit() fails when offline
  await withTimeout(pool.end(), 5_000, 'pool.end').catch(() => {});
};
```
Also fix the comment. Add an int test: connect to a closed port, call `close()`, then assert `healthRedis.status === 'end'`.

## Medium

**M1. The ESLint rule has holes, including the main leak path.** `eslint.config.js:43-71`. Probe results for a file in `apps/web/src/components/`:
- `import { handleApiRequest } from '../server/api-app'` is **not flagged**. This pulls in core, db, pg and ioredis, the exact leak the rule exists to stop.
- `import { loadServerEnv } from '@novel-hub/shared/env'` (uses `node:fs`) is not flagged.
- `await import('@novel-hub/core')` is not flagged (`no-restricted-imports` ignores dynamic imports).
- `import type { HealthReport } from '@novel-hub/core'` **is flagged**. That's a false positive: type-only imports are erased and are needed for TanStack Query typing.
- Everything under `routes/api/**` is exempt, but those files are in `routeTree.gen.ts` and so reach the client graph. Only Start's compiler stripping `server.handlers` keeps them out.
Fix: switch to `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`. Add patterns `**/server/*`, `**/server/**` and `@novel-hub/shared/env` for non-server files. Optionally limit the exemption to `routes/api/**/*.ts` and require route files to import only from `src/server/*`.

**M2. If Redis is down at boot, the whole API returns 503, not just health.** `api-app.ts:35-42`
If `healthRedis.connect()` fails, the whole infra build fails, and every `/api/*` request returns 503 SERVICE_UNAVAILABLE until Redis is back. Each request also builds and discards a new Pool and Redis client and logs twice. Today only health exists. In phase 5, `/api/auth/*` and `/api/v1/me` will share this gate, so a Redis blip during deploy will block login, while the same Redis outage after boot only affects health. Suggested fix: still await `connect()` (needed for first-call 200), but on failure log it and keep the instance. ioredis keeps retrying, and health reports `redis: down` in the meantime. Decide this before phase 5 adds routes.

**M3. On shutdown, connections close while in-flight requests are still running.** `api-app.ts:60-71`
The signal handler closes the pool and Redis at the same moment srvx starts draining in-flight requests (up to 5s). For health this doesn't matter. In phase 5+, requests that run several queries will hit "Cannot use a pool after calling end". Look for a Nitro `close` hook, or close after server close, when phase 5/6 adds real routes.

**M4. Unlisted config change: `pnpm-workspace.yaml:11-12` `minimumReleaseAgeExclude: hono@4.13.13`.**
This bypasses the supply-chain release-age guard for one package and isn't in the change list. CLAUDE.md says no config changes without approval. Confirm the user approved it, or record why in the phase report.

## Low

- **L1** `packages/api/src/lib/errors.ts:26-33`: `handleError` drops `HTTPException.getResponse()`, so custom headers are lost (e.g. `WWW-Authenticate` from Hono auth middleware). An `HTTPException(503)` becomes 500, and an exception built with only `res` gives an empty `message`. Fix: if `err.res` is set, merge its headers. Map 5xx HTTPExceptions to their own status with a generic message.
- **L2** `packages/api/src/app.ts:9`: `noStore` only covers `/api/v1/*`. `/api/khong-ton-tai` 404 and the future `/api/auth/*` get no `Cache-Control`. That's risky if a Cloudflare "cache everything" rule for HTML is later written too broadly. Consider `.use('/api/*', noStore)` at the root (this meets the AC either way).
- **L3** `apps/web/src/server/api-app.ts:88-90`: a `.catch` is attached on every call. Attach it once when the promise is created and only clear the cache if it still holds the same promise (`if (appPromise === p)`). Not a live race today because microtasks can't interleave, but it's cleaner.
- **L4** `packages/api/src/client.ts:15`: with `baseUrl = ''`, `$get` works (fetch gets `/api/v1/health`), but `$url()` throws `Invalid URL` (probe). Document it, or default to `globalThis.location?.origin` in the browser.
- **L5** `/api/v1/health` is unauthenticated and does no coalescing. Each hit costs one pool query and one PING. When PG is slow, timed-out pings hold pool clients for up to 20s, so polling or a flood can drain the 10-connection pool. A single-flight request or a 1s cached result is cheap. Rate limiting comes in phase 1.
- **L6** Bookkeeping: spec checkbox 4 is unchecked and the phase file says `status: todo`. `deps.ts` and the `@novel-hub/shared` dep were added beyond the plan's inventory; both are justified.

## Verified OK
- `process.once` + `listenerCount` logic is correct: Node removes the `once` wrapper before calling it, so the count excludes our handler. The flag on `globalThis` stops duplicate registration across HMR.
- The ioredis `lazyConnect` + `disconnect()` on failed boot stops the reconnect loop (no leak). Its `error` listener stops "Unhandled error event" spam.
- No error leakage: health returns only up/down. 500 is generic, with no stack (tested). Env errors list only variable names, and only to the server log.
- hc inference: chain style, `basePath('/api')`, literal 200/503; `expectTypeOf(body).toEqualTypeOf<HealthReport>()` passes. `client.ts` imports AppType as type only.
- Core imports `Db` as type only, and drizzle-orm is the same pinned 0.45.3 as in db (no duplicate `sql` entity). Comments are in Vietnamese, and the `[api]/[health]/[redis]` log style matches `[db]`.
- No regressions in db, shared or web: all gates and int tests pass, and the env contract is unchanged (`appEnv + db + redis` reuses the existing schemas).

## Recommended actions (priority)
1. H1: replace `quit()` with `disconnect()` for the health connection, and put a time limit on `pool.end()`. Fix the comment.
2. M1: tighten the ESLint config (typescript-eslint variant, `allowTypeImports`, `server/*`, `shared/env` patterns).
3. M4: confirm approval for `minimumReleaseAgeExclude`.
4. M2/M3: decide before phase 5 adds auth routes.
5. L1-L5 as convenient.

## Unresolved questions
- Was the hono release-age exclusion approved by the user?
- Should Redis being down at boot block auth routes (M2)? That's a product/ops call.

Status: DONE_WITH_CONCERNS
Summary: The phase meets its functional acceptance criteria and all gates are green. One High: SIGTERM shutdown hangs when Redis is down (ioredis `quit()` with offline queue disabled, plus srvx never calling exit). The ESLint guard also misses relative `server/*` imports.
Concerns/Blockers: Fix H1 and M1 before marking checkbox 4. M4 needs user confirmation.
