# Spike Better Auth 1.7.7 (phase 5)

Ngày: 2026-10-04. Chạy script tạm (đã xoá) trên DB `novel_hub_test` + đọc source `better-auth@1.7.7/dist`.

## Kết quả

| # | Giả định | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | `npx auth@1.7.7 generate` (env rỗng, cwd scratch) → diff cột | ✅ Không thiếu cột. Khác biệt chỉ là `uuid`/`timestamptz`, unique `(provider_id, account_id)`, default `updated_at` — đều hợp lệ. **Không cần migration `0001`** | output generate |
| 2 | `generateId: false` → id v7 | ✅ id dạng `…-7…` | runtime |
| 3 | `user.create.before` chạy trước insert, sửa được `username`/`image` | ✅ nhận đủ key (`name`, `image`, `username`, `role`, `status`…); merge `{...data, ...result.data}` nên muốn bỏ field thì đặt `null`, không xoá key được | runtime + `db/with-hooks.mjs` |
| 4 | `user.update.before` chặn `username`/`image` | ✅ nhưng **luôn có key `name`/`image` với giá trị `undefined`** → phải kiểm `!== undefined`, không dùng `in`. Hook cũng chạy cho update nội bộ (`emailVerified` khi xác thực) | runtime |
| 5 | `session.create.before` chạy ở OAuth callback | ✅ (đọc source) `oauth2/link-account.mjs` → `internalAdapter.createSession` → `createWithHooks('session')`. User Google tạo qua `createWithHooks('user')` nên hook create cũng chạy | source |
| 6 | `hooks.before` đọc session để chặn user bị ban | ✅ `getSessionFromCtx(ctx)` trả user kèm `status`; `update-user` của user bị ban → 403 | runtime |
| 7 | `revokeSessionsOnPasswordReset`, callback sau reset | ✅ tên đúng `onPasswordReset({ user })`; session bị xoá, `emailVerified=true` | runtime + `api/routes/password.mjs` |
| 8 | `accountLinking.requireLocalEmailVerified` mặc định `true` | ✅ `?? true` | `oauth2/link-account.mjs:138` |
| 9 | `onAPIError` map `23505` username | ❌ sign-up bọc lỗi DB không phải `APIError` thành `422 FAILED_TO_CREATE_USER` trước khi tới `onAPIError`. **Chấp nhận** lỗi chung cho ca đua hiếm (hook đã kiểm trùng trước) | runtime |
| 10 | `hashPassword` của `better-auth/crypto` đăng nhập được | ✅ | runtime |
| 11 | Paraglide compile offline, plugin npm local | ✅ với `modules: ["./node_modules/@inlang/plugin-message-format/dist/index.js"]` (đường dẫn tính từ thư mục chứa `project.inlang`). Chặn mạng bằng proxy giả vẫn compile được. **Lưu ý:** plugin nạp lỗi thì CLI vẫn báo thành công → typecheck là lớp bắt lỗi (key thiếu = lỗi type) | runtime |

## Phát hiện thêm (điều chỉnh khi code, không đổi thiết kế)

- **Origin check bị tắt khi `NODE_ENV=test`** (`skipOriginCheck = isTest()` trong `context/create-context.mjs`). Đặt tường minh `advanced.disableOriginCheck: false` để test chạy giống production. Origin chỉ bị kiểm khi request có cookie hoặc có header Origin/Referer/Sec-Fetch.
- `auth.api.getSession()` cũng đi qua `hooks.before` → user bị ban làm nó throw `APIError` 403. `sessionMiddleware` bắt lỗi và coi là khách (vẫn kiểm `isBanned` thêm một lớp).
- Field `input: false` có `defaultValue`: khi tạo bị thay thầm bằng default (không lỗi); khi update → 400 `FIELD_NOT_ALLOWED`.
- Better Auth log lỗi DB **kèm câu SQL và params** (email, có thể cả hash mật khẩu nếu insert account lỗi). Dùng `logger.log` tuỳ biến, lỗi chỉ in message gốc qua `describeDbError` (giống CLI phase 3).
- Sign-up email đã tồn tại → `422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (lộ việc email đã đăng ký; plan đã chấp nhận).
- `pnpm install` thoát mã 1 (`ERR_PNPM_IGNORED_BUILDS` cho `esbuild`, kéo vào bởi `tsx`/`drizzle-kit` từ phase 3). esbuild vẫn chạy (binary qua optional deps). Ảnh hưởng `postinstall` → cần user quyết.

## Kết luận

Mọi giả định thiết kế đứng vững, trừ #9 (đã có phương án dự phòng trong plan). Không cần sửa plan; chỉ thêm 3 chi tiết triển khai ở trên.

## Bổ sung sau code review

- `getSessionFromCtx` trong `hooks.before` mặc định **gia hạn session trong DB** nhưng không gửi được cookie → endpoint chính thấy session còn mới, không set cookie → cookie browser hết hạn sau 7 ngày. Sửa: `getSessionFromCtx(ctx, { disableRefresh: true })`; `/api/v1` dùng `auth.api.getSession({ headers, returnHeaders: true })` và chuyển `Set-Cookie` vào response. Có test gia hạn cho cả `/api/v1/me` và `/api/auth/get-session`.
- `verify-email` của Better Auth 1.7.7 **không** gọi `revokeUnprovenAccountAccess` (chỉ magic link / email OTP). Dùng `emailVerification.beforeEmailVerification` (chỉ chạy ở lần xác thực đầu, trước auto sign-in) để xoá session + account cũ.
