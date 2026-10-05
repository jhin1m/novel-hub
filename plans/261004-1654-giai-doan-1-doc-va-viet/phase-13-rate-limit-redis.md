---
phase: 13
title: "Phase 13: Rate limit Redis"
status: completed
priority: P1
effort: "1.5d"
dependencies: [12]
---

# Phase 13: Rate limit Redis

Spec checkbox: `Rate limit Redis theo user và IP: đăng ký, đăng nhập, quên mật khẩu, tạo truyện, đăng chương, bình luận, báo cáo (mục 7).`

## Context Links

- Spec mục 7 (rate limit theo user và IP, tài khoản mới chặt hơn), mục 11 (Redis AOF)
- [plan.md](./plan.md) — quyết định "Rate limit" (một cơ chế, Better Auth limiter tắt) và env `TRUST_CF_IP`, `RATE_LIMIT_FACTOR`
- `plans/reports/researcher-261004-2352-storage-search-infra-report.md` mục 5
- Code (đã kiểm 2026-10-05):
  - `packages/auth/src/auth.ts:96` (`rateLimit: { enabled: false }` — giữ nguyên), `:87-93` (`advanced`), `:131` (`onPasswordReset`)
  - `packages/auth/src/hooks.ts:130-135` (`bannedGuard`), `:111-120` (`createSessionCreateBefore`)
  - `packages/api/src/app.ts:24` (`.on(['GET','POST'], '/auth/*', (c) => deps.auth.handler(c.req.raw))`)
  - `packages/api/src/deps.ts:15-20` (`ApiDeps`), `packages/api/src/middleware/require-auth.ts:31` (`requireAuth`), `:33-37` (`requireRole`), `:40-44` (`requireVerifiedEmail`)
  - `packages/core/src/infra/redis.ts:38-40` (`createProducerConnection`: `enableOfflineQueue: false`, không có `commandTimeout`), `:53-69` (`logRedisErrors`)
  - `packages/core/src/users/current-user.ts:7-13` (`CurrentUser` chưa có `createdAt`), `packages/auth/src/current-user.ts:36-46` (nơi duy nhất dựng `CurrentUser`)
  - `apps/web/src/lib/auth-errors.ts:37-42` (`authErrorMessage` tra `MESSAGES[code]`)
- Better Auth 1.7.7 (đã đọc `node_modules`): path `/sign-up/email`, `/sign-in/email`, `/sign-in/social`, `/request-password-reset`, `/send-verification-email` (`better-auth/dist/api/routes/{sign-up,sign-in,password,email-verification}.mjs`); sai mật khẩu → `APIError.from("UNAUTHORIZED", INVALID_EMAIL_OR_PASSWORD)` = **401** (`sign-in.mjs:323-337`).
- Phase 2 (`apps/web/src/server/infra.ts`, `POST /api/v1/stories`, `PUT .../cover`, `makeTestApiDeps` ở `@novel-hub/api/testing`), phase 4 (`POST /api/v1/stories/:publicId/chapters`), phase 5 (endpoint đăng/hẹn giờ), phase 9 (`producerRedis` lộ từ `infra.ts`; `POST /api/v1/reading/view` lấy IP qua helper `peerIp(c.req.raw)` ở `packages/api/src/lib/peer-ip.ts`, đọc `request.ip` của srvx).

## Overview

- Core `rate-limit`: fixed window bằng một Lua script, kiểm nhiều key trong một round trip; `clientIp()` là nguồn IP duy nhất.
- **Một cơ chế duy nhất:** Hono middleware. `/api/v1/*` dùng `rateLimit(port, action)`; `/api/auth/*` dùng `authRateLimit(port)` đặt trước `auth.handler`, map path → action. Limiter của Better Auth giữ `enabled: false`. <!-- Red Team: một limiter -->
- Chống khoá tài khoản: khoá chặt theo (email, IP) và IP; giới hạn theo email toàn cục chỉ đếm lần **thất bại**, ngưỡng cao. <!-- Red Team: account lockout -->
- Dùng lại kết nối Redis producer có sẵn (`producerRedis`, phase 9 đã lộ từ `infra.ts`), không mở kết nối mới. <!-- Red Team: reuse producer -->
- Thay `peerIp(c.req.raw)` của phase 9 bằng `deps.clientIp(c.req.raw)` rồi xoá `packages/api/src/lib/peer-ip.ts` (+ test): một nguồn IP duy nhất. <!-- Red Team: consistency sweep — tên helper IP của phase 9 -->

## Key Insights

- Một limiter thay vì hai: Better Auth limiter chỉ biết key `{ip}|{path}` và không đọc được kết quả thất bại; Hono đứng trước `auth.handler` thấy cả request lẫn response (status 401) nên làm được "chỉ đếm thất bại". Một chỗ cấu hình, một nguồn IP, một dạng 429.
- Đọc email: `await c.req.raw.clone().json()` trong try/catch, chỉ khi `content-type` là JSON và `content-length ≤ 16 KB`; không đọc được → `email = undefined`, chỉ kiểm IP. Request gốc giữ nguyên body cho Better Auth.
- `sessions.ip_address`: Better Auth đọc `x-forwarded-for` (client tự đặt được). Middleware ghi đè header nội bộ `x-novel-hub-client-ip` = `clientIp()` (hoặc xoá) bằng `new Request(raw, { headers })` và cấu hình `advanced.ipAddress.ipAddressHeaders` → session lưu IP thật. Không liên quan limiter.
- Producer Redis (`redis.ts:38-40`) có `enableOfflineQueue: false`: Redis mất kết nối thì lệnh lỗi ngay. Không có `commandTimeout` → bọc mỗi lần gọi bằng `withTimeout(…, 500)` thay vì đổi option của kết nối dùng chung với BullMQ.
- Lua nạp bằng `redis.defineCommand('nhRateLimit', …)` (tên riêng, không đụng lệnh BullMQ định nghĩa trên cùng kết nối).
- Fixed window: `INCR`; lần đầu `PEXPIRE`; trả `[count, pttl]`. Key bị từ chối vẫn tăng nhưng TTL không kéo dài. Đếm thất bại dùng cùng script sau khi có response.
- Peer IP khi không có Cloudflare: srvx 1.0.5 có getter `request.ip` (`srvx/dist/adapters/node.mjs:369`); `apps/web/src/routes/api/$.ts` chuyển nguyên `request` cho Hono nên `c.req.raw` nhiều khả năng là object srvx **[UNVERIFIED]** — bước 3 kiểm ở dev và bản build.
- `CurrentUser` chưa có `createdAt` → thêm để chọn tier, không truy vấn thêm.
- E2E đăng ký/đăng nhập nhiều lần từ cùng IP → `RATE_LIMIT_FACTOR` (e2e đặt 50, production bắt buộc 1) + global-setup xoá key `e2e:rl:*`.

## Requirements

**Functional**

- `check(action, subject)` trả `{ allowed, retryAfterSec }`; một key từ chối là từ chối cả lượt.
- Action và rule khởi điểm (đã duyệt ở validate làm giá trị khởi điểm; `max` nhân `RATE_LIMIT_FACTOR`):

| Action | Theo user (thường / mới < 3 ngày) | Theo (email, IP) | Theo IP | Email toàn cục | Áp ở |
|---|---|---|---|---|---|
| `signUp` | — | — | 5 / giờ | — | `/auth/sign-up/email` |
| `signIn` | — | 5 / 15 phút | 20 / 15 phút | **chỉ thất bại**: 50 / giờ | `/auth/sign-in/email`; `/sign-in/social` chỉ IP |
| `forgotPassword` | — | 3 / giờ | 5 / giờ | 10 / ngày | `/auth/request-password-reset` |
| `sendVerification` | — | 3 / giờ | 5 / giờ | 10 / ngày | `/auth/send-verification-email` |
| `createStory` | 5 / 2 mỗi ngày | — | 20 / ngày | — | `POST /api/v1/stories` |
| `uploadCover` | 10 / 5 mỗi giờ | — | 30 / giờ | — | `PUT /api/v1/stories/:publicId/cover` |
| `createChapter` | 50 / 10 mỗi ngày | — | 100 / ngày | — | `POST /api/v1/stories/:publicId/chapters` |
| `publishChapter` | 30 / 10 mỗi giờ | — | 60 / giờ | — | đăng + hẹn giờ chương (phase 5) |
| `report` | 10 / 3 mỗi giờ | — | 30 / giờ | — | `POST /api/v1/reports` (phase 15) |
| `comment` | 20 / 5 mỗi 10 phút | — | 60 / 10 phút | — | chỉ khai báo; Giai đoạn 2 áp |

  <!-- Red Team: thêm uploadCover/createChapter/sendVerification, bỏ resetPassword/readingView/readingProgress -->
- Không có action cho đọc: đếm lượt đọc đã có giới hạn riêng ở phase 9; tiến độ đọc chỉ ghi đè một dòng. `/reset-password` dùng token ngẫu nhiên, không cần limit riêng.
- Email toàn cục:
  - `signIn`: kiểm trước khi gọi handler (đọc counter, không tăng); tăng **chỉ khi** response 401. Khoá chặt nằm ở (email, IP) nên kẻ khác ở IP khác không khoá được chủ tài khoản ở IP của họ, trừ khi vượt ngưỡng cao 50/giờ (cần ≥ 3 IP).
  - Đặt lại mật khẩu thành công xoá counter thất bại của email (chủ thật chứng minh sở hữu email) qua `onPasswordReset` (`auth.ts:131`). OAuth Google không bị ảnh hưởng.
  - `forgotPassword`/`sendVerification`: đếm mọi request (chống spam mail vào hộp thư nạn nhân).
- 429:
  - `/api/v1/*` → `{ error: { code: 'RATE_LIMITED', message } }` + `Retry-After` (giây).
  - `/api/auth/*` → body dạng lỗi Better Auth `{ code: 'RATE_LIMITED', message }` (client `authClient` đọc `code`) + `Retry-After`.
  - Thông báo giống nhau dù email có tồn tại hay không.
- Web hiện "Bạn thao tác quá nhanh, thử lại sau N phút" (Paraglide) ở form auth và mọi chỗ gọi API ghi.

**Non-functional**

- Một round trip Redis mỗi lượt kiểm (thêm một lượt khi đăng nhập thất bại); timeout 500 ms mỗi lần.
- Redis lỗi/timeout → theo `onStoreError` của rule (đã chốt: `closed` cho `signUp`, `forgotPassword`, `sendVerification`; `open` cho mọi action khác); <!-- Updated: Validation Session 1 - onStoreError --> log lỗi lần đầu mỗi lần mất kết nối.
- Key không chứa email thô: `sha256(lowercase(trim(email)))` cắt 32 hex. Log không in IP, email.

## Architecture

```
request ─▶ Hono /api
  /auth/* : authRateLimit(port)
            ip = port.clientIp(raw); action = AUTH_PATH_ACTIONS[path] (POST)
            email = readEmail(raw.clone())            (JSON, ≤ 16 KB, lỗi → undefined)
            port.check(action, { ip, email })  ── 429? trả ngay
            req' = withClientIpHeader(raw, ip)
            res = auth.handler(req')
            action === 'signIn' && email && res.status === 401 → port.recordFailure('signIn', email)
  /v1/... : sessionMiddleware → requireAuth/requireVerifiedEmail → rateLimit(port, 'createStory') → handler

packages/core/rate-limit
  createRateLimiter({ redis, prefix, factor, timeoutMs }) → { check, recordFailure, clearFailures }
     buildChecks(rule, subject, now) → [{ key, max, windowMs, mode: 'hit' | 'peek' }] → Lua (một round trip)
  clientIp(request, { trustCf }) → string | null
key: {QUEUE_PREFIX}:rl:{action}:{u|ip|eip|ef}:{id}
```

```ts
// packages/shared/src/rate-limits.ts
export type RateLimitAction = 'signUp' | 'signIn' | 'forgotPassword' | 'sendVerification'
  | 'createStory' | 'uploadCover' | 'createChapter' | 'publishChapter' | 'report' | 'comment';
export interface Limit { max: number; windowSec: number }
export interface RateLimitRule {
  user?: { normal: Limit; newAccount: Limit };
  ip?: Limit;
  emailIp?: Limit;
  emailGlobal?: Limit & { countOn: 'failure' | 'request' };
  onStoreError: 'open' | 'closed';
}
export const NEW_ACCOUNT_DAYS = 3;
export const RATE_LIMITS: Record<RateLimitAction, RateLimitRule>;
export const AUTH_PATH_ACTIONS: Readonly<Record<string, RateLimitAction>>; // '/sign-in/email' → 'signIn', ...

// packages/core/src/rate-limit/*
export interface RateLimitSubject { user?: { id: string; createdAt: Date } | null; ip: string | null; email?: string }
export interface RateLimitDecision { allowed: boolean; retryAfterSec: number }
export interface RateLimiter {
  check(action: RateLimitAction, subject: RateLimitSubject): Promise<RateLimitDecision>;
  recordFailure(action: 'signIn', email: string): Promise<void>;
  clearFailures(action: 'signIn', email: string): Promise<void>;
}
export function createRateLimiter(opts: { redis: Redis; prefix: string; factor?: number;
  timeoutMs?: number; now?: () => Date }): RateLimiter;
export function clientIp(request: Request, opts: { trustCf: boolean }): string | null;
export function normalizeIp(ip: string): string | null; // IPv4-mapped → IPv4, IPv6 → /64, rác → null
export function resetRateLimits(redis: Redis, prefix: string): Promise<number>; // SCAN + DEL, chỉ cho test

// packages/api/src/deps.ts — ApiDeps thêm
rateLimit: RateLimiter | null;           // null (test cũ, Redis chưa dựng) → middleware cho qua
clientIp: (request: Request) => string | null;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/rate-limits.ts` (+ `.test.ts`) | create | rule, tier, map path; test: mọi action có ít nhất một chiều, `newAccount ≤ normal` |
| `packages/shared/src/index.ts` | modify | export |
| `packages/shared/src/env.ts` (+ test) | modify | `rateLimitEnvSchema`: `TRUST_CF_IP` (`z.stringbool()`, mặc định false), `RATE_LIMIT_FACTOR` (int 1–1000, mặc định 1); production bắt buộc `= 1` |
| `packages/core/src/rate-limit/{limiter,lua,client-ip,reset}.ts` (+ `.test.ts`, `limiter.int.test.ts`) | create | |
| `packages/core/src/users/current-user.ts` | modify | `createdAt: Date` |
| `packages/core/src/index.ts` | modify | export |
| `packages/auth/src/current-user.ts` | modify | map `createdAt: user.createdAt` |
| `packages/auth/src/auth.ts` | modify | `advanced.ipAddress.ipAddressHeaders: [CLIENT_IP_HEADER]`; option `onPasswordReset?: (email) => Promise<void>` gọi sau `markEmailVerified`; sửa comment cạnh `rateLimit: { enabled: false }` (giữ giá trị) |
| `packages/auth/src/auth.int.test.ts` | modify | ca 429 qua `createApp` với Redis thật |
| `packages/api/src/deps.ts`, `packages/api/src/testing.ts` (`makeTestApiDeps`, export `@novel-hub/api/testing`, phase 2) | modify | thêm field; `makeTestApiDeps` mặc định `rateLimit: null`, `clientIp: () => null` để 3 test dựng `createApp` hiện có và test của phase 2–12 không phải sửa |
| `packages/api/src/middleware/{rate-limit,auth-rate-limit}.ts` (+ `.test.ts`) | create | |
| `packages/api/src/lib/client-ip-header.ts` (+ test) | create | `withClientIpHeader`, `CLIENT_IP_HEADER` (auth import hằng này) |
| `packages/api/src/app.ts` | modify | `.on(['GET','POST'], '/auth/*', authRateLimit(deps), handler)` |
| `packages/api/src/routes/{stories,chapters,…}.ts` (tên theo phase 2/4/5) | modify | gắn `rateLimit` |
| `packages/api/src/routes/reading.ts` (phase 9) (+ test) | modify | `peerIp(c.req.raw)` → `deps.clientIp(c.req.raw)` |
| `packages/api/src/lib/peer-ip.ts` (+ test) (phase 9) | delete | `clientIp` thay thế |
| fixture `CurrentUser` (`packages/api/src/middleware/require-auth.test.ts`, các test khác) | modify | thêm `createdAt` |
| `apps/web/src/server/infra.ts` | modify | limiter dùng `producerRedis` sẵn có (phase 9); `clientIp` với `trustCf` |
| `apps/web/src/server/api-app.ts` | modify | truyền `rateLimit`, `clientIp`, `onPasswordReset` |
| `apps/web/src/lib/auth-errors.ts` (+ test) | modify | `MESSAGES.RATE_LIMITED` |
| helper lỗi API của phase 2 | modify | `RATE_LIMITED` + `Retry-After` → message kèm số phút |
| `packages/shared/messages/vi.json` | modify | `error_rate_limited`, `error_rate_limited_minutes` |
| `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts` | modify | `RATE_LIMIT_FACTOR: '50'`; `resetRateLimits(redis, 'e2e')` |
| `.env.example` | modify | `TRUST_CF_IP`, `RATE_LIMIT_FACTOR` kèm mô tả (đã duyệt) |

## Implementation Steps

1. **Shared:** `rate-limits.ts` theo bảng; `AUTH_PATH_ACTIONS` gồm `/sign-up/email`, `/sign-in/email`, `/sign-in/social`, `/request-password-reset`, `/send-verification-email`. Env schema + refine production `RATE_LIMIT_FACTOR = 1`.
2. **Lua (`lua.ts`):** nhận N key, `ARGV` = cặp `(windowMs, mode)`; `mode = hit` → `INCR` (+ `PEXPIRE` khi = 1), `peek` → `GET` + `PTTL`; PTTL âm khi key tồn tại → đặt lại TTL. Trả mảng `[count, pttl]`. `defineCommand('nhRateLimit', { lua })`, truyền `numberOfKeys` mỗi lần gọi.
3. **`clientIp`:** `trustCf` → `cf-connecting-ip` (một giá trị, `net.isIP`); không thì `(request as { ip?: unknown }).ip`; chuẩn hoá `normalizeIp`. Log một lần nguồn IP (không in IP). Kiểm thủ công ở `pnpm dev` và bản build (`node apps/web/.output/server/index.mjs`): IP khác `null`. Cả hai `null` → thử `runtime.node.req.socket.remoteAddress` của srvx; không được thì ghi Câu hỏi mở, không đoán.
4. **Limiter:** `buildChecks` chọn tier (`now - createdAt < NEW_ACCOUNT_DAYS`), dựng key, nhân `factor`; `emailGlobal` với `countOn: 'failure'` là `peek` trong `check`, `hit` trong `recordFailure`; `clearFailures` = `DEL`. `retryAfterSec = ceil(max pttl của key bị từ chối / 1000)`, tối thiểu 1. Lỗi/timeout → `open` cho qua, `closed` từ chối 60 s; log kiểu `logRedisErrors`.
5. **`CurrentUser.createdAt`:** sửa type, `lookupSession`, mọi fixture (grep `: CurrentUser` và `role: 'reader'` trong `packages`, `apps` lúc cook).
6. **Middleware `/api/v1`:** `rateLimit(port, action)` đọc `c.get('authUser') ?? c.get('user')`, `port.clientIp(c.req.raw)`; `port.rateLimit === null` → cho qua. Gắn **sau** `requireAuth`/`requireVerifiedEmail` để chưa đăng nhập bị 401 trước. Gắn vào: tạo truyện, upload bìa, tạo chương, đăng + hẹn giờ chương (cùng `publishChapter`). Ghi tên route thực tế vào báo cáo cook.
7. **Middleware `/auth/*`:** `authRateLimit(deps)` theo sơ đồ: chỉ POST có action mới kiểm; GET (callback OAuth, verify-email) chỉ ghi đè header IP. `withClientIpHeader` dựng `new Request(raw, { headers })`; int test chứng minh body POST vẫn đọc được. Sau handler: `signIn` + email + 401 → `recordFailure` (lỗi chỉ log, không đổi response).
8. **Better Auth:** `ipAddressHeaders`; option `onPasswordReset` (web truyền `email => limiter.clearFailures('signIn', email)`), lỗi chỉ log. Không thêm hook `before` nào; `bannedGuard` giữ nguyên.
9. **Infra web:** `infra.ts` dựng `createRateLimiter({ redis: producerRedis, prefix: \`${QUEUE_PREFIX}:rl\`, factor: RATE_LIMIT_FACTOR, timeoutMs: 500 })` — `producerRedis` là kết nối `createProducerConnection` đã có cho queue; không thêm kết nối, không thêm `close`.
10. **Phase 9 IP:** grep `peerIp` và `\.ip\b` trong `packages/api/src`, `apps/web/src`; `routes/reading.ts` đổi sang `deps.clientIp(c.req.raw)`; xoá `lib/peer-ip.ts` (+ test); test `/view` của phase 9 truyền `clientIp` qua `makeTestApiDeps({ clientIp })` và vẫn xanh.
11. **Web:** `MESSAGES.RATE_LIMITED`; helper lỗi API đọc `Retry-After` → `m.error_rate_limited_minutes({ minutes })`; `pnpm i18n:compile`.
12. **E2E:** `RATE_LIMIT_FACTOR: '50'`; global-setup `resetRateLimits(redis, 'e2e')` rồi đóng kết nối.
13. `.env.example`: `TRUST_CF_IP=true` chỉ khi origin firewall chỉ nhận IP Cloudflare; `RATE_LIMIT_FACTOR` chỉ dùng cho test.
14. Smoke thủ công: `curl` 6 lần `POST /api/auth/sign-up/email` → lần 6 là 429 có `Retry-After`; kèm `X-Forwarded-For` giả không lách được; sai mật khẩu 6 lần từ một IP → IP đó bị khoá với email đó, IP khác đăng nhập đúng mật khẩu vẫn được; `docker compose stop redis` → `signUp`/`forgotPassword`/`sendVerification` bị chặn, đăng nhập vẫn chạy, log một lần.
15. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Rate limit Redis…" trong spec.

## Function / Interface Checklist

- [x] `RATE_LIMITS`, `AUTH_PATH_ACTIONS`, `NEW_ACCOUNT_DAYS`, `rateLimitEnvSchema`
- [x] `createRateLimiter(opts).check / recordFailure / clearFailures`
- [x] `clientIp(request, { trustCf })`, `normalizeIp(ip)`, `resetRateLimits(redis, prefix)`
- [x] `rateLimit(port, action)`, `authRateLimit(deps)`, `withClientIpHeader(req, ip)`, `CLIENT_IP_HEADER`
- [x] option `onPasswordReset` của `createAuth`; `ipAddressHeaders`
- [x] `CurrentUser.createdAt`; `ApiDeps.rateLimit`, `ApiDeps.clientIp` (+ mặc định trong `makeTestApiDeps`)

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Lua: `max` lượt đầu qua, lượt `max+1` từ chối, `retryAfterSec` ≈ TTL còn lại; hết cửa sổ mở lại; `peek` không tăng | int `limiter.int.test.ts` |
| Critical | 20 lượt song song với `max = 5` → đúng 5 lượt qua | int |
| Critical | Tài khoản 1 ngày tuổi → tier `newAccount`; một key (user/IP) vượt → từ chối cả lượt | unit |
| High | Redis lỗi/timeout: `open` cho qua, `closed` từ chối 60 s; log một lần | unit |
| High | `factor = 50` nhân `max` | unit |
| Critical | `clientIp`: `trustCf` dùng `cf-connecting-ip`; không `trustCf` bỏ qua nó và `x-forwarded-for`; IPv6 cùng /64 → cùng key; IPv4-mapped → IPv4; rác → `null` | unit |
| Critical | `/api/v1`: 429 `RATE_LIMITED` + `Retry-After`; chưa đăng nhập → 401 trước khi đếm; `rateLimit = null` → cho qua | unit `rate-limit.test.ts` |
| Critical | Better Auth thật + Redis test: 6 lần sign-up cùng IP → 429 body `code: 'RATE_LIMITED'`; khác IP → qua | int `auth.int.test.ts` |
| Critical | Chống khoá: 5 lần sai mật khẩu từ IP A → A bị 429 với email đó; IP B đúng mật khẩu → 200 | int |
| High | Email toàn cục: 50 lần thất bại từ nhiều IP → IP mới bị 429; đặt lại mật khẩu → counter xoá, đăng nhập được; đăng nhập đúng không tăng counter | int |
| High | Header `x-novel-hub-client-ip` client gửi bị ghi đè; body POST còn đọc được; `sessions.ip_address` = IP thật | unit + int |
| High | Body không phải JSON / quá 16 KB → chỉ kiểm IP, handler vẫn nhận body nguyên | unit |
| High | Env production với `RATE_LIMIT_FACTOR=50` → lỗi khởi động | unit `env.test.ts` |
| High | `authErrorMessage({ code: 'RATE_LIMITED' })` → chuỗi rate limit | unit |
| Medium | E2E cũ (auth, viết/đăng, đọc) xanh với `RATE_LIMIT_FACTOR=50` | e2e |
| Medium | Peer IP có thật ở dev và bản build; Redis tắt → đúng quyết định | thủ công (bước 3, 14) |

## Dependency Map

- Cần: phase 2 (`infra.ts`, `POST /stories`, `PUT .../cover`, `makeTestApiDeps`), phase 4 (`POST .../chapters`), phase 5 (đăng/hẹn giờ), phase 9 (`producerRedis`, `peerIp` cần thay), Giai đoạn 0 (Better Auth, `requireAuth`).
- Phase 15 dùng `rateLimit(port, 'report')` cho `POST /api/v1/reports`.
- Giai đoạn 2 dùng rule `comment` sẵn có.

## Success Criteria

- [x] Mọi action trong checkbox (+ `uploadCover`, `createChapter`, `sendVerification`) có giới hạn theo user và/hoặc IP như bảng; bình luận có rule sẵn
- [x] Chỉ một limiter (Hono); Better Auth `rateLimit.enabled` vẫn `false`
- [x] Người khác không khoá được tài khoản ở IP của chủ (int test); giả `X-Forwarded-For` không lách được
- [x] 429 có `Retry-After` ở cả `/api/v1` và `/api/auth`; web hiện thông báo tiếng Việt
- [x] Đếm lượt đọc dùng `clientIp`; E2E không flaky; gate xanh; checkbox `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| `c.req.raw` không còn `ip` của srvx → mọi người chung một bucket | TB × Cao | Bước 3 kiểm thực tế; production dùng `TRUST_CF_IP`; chưa giải được thì chặn deploy |
| `new Request(raw, { headers })` / `clone()` làm mất body | Thấp × Cao | Int test POST JSON qua cả hai |
| Botnet vượt ngưỡng email toàn cục → chủ bị chặn đăng nhập mật khẩu | Thấp × TB | Ngưỡng cao, cần nhiều IP; đặt lại mật khẩu xoá counter; Google OAuth không bị chặn |
| Redis chậm làm chậm request ghi | Thấp × TB | Timeout 500 ms, offline queue tắt |
| Giới hạn quá chặt với NAT/trường học | TB × TB | IP limit rộng hơn; chỉnh bảng ở shared, không migration |

Rollback: gỡ `authRateLimit` khỏi `/auth/*` và `rateLimit` khỏi route (hoặc `rateLimit: null` ở infra); không migration, không đổi config Better Auth ngoài `ipAddressHeaders`.

## Security Considerations

- Không tin header IP nào trừ `cf-connecting-ip` khi `TRUST_CF_IP=true`; origin production phải firewall chỉ nhận IP Cloudflare (ghi ở `.env.example`).
- Không bao giờ chặn đăng nhập đúng mật khẩu chỉ vì người khác thử sai ở IP khác (dưới ngưỡng toàn cục).
- Key email là hash; log không in IP, email; 429 không phân biệt email tồn tại hay không.
- `RATE_LIMIT_FACTOR ≠ 1` bị chặn ở production.

## Next Steps

Phase 14 (kiểm tra trùng lặp), rồi phase 15 gắn `rateLimit(port, 'report')`. Tìm kiếm chưa có action (đã chốt ở validate: chưa cần năm đầu); health công khai không rate limit (truy vấn rẻ, dịch vụ uptime gọi định kỳ, Cloudflare đứng trước). <!-- Updated: Validation Session 1 - search/health không rate limit -->

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Redis chết: `onStoreError: 'closed'` cho `signUp`, `forgotPassword`, `sendVerification`; `'open'` cho mọi action khác.
2. Email toàn cục cho đăng nhập: phương án A — chặn khi vượt 50 thất bại/giờ, đặt lại mật khẩu xoá counter.
3. Giá trị rule trong bảng: dùng làm khởi điểm.
4. Env `TRUST_CF_IP`, `RATE_LIMIT_FACTOR`: đã duyệt. Prefix key dùng `QUEUE_PREFIX` (`novelhub:rl:*`, e2e `e2e:rl:*`); sửa comment `queueEnvSchema` thành "tiền tố key Redis của app".
5. Peer IP qua srvx: `@tanstack/start-server-core` cài kèm `srvx@1.0.5` (có getter `ip`, `node.mjs:369`); việc `request` ở handler có phải object srvx hay không vẫn kiểm runtime ở bước 3 (dev + build).

