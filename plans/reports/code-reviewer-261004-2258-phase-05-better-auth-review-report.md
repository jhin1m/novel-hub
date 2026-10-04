# Code review: Phase 5 (Better Auth + middleware phân quyền)

Điểm: **7.5/10**. Critical: **0**. High: 1. Medium: 2. Low: 5.

## Phạm vi

- File: toàn bộ danh sách trong brief (`packages/auth/**`, `packages/api/src/{app,deps,index}.ts` + `middleware/*` + `routes/me.ts`, `packages/core/src/{policies,users,mail}/*`, `packages/shared/src/{env,schemas/user}.ts` + Paraglide, `packages/db` (seed subpath, `runMigrations`, `describeDbError`), `apps/web` (server, lib, 5 trang, e2e), config root).
- Đối chiếu thêm với source `better-auth@1.7.7/dist` (`api/routes/session.mjs`, `email-verification.mjs`, `oauth2/link-account.mjs`, `middlewares/origin-check.mjs`) và `hono@4.13.12/middleware/csrf`.
- Probe: thêm file int test tạm vào bản clone trong scratchpad (không đụng repo), chạy trên DB `_test`. Gate chạy lại trên repo: `pnpm typecheck` xanh, `pnpm lint` xanh, `pnpm test` 101/101.

## Threat model

Thứ cần bảo vệ: cookie phiên (`session_token`), quyền ghi (role, trạng thái xác thực email), danh tính tài khoản (email, username bất biến), token xác thực và đặt lại mật khẩu trong mail. Giai đoạn 0 chưa public, chưa có dữ liệu thật, chưa có rate limit (đã chấp nhận). Kẻ tấn công thực tế: người dùng ẩn danh trên Internet, trang web khác (CSRF), người chiếm email trước.

## Acceptance criteria

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| role/status không tự đặt được | Đạt | `auth.ts:104-118` `input: false`; int test tạo + `update-user` |
| Username bất biến | Đạt | `hooks.ts:102`; int test |
| `image` luôn bị bỏ | Đạt | tạo: `hooks.ts:92` (`image: null`); cập nhật: `hooks.ts:103`; hồ sơ Google: int test |
| Ban: sign-in, mọi `/api/auth/*` trừ sign-out, `/api/v1/*` | Đạt | `hooks.ts:111-131`, `current-user.ts:17,22`; int test; probe: cookie bị ban cũng chặn đăng nhập tài khoản khác (chấp nhận được, xem "Đã kiểm") |
| Reset thu hồi session + `emailVerified=true` | Đạt | `auth.ts:127-130`; int test (cả ca chiếm email) |
| Mail fire-and-forget | Đạt | `auth.ts:51-60`; int test cổng treo / ném lỗi |
| Production thiếu SMTP thì fail | Đạt | `env.ts:81-90` + `mailer.ts:24-26`; unit test cả hai |
| Không lộ id | Đạt ở `/api/v1` và UI | `me.ts:8-9`; int test. `/api/auth/*` vẫn trả id của chính user (L4) |
| Phiên (spec checkbox) | **Chưa đạt trọn** | H1: cookie phiên không bao giờ được gia hạn |
| Bundle client sạch (kiểm bằng sourcemap) | **Chưa kiểm được** | Hook chặn lệnh chứa "build"; không có `.output`; tester report không nhắc. Xem câu hỏi 1 |

## High

### H1. Cookie phiên không bao giờ được gia hạn: mọi user bị đăng xuất cứng 7 ngày sau khi đăng nhập, dù dùng hằng ngày

- File: `packages/auth/src/hooks.ts:128`, `packages/auth/src/current-user.ts:15`, `packages/api/src/middleware/session.ts:12`.
- Cơ chế (đã đọc source và probe):
  1. `getSession` của Better Auth (`api/routes/session.mjs:179-215`) gia hạn phiên sau `updateAge` (1 ngày): ghi `expires_at` mới vào DB **và** gửi lại `Set-Cookie` với `Max-Age=604800`.
  2. `bannedGuard` gọi `getSessionFromCtx(ctx)` cho mọi request `/api/auth/*` có cookie. Hàm này chạy logic gia hạn **trong hook**: DB được gia hạn, nhưng `Set-Cookie` gắn vào context của hook và không đi tới response. Tới lượt endpoint thật (`/get-session`), phiên trong DB đã mới nên endpoint không gửi cookie nữa.
  3. `/api/v1/*` gọi `auth.api.getSession({ headers })` không có `returnHeaders`, nên `Set-Cookie` gia hạn cũng bị bỏ. Web hiện chỉ gọi `/api/v1/me`; `authClient.getSession()` chỉ chạy khi bấm "gửi lại mail".
- Kết quả probe (phiên còn 5 ngày, tức đã tới ngưỡng gia hạn):
  - `GET /api/v1/me`: 200, `set-cookie: []`; DB `expires_at` đã được gia hạn.
  - `GET /api/auth/get-session` có `bannedGuard`: `set-cookie: []`.
  - Cùng request khi tắt `bannedGuard`: `better-auth.session_token=…; Max-Age=604800`.
- Kịch bản lỗi: user đăng nhập ngày 1, dùng mỗi ngày. Tới ngày 8 cookie trên browser hết `Max-Age`, user bị đăng xuất, dù trong DB phiên còn hạn. CI không bắt được vì test không chạy đủ 7 ngày.
- Đề xuất (cần cả hai):
  1. `hooks.ts:128`: `getSessionFromCtx(ctx, { disableRefresh: true })`. Đã probe trong bản clone: `/api/auth/get-session` gửi lại cookie gia hạn; 29/29 int test hiện có vẫn xanh.
  2. Cho đường `/api/v1` chuyển tiếp cookie gia hạn: `getCurrentUser` gọi `auth.api.getSession({ headers, returnHeaders: true })` và trả kèm header `set-cookie`; `sessionMiddleware` append vào response (route v1 đã `no-store`). Cách khác: web gọi `authClient.getSession()` định kỳ, nhưng như vậy là thêm request chỉ để giữ phiên.
  3. Thêm int test: đẩy `expires_at` về `now + 5d`, gọi `/api/v1/me` và `/api/auth/get-session`, assert có `Set-Cookie` chứa `session_token`.

## Medium

### M1. `/api/v1/health` hồi quy: request có cookie khi DB sập nhận 500 `INTERNAL_ERROR` thay vì 503 `UNHEALTHY` kèm `checks`

- File: `packages/api/src/app.ts:13-15`. `sessionMiddleware` đứng trước `.route('/health', …)`, nên health cũng phải tra phiên.
- Probe: `getCurrentUser` ném lỗi + cookie bất kỳ → `GET /api/v1/health` = `500 {"error":{"code":"INTERNAL_ERROR",…}}`. Khi DB treo, request health có cookie còn chờ thêm tới `connectionTimeoutMillis` 5s hoặc `statement_timeout` 15s trước khi tới bước ping.
- Ảnh hưởng: uptime monitor ngoài (không cookie) không bị ảnh hưởng. Nhưng contract phase 4 ("health trả 503 kèm `checks`") bị phá với browser đã đăng nhập, và mỗi lần gọi health có cookie tốn thêm 2 query phiên (xem L5).
- Đề xuất: chỉ gắn `sessionMiddleware` cho các route cần (`.route('/me', …)` và các sub-app domain sau này), hoặc mount health trước `.use(sessionMiddleware)`. Thêm test: health + cookie + `getCurrentUser` reject → 200/503 theo `checkHealth`.

### M2. Còn đường chiếm tài khoản trước qua link xác thực email (phần dư của threat "email squatting")

- File: `packages/auth/src/auth.ts:132-137` (`autoSignInAfterVerification: true`, verify không thu hồi gì).
- Kịch bản (đã probe):
  1. A đăng ký bằng email X của nạn nhân B, có mật khẩu do A đặt. Mail xác thực gửi tới hộp thư của B.
  2. B bấm link (dù mail có dặn bỏ qua). Kết quả: `emailVerified=true`, B được đăng nhập tự động.
  3. Session cũ của A vẫn 200 ở `/api/v1/me`. Mật khẩu của A vẫn đăng nhập được (200).
  4. Từ đây tài khoản đã xác thực, nên Google của B sẽ tự liên kết vào (`requireLocalEmailVerified` thoả). B dùng tài khoản để viết truyện, còn A vẫn giữ quyền truy cập song song.
- Better Auth 1.7.7 có `revokeUnprovenAccountAccess` (xoá account + session trước khi đánh dấu verified), nhưng chỉ dùng cho magic link và email OTP, không dùng ở `verify-email`.
- Đề xuất (quyết định sản phẩm, xem câu hỏi 2):
  - (a) Tối thiểu: `emailVerification.beforeEmailVerification` xoá mọi session của user (`deleteUserSessions`). Auto sign-in tạo phiên mới cho người bấm link sau đó. Cách này cắt session của A nhưng mật khẩu của A vẫn còn.
  - (b) Chặt: chỉ khi user chưa từng xác thực mà verify thì xoá mọi session, đồng thời bắt đặt lại mật khẩu credential. Tốn công hơn, và người đăng ký thật cũng phải đặt lại mật khẩu.
  - (c) Chấp nhận rủi ro dư và ghi vào plan/spike: dựa vào lời dặn trong mail cộng với luồng reset.

## Low

- **L1. Phiên lỗi khác `ACCOUNT_BANNED` thành 500.** `current-user.ts:17-18`: `getSession` ném `APIError UNAUTHORIZED FAILED_TO_GET_SESSION` khi phiên bị xoá đồng thời lúc đang gia hạn (`session.mjs:204-209`). Ví dụ: đăng xuất ở tab khác cùng lúc `/me` refetch. Lỗi này rơi vào `handleError` thành 500. Đề xuất: `APIError` có status 401 → trả `null`.
- **L2. Form quên mật khẩu không có `method="post"`.** `routes/quen-mat-khau.tsx:30`. Nếu submit trước khi hydrate (mạng chậm), browser GET `/quen-mat-khau?email=…`: email lộ vào URL, lịch sử và log Cloudflare/origin. Form không chứa mật khẩu nên ngoài phạm vi tiêu chí (e), nhưng nên thêm `method="post"` cho đồng bộ với 3 form kia.
- **L3. Tên hiển thị do người đăng ký đặt được chèn vào mail gửi tới email tuỳ ý.** `auth.ts:126,136` → `auth-emails.ts:15` (`Chào {name}`). Kẻ xấu đăng ký bằng email nạn nhân với `name` = "Nhận thưởng tại http://lua-dao.example". Mail xác thực gửi từ domain của site sẽ mang câu đó. Mail là text thuần nên không có XSS, chỉ là giả mạo nội dung. Đề xuất: mail xác thực không chèn `name`, hoặc chỉ chèn sau khi đã xác thực. Nên làm cùng rate limit ở Giai đoạn 1.
- **L4. `/api/auth/*` trả `user.id`, `session.userId`, `ipAddress`, `userAgent` của chính user.** Đây là shape của Better Auth (sign-up, sign-in, get-session) và chỉ lộ cho chủ tài khoản. Nhưng UUIDv7 lộ thời điểm tạo, và dễ bị ai đó dùng nhầm `authClient` data trong UI. Đề xuất: ghi chú trong `lib/auth-client.ts` rằng UI chỉ lấy dữ liệu user từ `/api/v1/me`, không render từ `authClient.getSession()`. Bản thân `index.tsx:36` hiện chỉ đọc `email`, ổn.
- **L5. Mỗi request có cookie tra phiên 2 lần.** `hooks.ts:128` (`bannedGuard`) cộng với chính endpoint `get-session` (`session.mjs:152` gọi `findSession` trực tiếp, không dùng cache `ctx.context.session`). Áp dụng cho cả `/api/v1/*` (qua `auth.api.getSession`) và `/api/auth/get-session`. "Query DB mỗi request" đã được chấp nhận, nhưng hiện là gấp đôi. Có thể bỏ qua guard cho `ctx.path === '/get-session'` khi gọi từ server (`getCurrentUser` đã tự kiểm `isBanned`), hoặc đo lại ở Giai đoạn 1.

## Đã kiểm, không có vấn đề

- **CSRF `/api/v1`.** `hono/csrf` 4.13.12 chặn form/text/plain khác origin; `Origin: null` cũng bị chặn (probe 403, đúng shape lỗi). JSON khác origin bị preflight chặn vì không có CORS. Wrapper `csrf.ts` không nuốt lỗi của handler phía sau.
- **Origin check `/api/auth/*`.** `disableOriginCheck: false` có hiệu lực ở `NODE_ENV=test` (int test Origin lạ → 403). `callbackURL`/`redirectTo` ngoài `trustedOrigins` → 403 `INVALID_CALLBACK_URL` (probe). Verify-email và reset callback có `originCheck` (source).
- **Endpoint nguy hiểm đã tắt.** `change-email` → 400 `CHANGE_EMAIL_DISABLED`, `delete-user` → 404, `update-user {emailVerified:true}` → 400 và DB không đổi (probe).
- **Liên kết Google.** `requireLocalEmailVerified ?? true` (`link-account.mjs:138`). `overrideUserInfoOnSignIn` / `updateUserInfoOnLink` mặc định tắt, nên luồng Google không gửi `name`/`image` vào `update.before`, và `userUpdateBefore` không chặn nhầm. Update nội bộ duy nhất ở luồng mặc định là `{ emailVerified: true }`, đi qua được.
- **Log.** Logger tuỳ biến làm sạch `Error` bằng `describeDbError`. Lỗi DB trong `get-session` bị Better Auth bọc thành `APIError` trước khi tới `handleError`, nên không lộ SQL/token ra log. Log `info` có email (`Sign-up attempt for existing email`) bị lọc vì level `warn`.
- **Error contract và touchpoint.**
  - `/api/v1` giữ `{ error: { code, message } }`.
  - `noStore` vẫn áp cho `/api/auth/*`.
  - `createApiClient` có consumer thật (`lib/me.ts`), type suy ra đúng (`api-client.test.ts`).
  - Seed guard và `truncateAll` không đổi. CLI seed mới vẫn qua `assertSeedAllowed`. Mật khẩu seed lấy từ env, có Zod `min(8)`.
- **Public contract.** `ApiDeps.auth: AuthPort`, `ApiDeps.appUrl`, subpath `@novel-hub/db/seed`, xoá `seed/cli.ts`: đều có chủ ý và khớp plan. Không thấy thay đổi export ngoài ý muốn. `index.ts` của api export thêm `requireAuth/Role/VerifiedEmail`, `sessionMiddleware`, `AuthPort`: hợp lý cho Giai đoạn 1.
- **Pattern.**
  - Comment tiếng Việt, file kebab-case, không `any`.
  - Quyết định quyền qua `core/policies`; middleware chỉ dịch kết quả sang HTTP.
  - Chuỗi UI qua Paraglide. Chuỗi cứng còn lại (`'Lỗi xác thực'`, message `MESSAGES` trong hooks) không hiển thị, vì UI map theo `code`.
  - Form có mật khẩu (`dang-ky`, `dang-nhap`, `dat-lai-mat-khau`) đều `method="post"`.
  - ESLint chặn import value `@novel-hub/auth` từ web; `auth-client.ts` chỉ `import type`.
- **Ban.** `session.create.before` chạy ở cả sign-in, OAuth callback và auto sign-in sau verify. Với cookie của user bị ban, đăng nhập tài khoản khác cũng bị 403 (probe). Tuy nhiên ca này chỉ xảy ra khi ban mà không xoá session. Bất biến "ban ⇒ xoá session" đã ghi ở `policies/user.ts:25-28` cho `banUser()` của Giai đoạn 1, nên không báo.
- **E2E.** Cô lập đúng plan: port 3100, `reuseExistingServer: false`, DB/Redis test, SMTP rỗng. `global-setup` chỉ truncate được DB `_test`.

## Hành động đề xuất (ưu tiên)

1. H1: `disableRefresh: true` trong `bannedGuard`; chuyển tiếp `Set-Cookie` gia hạn ở đường `/api/v1`; thêm int test gia hạn.
2. M1: tách `sessionMiddleware` khỏi health; thêm test health + cookie + auth lỗi.
3. M2: user chọn (a), (b) hoặc (c); tối thiểu là ghi nhận rủi ro dư vào spike report.
4. L1, L2: sửa nhỏ, nên làm luôn trong phase này.
5. Chạy kiểm tra bundle client bằng sourcemap (tiêu chí Success Criteria) và ghi kết quả vào tester report.

## Câu hỏi chưa giải quyết

1. Kiểm tra "bundle client sạch (sourcemap)" ở bước 8 của plan đã chạy chưa? Không thấy trong tester report. Reviewer không chạy được vì hook chặn lệnh chứa "build".
2. M2: chọn (a) xoá session khi verify, (b) bắt đặt lại mật khẩu khi verify lần đầu, hay (c) chấp nhận rủi ro dư?
3. H1: muốn phiên trượt (gia hạn khi còn dùng) hay cố định 7 ngày? Nếu chủ ý là cố định, nên đặt `session.disableSessionRefresh: true` để DB và cookie khớp nhau, thay vì như hiện tại (DB gia hạn, cookie không).

```
Status: DONE_WITH_CONCERNS
Summary: Phase 5 đạt gần hết acceptance criteria, gate xanh, không có lỗ hổng Critical. Có một lỗi High chỉ lộ ra ở production (cookie phiên không được gia hạn, nên user bị đăng xuất sau 7 ngày) và hai Medium (health 500 khi có cookie và DB sập; còn đường chiếm tài khoản trước qua link xác thực).
Concerns/Blockers: Chưa kiểm được bundle client bằng sourcemap (hook chặn "build"); M2 cần user quyết định.
```
