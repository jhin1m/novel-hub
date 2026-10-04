---
title: "Phase 4: Hono mount, client hc, /api/v1/health"
status: completed
priority: P1
effort: "1d"
dependencies: [3]
---

# Phase 4: Hono mount, client hc, /api/v1/health

Spec checkbox: `Hono mount tại /api/$, client hc dùng được từ web, có route /api/v1/health.`

## Context Links

- Spec mục 3 (ranh giới API, `core`), 6 (cache), 9 (error shape, chain + sub-app), 11 (health kiểm tra Postgres và Redis)
- `plans/reports/researcher-261004-1954-tanstack-start-hono-report.md`
- `plans/reports/researcher-261004-1954-infra-tooling-bullmq-report.md` (mục Health)

## Overview

- Tạo `packages/core` (health check, kết nối Redis) và `packages/api` (Hono app factory, error contract, route health).
- `@novel-hub/api/client` là subpath riêng, chỉ chứa type, cho phía browser.
- Mount vào TanStack Start qua `apps/web/src/routes/api/$.ts`, deps server dựng một lần, có vòng đời rõ ràng.

## Key Insights

- Server route: `createFileRoute('/api/$')({ server: { handlers: { ANY: ({ request }) => ... } } })`. Red team đã kiểm: `ANY` nhận cả HEAD.
- Hono app dùng `basePath('/api')`; contract nằm ở `/api/v1/*`. Phase 5 thêm `/api/auth/*` vào cùng app.
- `hc` chỉ suy ra type đúng khi route viết dạng chain và mọi tsconfig bật `strict: true`. Status phải là literal trong `c.json(body, 503)`.
- **Browser không được import value từ `@novel-hub/api`** vì sẽ kéo theo `core` → `ioredis`/`pg`. Subpath `./client` chỉ có `import type { AppType }` + `hc` từ `hono/client`. ESLint chặn import sai. <!-- Red Team: client bundle leak -->
- ioredis 5 với `enableOfflineQueue: false` từ chối mọi lệnh khi chưa `ready`, nên health Redis phải `lazyConnect` và `await connect()` lúc khởi tạo deps. <!-- Red Team: singleton lifecycle -->
- Dùng ioredis **5.x**: peer của BullMQ 6 là `>=5`; ioredis 6.0.0 còn quá mới.

## Requirements

- Functional:
  - `GET /api/v1/health`:
    - đủ phụ thuộc → 200 `{ status: 'ok', checks: { postgres: 'up', redis: 'up' } }`;
    - một phụ thuộc không phản hồi → 503 `{ error: { code: 'UNHEALTHY', message }, checks }`.
    - Mỗi check timeout 2s, chạy song song.
  - Mọi response `/api/v1/*` mặc định có `Cache-Control: no-store`.
  - 404 và lỗi chưa bắt → `{ error: { code, message } }`, không stack, không chi tiết nội bộ; lỗi được log ở server.
  - Lần gọi health đầu tiên sau khi boot trả 200 nếu phụ thuộc sống.
  - Deps server:
    - dựng **một lần**, cache trên `globalThis` để HMR không tạo kết nối mới;
    - khởi tạo lỗi thì xoá cache để lần sau thử lại, không rò kết nối;
    - SIGINT/SIGTERM đóng pool và Redis.
  - `createApiClient(baseUrl)` trả client có type đầy đủ.
- Non-functional: route không truy vấn DB trực tiếp mà gọi `core`. Client bundle không chứa module nào từ `packages/core`, `packages/db`, `pg`, `ioredis`.

## Architecture

```
apps/web/src/routes/api/$.ts ──ANY──▶ (await getApiApp()).fetch(request)
apps/web/src/server/api-app.ts
   getApiApp(): Promise<App>    // cache promise trên globalThis.__novelHubApi
     env = loadServerEnv(appEnv + db + redis)
     { db, pool } = createDb(DATABASE_URL)
     redis = createHealthRedis(REDIS_URL); await redis.connect()
     app = createApp({ checkHealth: () => checkHealth({ pingPostgres: () => pingPostgres(db), pingRedis: () => pingRedis(redis) }) })
     registerCloseOnSignal([pool.end, redis.quit])   // một lần
   lỗi khởi tạo → xoá cache, đóng những gì đã mở, throw

packages/api   createApp(deps) = new Hono().basePath('/api')
                 .route('/v1', v1Routes(deps))     // v1 = new Hono().use(noStore).route('/health', healthRoutes(deps))
                 .onError(handleError).notFound(handleNotFound)
               export type AppType = ReturnType<typeof createApp>
               exports: "."       → createApp, ApiDeps, AppType   (chỉ server)
                        "./client" → hcWithType, createApiClient, type AppType   (browser-safe)
packages/core  checkHealth({ pingPostgres, pingRedis, timeoutMs }) → HealthReport
               createHealthRedis(url): ioredis { lazyConnect, enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 2000, connectTimeout: 2000 }
```

```ts
export type ApiDeps = { checkHealth: () => Promise<HealthReport> };   // phase 5 thêm auth, appUrl
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/core/package.json`, `tsconfig.json` | create | `@novel-hub/core`, `sideEffects: false`; deps `@novel-hub/db`, `@novel-hub/shared`, `ioredis@^5` |
| `packages/core/src/index.ts` | create | |
| `packages/core/src/lib/with-timeout.ts` (+ test) | create | |
| `packages/core/src/infra/redis.ts` | create | `createHealthRedis`; phase 6 thêm factory cho worker/producer |
| `packages/core/src/health/check-health.ts` (+ `.test.ts`, `.int.test.ts`) | create | |
| `packages/api/package.json`, `tsconfig.json` | create | `@novel-hub/api`; exports `.` và `./client`; deps `hono@^4.13.13`, `@novel-hub/core` |
| `packages/api/src/index.ts`, `app.ts` | create | |
| `packages/api/src/client.ts` | create | **chỉ** `import type` từ `./app` và `hc` từ `hono/client` |
| `packages/api/src/lib/errors.ts` | create | `errorBody`, `handleError`, `handleNotFound` |
| `packages/api/src/middleware/no-store.ts` | create | |
| `packages/api/src/routes/health.ts` | create | |
| `packages/api/src/app.test.ts` | create | `testClient` |
| `apps/web/src/server/api-app.ts` | create | `getApiApp`, đóng kết nối khi nhận tín hiệu |
| `apps/web/src/routes/api/$.ts` | create | |
| `apps/web/src/lib/api-client.ts` (+ `.test.ts`) | create | import từ `@novel-hub/api/client` |
| `apps/web/package.json` | modify | deps workspace `@novel-hub/api`, `@novel-hub/core`, `@novel-hub/db` |
| `eslint.config.js` | modify | `no-restricted-imports` (xem step 6) |
| `apps/web/src/routeTree.gen.ts` | regenerate | |

## Implementation Steps

1. `core`: `withTimeout`, `createHealthRedis`, `pingRedis` (`PING` phải trả `PONG`), `pingPostgres(db)` (`select 1`), `checkHealth` dùng `Promise.allSettled` + `withTimeout`. Lỗi được log kèm tên check; `HealthReport` chỉ chứa `'up' | 'down'`.
2. `api`: viết `errors.ts`, `health.ts`, `app.ts`, `noStore` cho `/v1/*`. `client.ts` export `hcWithType` và `createApiClient(baseUrl = '')`.
3. `apps/web/src/server/api-app.ts` theo sơ đồ. `registerCloseOnSignal` chỉ đăng ký một lần (cờ trên `globalThis`).
4. `apps/web/src/routes/api/$.ts`: `ANY: async ({ request }) => (await getApiApp()).fetch(request)`.
5. `apps/web/src/lib/api-client.ts` re-export `createApiClient` từ `@novel-hub/api/client`. Phía browser dùng cái này (với TanStack Query). SSR lấy dữ liệu qua `createServerFn` → `core`, không tự gọi HTTP vào chính mình (ghi chú trong file).
6. ESLint `no-restricted-imports` cho `apps/web/src/**` **trừ** `apps/web/src/server/**` và `apps/web/src/routes/api/**`: cấm `@novel-hub/api` (bản gốc), `@novel-hub/core`, `@novel-hub/db`; chỉ cho phép `@novel-hub/api/client`.
7. Smoke thủ công (ghi kết quả vào báo cáo cook):
   - `pnpm infra:up && pnpm --filter @novel-hub/web dev`, sau đó gọi health **ngay lần đầu**: `curl -i localhost:3000/api/v1/health` → 200, có `cache-control: no-store`.
   - `docker compose stop redis` → 503 trong khoảng 2.5s; `start` lại → 200.
   - `docker compose pause postgres` → 503 trong khoảng 2.5s, và các request sau cũng không treo (pool có timeout từ phase 3); `unpause` → 200.
   - `curl -i -X OPTIONS` và `curl -I` (HEAD) tới `/api/v1/health` → Hono trả lời, không phải trang 404 của Start.
   - `curl localhost:3000/api/khong-ton-tai` → 404 dạng JSON chuẩn.
   - Sửa một file server lúc đang dev (HMR) 5 lần → `select count(*) from pg_stat_activity` không tăng theo.
   - Build có sourcemap (`pnpm --filter @novel-hub/web build` với `build.sourcemap` bật qua biến env cho lần kiểm này), rồi kiểm trường `sources` trong các file `.map` ở `apps/web/.output/public`: không có đường dẫn nào chứa `packages/core`, `packages/db`, `/pg@`, `/ioredis@`. Phase 5 có consumer thật của `createApiClient` ở `/`, nên phải chạy lại bước này ở phase 5.
   - Chạy bản build: `node --env-file=../../.env .output/server/index.mjs`, rồi curl health. Nếu workspace package bị externalize sai thì thêm `ssr.noExternal: [/^@novel-hub\//]`.
8. Gate 4 lệnh. Đánh `[x]` checkbox 4.

## Function / Interface Checklist

- [x] `withTimeout<T>(p, ms, label): Promise<T>`
- [x] `createHealthRedis(url): Redis`; `pingPostgres(db)`; `pingRedis(redis)`
- [x] `checkHealth(deps): Promise<HealthReport>`
- [x] `createApp(deps: ApiDeps)`, `type AppType`, `type ApiDeps`
- [x] `errorBody`, `handleError`, `handleNotFound`
- [x] `hcWithType`, `createApiClient` (subpath `./client`)
- [x] `getApiApp(): Promise<App>`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Cả hai ping ok → `status: 'ok'` | unit `check-health.test.ts` |
| Critical | Ping Postgres treo quá timeout → `postgres: 'down'`, trả về trong khoảng timeout (fake timers) | unit |
| High | Ping Redis reject → `redis: 'down'`; report không chứa message lỗi | unit |
| Critical | `GET /api/v1/health` với fake ok → 200 + `cache-control: no-store` | unit `app.test.ts` |
| Critical | Fake down → 503, body `{ error: { code: 'UNHEALTHY' }, checks }` | unit |
| High | Route không tồn tại → 404 `NOT_FOUND` | unit |
| High | Handler throw → 500 `INTERNAL_ERROR`, không có stack hay message gốc | unit |
| High | `createApiClient` với fetch tuỳ biến gọi `app.request` → `res.json()` có type `HealthReport` (`expectTypeOf`) | unit `api-client.test.ts` |
| Critical | `checkHealth` với Postgres và Redis thật, gọi **ngay sau** khi tạo client → ok | int |
| High | Redis URL trỏ vào port đóng → `redis: 'down'` trong dưới 3s | int |
| High | OPTIONS/HEAD, HMR không rò kết nối, client bundle sạch, chạy được bản build | thủ công (step 7) |

## Dependency Map

- Cần phase 3 (`createDb` có timeout), phase 2 (env, Redis).
- Phase 5 mở rộng `ApiDeps` (auth, `appUrl`), thêm `/api/auth/*`, `/api/v1/me`, middleware; `/` dùng `createApiClient` (consumer thật).
- Phase 6 thêm factory Redis cho worker/producer vào `core/infra/redis.ts` và queue vào `getApiApp`.

## Success Criteria

- [x] Health trả 200 ngay lần đầu sau boot; 503 khi Redis tắt hoặc Postgres bị pause; tự hồi phục
- [x] Error shape thống nhất cho 404 và 500
- [x] Client `hc` có type, typecheck xanh; ESLint chặn import sai
- [x] Bundle client sạch (kiểm bằng sourcemap); bản build chạy được
- [x] Gate 4 lệnh xanh; checkbox 4 = `[x]`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| `ANY` không chuyển OPTIONS | Khai báo từng method, dùng chung một handler |
| Start compiler không loại import server khỏi client | Import trong route API qua `apps/web/src/server/*`; kiểm bằng sourcemap; nếu cần thì dùng dynamic `import()` |
| Vite SSR externalize workspace package | `ssr.noExternal: [/^@novel-hub\//]` |
| `hc` suy ra `unknown` | `strict` ở mọi tsconfig, một version TS (catalog) |
| Nitro không phát SIGTERM xuống process | Kiểm bằng `kill -TERM` khi chạy bản build; ghi lại hành vi |

## Security Considerations

- Health không lộ hostname, message lỗi hay version.
- `no-store` cho mọi `/api/v1` để Cloudflare không cache dữ liệu cá nhân.
- Lỗi 500 không trả stack.

## Kết quả cook (2026-10-04)

- Gate: `pnpm typecheck`, `lint`, `test` (60), `test:int` (31) xanh.
- Smoke thủ công (dev và bản build):
  - Health lần đầu sau boot → 200 + `cache-control: no-store`; HEAD → 200; OPTIONS → 404 JSON của Hono; `/api/khong-ton-tai` → 404 JSON.
  - `stop redis` → 503 trong ~4 ms, `start` → 200. `pause postgres` → 503 sau 2,0 s, lặp lại không treo; `unpause` → 200.
  - Boot khi Redis đang chết → health 503 (`redis: down`), các route khác vẫn chạy; Redis sống lại → 200.
  - HMR 5 lần: số kết nối Postgres/Redis không tăng; sửa code `packages/api` được nạp lại không cần restart.
  - Sourcemap client: 0 nguồn từ `packages/core`, `packages/db`, `pg`, `ioredis`; route `api/$` không vào bundle client.
  - Bản build chạy bằng `node .output/server/index.mjs` (không cần `ssr.noExternal`); SIGTERM thoát êm, kể cả khi Redis đang chết.
- Khác plan (có lý do):
  - Kết nối cache trên `globalThis.__novelHubInfra`; Hono app cache theo module để code API nạp lại khi HMR.
  - Thêm `packages/api/src/deps.ts` (tránh vòng import app ↔ routes); web thêm dep `@novel-hub/shared` (đọc env).
  - Redis chết lúc boot không làm hỏng khởi tạo (chờ `connect` tối đa 2 s rồi để ioredis tự nối lại); chỉ env sai mới trả 503 `SERVICE_UNAVAILABLE`.
  - `no-store` áp cho toàn bộ `/api/*` (gồm `/api/auth/*` ở phase 5), không chỉ `/api/v1/*`.
  - hono `^4.13.12` (lock 4.13.12): 4.13.13 mới phát hành trong ngày nên bị `minimumReleaseAge` của pnpm chặn; `pnpm add` đã tự thêm ngoại lệ vào `pnpm-workspace.yaml`, đã gỡ.
- Sửa theo code review (`plans/reports/code-reviewer-261004-2207-phase-04-hono-health-review-report.md`): SIGTERM treo khi Redis chết (`disconnect` thay `quit`, `pool.end` có timeout); ESLint dùng `@typescript-eslint/no-restricted-imports` (cho phép `import type`, chặn thêm `src/server/*` và `@novel-hub/shared/env`); `HTTPException` giữ status và response riêng; gắn `.catch` của `getApiApp` một lần.
- Còn lại:
  - Lúc tắt, pool và Redis đóng ngay trong khi srvx còn xử lý request dở (tối đa 5 s). Health không sao; phase 5–6 cần xem lại khi có request nhiều truy vấn.
  - Health công khai chạy truy vấn mỗi lần gọi; khi Postgres chậm, các ping quá hạn giữ kết nối pool tới 20 s. Cân nhắc rate limit hoặc cache ngắn ở Giai đoạn 1.
  - Khi tạo `apps/web/src/server-fns/`, thêm thư mục này vào `ignores` của rule ESLint (server function được phép import `core`).

## Next Steps

Phase 5: Better Auth gắn vào app này. Chạy lại bước kiểm sourcemap khi `/` dùng `createApiClient`.
