# Báo cáo cook: Phase 13 — Rate limit Redis

Ngày: 2026-10-05 · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-13-rate-limit-redis.md` · Trạng thái: Completed (chưa commit)

## Đã làm

- **Shared** `packages/shared/src/rate-limits.ts`: `RATE_LIMITS` (đúng bảng plan), `NEW_ACCOUNT_DAYS`, `AUTH_PATH_ACTIONS`, `CLIENT_IP_HEADER`. `env.ts`: `rateLimitEnvSchema` (`TRUST_CF_IP` stringbool mặc định false, `RATE_LIMIT_FACTOR` 1–1000 mặc định 1) + `requireUnitRateLimitFactorInProduction`; sửa comment `queueEnvSchema`.
- **Core** `packages/core/src/rate-limit/`: `lua.ts` (fixed window, `nhRateLimit`, hit/peek, khôi phục TTL mất), `limiter.ts` (`createRateLimiter`: tier tài khoản mới, IP, (email, IP), email toàn cục; email hash sha256/32 hex; factor; timeout 500 ms; `onStoreError` open/closed, log một lần mỗi lần mất kết nối; IP không xác định → bucket chung `unknown`), `client-ip.ts` (`clientIp`, `normalizeIp` IPv4-mapped→IPv4, IPv6→/64 dạng `a:b:c:d::`, `createClientIpResolver` log nguồn IP một lần), `reset.ts`.
- `CurrentUser.createdAt` (core + `lookupSession`), cập nhật fixture test.
- **API**: `ApiDeps.rateLimit`, `ApiDeps.clientIp` (mặc định `null`/`() => null` trong `makeTestApiDeps`). Middleware `rateLimit(port, action)` gắn sau `requireVerifiedEmail` ở:
  - `POST /api/v1/stories` (`createStory`)
  - `PUT /api/v1/stories/:publicId/cover` (`uploadCover`, trước `bodyLimit`)
  - `POST /api/v1/stories/:publicId/chapters` (`createChapter`)
  - `POST /api/v1/stories/:publicId/chapters/:number/publish` và `PUT .../:number/schedule` (`publishChapter`)
- `authRateLimit` trước `auth.handler` ở `/api/auth/*`: ghi đè `x-novel-hub-client-ip`; POST vào path trong `AUTH_PATH_ACTIONS` → đọc body clone giới hạn 16 KB (>16 KB → 413 `PAYLOAD_TOO_LARGE`), đọc `email` y như better-call (JSON trước, urlencoded lấy giá trị cuối); 429 `{ code: 'RATE_LIMITED', message, retryAfterSec }` + `Retry-After`; sign-in 401 → `recordFailure`.
- `peer-ip.ts` (+ test) xoá; `/reading/view` dùng `deps.clientIp`.
- **Auth**: `advanced.ipAddress.ipAddressHeaders: [CLIENT_IP_HEADER]`; option `onPasswordReset(email)` (web xoá counter thất bại); `rateLimit.enabled` vẫn `false`.
- **Web**: `infra.ts` dựng limiter trên `producerRedis` (không thêm kết nối) + `clientIp`; `api-app.ts` truyền vào. `ApiError.retryAfterSec`, `rateLimitedMessage`, `MESSAGES` cho `RATE_LIMITED` ở cả `api-errors` và `auth-errors`; i18n `error_rate_limited`, `error_rate_limited_minutes`.
- **E2E**: `RATE_LIMIT_FACTOR=50`, `TRUST_CF_IP=false`; global-setup `resetRateLimits(redis, 'e2e')`.
- `.env.example`: `TRUST_CF_IP`, `RATE_LIMIT_FACTOR` kèm mô tả. `docs/deployment-cloudflare.md`: viết lại mục IP người dùng.

## Lệch so với plan (có lý do)

- `CLIENT_IP_HEADER` đặt ở `@novel-hub/shared` thay vì `packages/api/src/lib/client-ip-header.ts`: `auth` không phụ thuộc `api`, tránh thêm dependency giữa package.
- `withClientIpHeader` dựng `Request` native từ url/method/headers/body (`duplex: 'half'`), không dùng `new Request(raw, { headers })`: ở `vite dev` request là object srvx nhưng `globalThis.Request` không được patch → constructor native ném `Cannot read private member #state` (đã tái hiện).
- Đọc email không dựa vào `content-length` (bản đầu dựa vào → body chunked/không có length né được giới hạn email). Body > 16 KB ở path bị giới hạn trả 413 thay vì "chỉ kiểm IP" (độn body là cách né).
- `createRateLimiter` nhận `prefix = QUEUE_PREFIX` và tự nối `:rl` (khớp `resetRateLimits(redis, 'e2e')`).
- IP `null` → bucket chung `unknown` thay vì bỏ chiều IP (theo review M2: không để `signUp` fail-closed bị tắt im lặng).

## Kiểm runtime (bước 3, 14)

| Môi trường | Nguồn IP | Kết quả |
|---|---|---|
| `vite dev` (port 3200, DB/Redis test) | `peer` | 5×200 rồi 429 `Retry-After: 3600`; `X-Forwarded-For` và `x-novel-hub-client-ip` giả không lách; `sessions.ip_address` = `127.0.0.1` |
| Bản build `node apps/web/.output/server/index.mjs` | `peer` | sign-up thứ 6 → 429; `cf-connecting-ip` bị bỏ qua khi `TRUST_CF_IP` tắt |
| Bản build + `TRUST_CF_IP=true` | `cf-connecting-ip` | 5 lần sai mật khẩu từ IP A → A bị 429 kể cả đúng mật khẩu; IP B đúng mật khẩu → 200 |
| Bản build, `docker compose stop redis` | — | sign-up, request-password-reset → 429 `Retry-After: 60`; sign-in vẫn chạy (401); log `[rate-limit] store unavailable` một lần; Redis đã bật lại |

Đã kiểm biến thể path: Better Auth (better-call) trả 404 cho trailing slash và `//`, rou3 phân biệt hoa thường, Hono giải mã `%xx` trước khi tra → không lách được; vẫn bỏ trailing slash khi tra path để phòng `skipTrailingSlashes` bật sau này.

## Gate

`pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm format:check` ✓ · `pnpm test` 538 ✓ · `pnpm test:int` 255 ✓ (1 skip S3) · `pnpm test:e2e` 62 ✓

## Review (code-reviewer)

- H1 (đọc `email` khác better-call → né giới hạn theo email bằng urlencoded lặp field hoặc tham số content-type): **đã sửa** + unit test.
- M2 (IP `null` tắt giới hạn fail-closed): **đã sửa** (bucket `unknown`).
- L1 (trailing slash): **đã sửa** phòng hờ.
- L2: IPv6 lưu /64 vào `sessions.ip_address` — chủ ý (Better Auth cũng chuẩn hoá /64).
- L3: email toàn cục có thể vượt 50 chút khi song song — giới hạn bởi (email, IP) và IP, chấp nhận.
- L4: body sign-up > 16 KB → 413; form hiện không gửi gì lớn.

## Câu hỏi mở (cần user quyết, không chặn)

1. **M1 — khoá chủ tài khoản tới 24 giờ:** kẻ xấu dùng hết quota `forgotPassword` theo email (10/ngày, đếm mọi request) rồi đẩy > 50 lần đăng nhập sai/giờ → chủ không đăng nhập bằng mật khẩu và không đặt lại được (trừ khi có Google). Phương án: (a) chỉ đếm quota reset với request qua được validate của Better Auth; (b) đăng nhập đúng từ IP chưa bị khoá bỏ qua kiểm email toàn cục; (c) chấp nhận và ghi tài liệu.
2. **M3 — production sau Cloudflare/Docker proxy với `TRUST_CF_IP=false`:** mọi người chung vài bucket IP → đăng ký 5/giờ thành từ chối dịch vụ toàn site; log vẫn in `peer`. Đề xuất thêm mục checklist deploy hoặc cảnh báo khởi động khi `NODE_ENV=production && !TRUST_CF_IP` (đổi chính sách config, cần duyệt). `docs/deployment-cloudflare.md` đã ghi cách bật đúng.
