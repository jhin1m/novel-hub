---
title: "Phase 5: Better Auth và middleware phân quyền"
status: done
priority: P1
effort: "2.5d"
dependencies: [4]
---

# Phase 5: Better Auth và middleware phân quyền

Spec checkbox: `Better Auth: đăng ký, đăng nhập, OAuth Google, phiên, middleware phân quyền.`

## Context Links

- Spec mục 2 (Better Auth, nodemailer, Paraglide), 4 (`users`, avatar), 7 (vai trò, muted/banned), 8 (i18n), 9 (policies, Zod cho input ngoài)
- `plans/reports/researcher-261004-1954-drizzle-better-auth-report.md`
- Quyết định của user:
  - Cho đăng nhập khi chưa xác thực email; chặn thao tác ghi bằng policy.
  - Trang auth tối giản, chuỗi qua Paraglide.
  - **Có reset mật khẩu** để chủ email thật lấy lại được tài khoản bị chiếm trước.
  - **Rate limit để Giai đoạn 1** (đã có checkbox riêng).
  - Username user Google: tự sinh, luôn kèm hậu tố, không có bước chọn username (validate 2026-10-04). <!-- Updated: Validation Session 1 - username Google -->
  - Chưa có Google OAuth client: phase 5 không thử tay luồng Google. <!-- Updated: Validation Session 1 - Google credential -->

## Overview

- `packages/auth`: Better Auth 1.7.7 chạy trên các bảng của phase 3, gắn vào Hono tại `/api/auth/*`.
- `packages/api`: middleware phiên, phân quyền và CSRF; quyết định quyền nằm ở `core/policies`; thêm route `/api/v1/me`.
- Hai cổng gửi mail (xác thực email, reset mật khẩu) dạng fire-and-forget. Phase 5 gửi thẳng qua mailer, phase 6 chuyển sang queue.
- Trang tối giản: đăng ký, đăng nhập, quên mật khẩu, đặt lại mật khẩu, trạng thái ở `/` (có nút gửi lại mail xác thực).
- Paraglide: một locale; CLI là nơi duy nhất ghi output.
- E2E Playwright chạy cô lập với môi trường dev.

## Key Insights

- `@better-auth/cli` đã deprecated. Dùng `npx auth@1.7.7 generate` **ghim version, chạy trong shell không nạp `.env`**, xuất vào thư mục tạm, **chỉ để diff** với `schema/auth.ts`. <!-- Red Team: supply chain -->
- `drizzleAdapter(db, { provider: 'pg', schema, usePlural: true })`. `advanced.database.generateId: false` → id do DB sinh bằng `uuidv7()`.
- `user.fields: { name: 'displayName', image: 'avatarUrl' }` **chỉ đổi tên cột**. Body HTTP và object session vẫn dùng `name`/`image`. Form đăng ký gửi `name`; `/api/v1/me` map sang `displayName`. <!-- Red Team: BA field contract -->
- `additionalFields`: `username` (`input: true`, `required: false`); `role`, `status` (`input: false`, chống leo thang quyền).
- Hook `user.create.before` và `user.update.before` là cổng Zod cho mọi input user đi qua Better Auth: <!-- Red Team: unvalidated BA user fields -->
  - `name`: trim, độ dài 1–50 (`displayNameSchema`).
  - `image`: **luôn bị loại bỏ** (kể cả ảnh Google). Avatar chỉ đến từ route upload S3 ở Giai đoạn 1, theo spec mục 4.
  - `username` khi tạo:
    - có gửi → kiểm `usernameSchema`;
    - không gửi (Google, hoặc API không gửi) → sinh từ phần trước `@` của email, **luôn kèm hậu tố ngẫu nhiên 4 ký tự** để khả năng trùng gần như bằng 0.
  - `username` khi cập nhật → từ chối (`USERNAME_IMMUTABLE`).
- Ban:
  - `session.create.before` từ chối user có `status = 'banned'`.
  - `hooks.before` (`createAuthMiddleware`) từ chối **mọi** endpoint `/api/auth/*` có session thuộc user bị ban, trừ `sign-out`.
  - Middleware `/v1` coi user bị ban là khách.
  - `session.cookieCache` **tắt**.
  - Bất biến "ban ⇒ xoá mọi session" ghi trong `core/policies`; triển khai `banUser()` cùng công cụ mod ở Giai đoạn 1. <!-- Red Team: ban bypass -->
- Better Auth 1.7.7 mặc định `accountLinking.requireLocalEmailVerified: true`, nên Google không tự liên kết vào tài khoản local chưa xác thực (chống chiếm tài khoản). Còn lại nguy cơ chủ thật bị khoá ngoài → giải bằng **reset mật khẩu**: reset xong thì thu hồi mọi session và đặt `emailVerified = true` (reset chứng minh sở hữu email). Spike kiểm chứng cả hai điểm. <!-- Red Team: email squatting -->
- Better Auth **chờ** callback gửi mail xong mới trả về (`runInBackgroundOrAwait`), nên cổng mail phải fire-and-forget: `void withTimeout(send(...), 1000).catch(log)`. <!-- Red Team: mail path hang -->
- Lỗi unique `23505` trên username lúc insert (hai request đồng thời) → spike kiểm xem `onAPIError` có map được sang `USERNAME_TAKEN` không. Nếu không, chấp nhận lỗi chung cho trường hợp đua hiếm này và ghi vào báo cáo.
- Paraglide:
  - Project inlang đặt ở `packages/shared`; **chỉ CLI `i18n:compile` ghi** `packages/shared/src/paraglide/`; không dùng Vite plugin.
  - Chạy ở root `postinstall` nên mọi lệnh (lint, test, worker) đều có sẵn output.
  - Plugin inlang phải nạp từ **gói npm local, không tải CDN lúc compile**. Không làm được thì dừng và hỏi user. <!-- Red Team: Paraglide generation -->
- CSRF: `hono/csrf({ origin: appUrl })` cho `/v1/*`. `trustedOrigins` của Better Auth chỉ bảo vệ `/api/auth/*`.

## Requirements

- Functional:
  - `POST /api/auth/sign-up/email` nhận `{ name, username, email, password }` → user `reader`/`active`, mail xác thực được gửi (dev: link in ra log).
  - `POST /api/auth/sign-in/email` → cookie phiên, kể cả khi chưa xác thực email.
  - Google OAuth bật khi có cả `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`; callback `{BETTER_AUTH_URL}/api/auth/callback/google`.
  - Link xác thực → `emailVerified = true` và chuyển về `/`. Ở `/`, user chưa xác thực có nút "gửi lại mail xác thực".
  - Quên mật khẩu → mail reset → đặt lại → mọi session cũ bị thu hồi, `emailVerified = true`.
  - User bị ban: không đăng nhập được (403), session cũ không dùng được ở cả `/api/auth/*` lẫn `/api/v1/*`.
  - Username không đổi được. `image` từ client bị bỏ qua. `name` được validate.
  - Middleware (quyết định qua `core/policies`):
    - `sessionMiddleware`;
    - `requireAuth` → 401 `UNAUTHENTICATED`;
    - `requireRole(...roles)` → 403 `FORBIDDEN`;
    - `requireVerifiedEmail` → 403 `EMAIL_NOT_VERIFIED`;
    - `csrf` cho request không phải GET trên `/v1/*`.
  - `GET /api/v1/me` → `{ user: { username, displayName, avatarUrl, role, status, emailVerified } }`, không trả id. Trang `/` gọi route này qua `createApiClient` + TanStack Query.
  - Seed tạo account mật khẩu (`providerId: 'credential'`) cho user mẫu, mật khẩu lấy từ `SEED_USER_PASSWORD`.
- Non-functional:
  - Không lộ id nội bộ.
  - Lỗi `/api/v1` theo shape thống nhất; `/api/auth/*` theo shape của Better Auth (ngoài contract v1, ghi chú trong code).
  - Production thiếu SMTP → khởi động thất bại, không ghi link chứa token ra log.

## Architecture

```
packages/shared  schemas/user.ts      usernameSchema (3–30, ^[a-z0-9_]+$, RESERVED_USERNAMES), displayNameSchema (trim, 1–50)
                 env.ts               + authEnvSchema (BETTER_AUTH_SECRET ≥32, BETTER_AUTH_URL, GOOGLE_* cả hai hoặc không)
                                      + smtpEnvSchema (SMTP_*) ; requireSmtpInProduction(schema) (superRefine)
                 project.inlang/, messages/vi.json → (CLI) src/paraglide/ ; export "./messages"
packages/core    policies/user.ts     PolicyUser, hasAnyRole, isEmailVerified, isBanned (+ ghi chú bất biến ban ⇒ xoá session)
                 users/username.ts    generateUsername(email, random?) (luôn có hậu tố), isUsernameTaken(db, u)
                 mail/mailer.ts       createMailer(cfg: { mode: 'smtp' | 'log'; host?; port?; user?; pass?; from? })
                 mail/auth-emails.ts  buildAuthEmail({ kind: 'verify' | 'reset', displayName, url }) — chuỗi lấy từ Paraglide
                 mail/ports.ts        type AuthMailPort = (msg: { kind; to; displayName; url }) => Promise<void>
packages/auth    auth.ts              createAuth({ db, env, sendAuthEmail: AuthMailPort })
                 hooks.ts             userCreateBefore(db), userUpdateBefore, sessionCreateBefore(db), bannedGuard (hooks.before)
                 scripts/seed.ts      CLI seed: assertSeedAllowed → seedDatabase(db, { hashPassword, password }) — thay CLI của phase 3
packages/api     app.ts               .on(['GET','POST'], '/auth/*', c => deps.auth.handler(c.req.raw)) TRƯỚC /v1
                 middleware/{session,require-auth,require-role,require-verified-email,csrf}.ts
                 routes/me.ts
apps/web         lib/auth-client.ts   createAuthClient({ plugins: [inferAdditionalFields<Auth>()] })
                 routes/{dang-ky,dang-nhap,quen-mat-khau,dat-lai-mat-khau,index}.tsx
                 routes/__root.tsx    + QueryClientProvider
                 server/api-app.ts    + auth, mailer; sendAuthEmail = fire-and-forget (withTimeout 1s, log lỗi)
                 playwright.config.ts, e2e/{global-setup,auth.spec}.ts
```

Hướng phụ thuộc: `api → auth → core → db → shared`. Không có vòng.

```ts
// phác thảo cấu hình
betterAuth({
  baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET, basePath: '/api/auth',
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, { provider: 'pg', schema: { users, sessions, accounts, verifications }, usePlural: true }),
  advanced: { database: { generateId: false } },
  user: { fields: { name: 'displayName', image: 'avatarUrl' }, additionalFields: { username, role, status } },
  emailAndPassword: {
    enabled: true, requireEmailVerification: false, minPasswordLength: 8,
    sendResetPassword: ({ user, url }) => sendAuthEmail({ kind: 'reset', to: user.email, displayName: user.name, url }),
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: ({ user }) => markEmailVerified(db, user.id),     // spike kiểm chứng tên option
  },
  emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) => sendAuthEmail({ kind: 'verify', to: user.email, displayName: user.name, url }) },
  socialProviders: google ? { google: { clientId, clientSecret } } : {},
  databaseHooks: { user: { create: { before }, update: { before } }, session: { create: { before } } },
  hooks: { before: bannedGuard },
  // không cấu hình rateLimit: Giai đoạn 1 làm rate limit Redis (checkbox riêng)
});
```

Lỗi từ hook: `throw new APIError('BAD_REQUEST', { code: 'USERNAME_TAKEN' | 'USERNAME_INVALID' | 'USERNAME_IMMUTABLE' | 'DISPLAY_NAME_INVALID' })`, `APIError('FORBIDDEN', { code: 'ACCOUNT_BANNED' })`.

E2E cô lập: <!-- Red Team: E2E isolation -->
- `playwright.config.ts` gọi `process.loadEnvFile()` và assert có `TEST_DATABASE_URL`, `TEST_REDIS_URL`.
- `webServer` chạy dev trên **port 3100**, `reuseExistingServer: false`, env ghi đè:
  - `DATABASE_URL=TEST_DATABASE_URL`, `REDIS_URL=TEST_REDIS_URL`;
  - `SMTP_HOST=''`, `APP_URL`/`BETTER_AUTH_URL=http://localhost:3100`;
  - `QUEUE_PREFIX=e2e`.
- `globalSetup` chạy `runMigrations` + `truncateAll` trên DB test.
- Email và username trong test có hậu tố riêng mỗi lần chạy.

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/user.ts` (+ test) | create | |
| `packages/shared/src/env.ts` (+ test) | modify | `authEnvSchema`, `smtpEnvSchema`, `requireSmtpInProduction` |
| `packages/shared/project.inlang/settings.json`, `packages/shared/messages/vi.json` | create | plugin inlang từ npm local |
| `packages/shared/package.json` | modify | script `i18n:compile`, export `./messages`; dev dep `@inlang/paraglide-js@2.25.4` + plugin message-format |
| `packages/core/src/policies/user.ts` (+ test) | create | |
| `packages/core/src/users/username.ts` (+ test) | create | |
| `packages/core/src/mail/{mailer,auth-emails,ports}.ts` (+ test) | create | dep `nodemailer` |
| `packages/auth/**` | create | `@novel-hub/auth`; dep `better-auth@1.7.7` (thêm `@better-auth/drizzle-adapter` nếu tách gói; kiểm chứng) |
| `packages/auth/src/auth.int.test.ts` | create | luồng qua `createApp(...).request` |
| `packages/api/src/app.ts`, `index.ts` | modify | `ApiDeps.auth`, `ApiDeps.appUrl`; mount auth; `session` + `csrf` trên `/v1/*` |
| `packages/api/src/middleware/*.ts` (+ test), `routes/me.ts` | create | |
| `packages/db/src/seed/cli.ts` | delete | thay bằng `packages/auth/src/scripts/seed.ts` |
| `packages/db/src/schema/auth.ts` + migration `0001_*` | modify/create | **chỉ khi** diff hoặc runtime check báo lệch |
| `apps/web/src/server/api-app.ts` | modify | auth, mailer, cổng mail fire-and-forget |
| `apps/web/src/lib/auth-client.ts` | create | |
| `apps/web/src/routes/*.tsx` (5 trang), `__root.tsx` | create/modify | form HTML thuần; `@tanstack/react-query@5.104.1` |
| `apps/web/playwright.config.ts`, `apps/web/e2e/*` | create | `@playwright/test` |
| `package.json` (root) | modify | `postinstall: pnpm --filter @novel-hub/shared i18n:compile`; `i18n:compile`; `db:seed` → CLI mới; `test:e2e` |
| `.gitignore`, `eslint.config.js`, `.prettierignore` | verify | đã ignore `packages/shared/src/paraglide` từ phase 1 |

## Implementation Steps

1. **Spike (tối đa khoảng 3h, làm trước code chính)** với DB test. Kết quả ghi vào `plans/261004-1255-giai-doan-0-nen-mong/reports/better-auth-spike-report.md`. Giả định nào sai thì **dừng, báo user, sửa plan** trước khi làm tiếp. Các điểm cần kiểm:
   - `npx auth@1.7.7 generate` (không nạp `.env`) → diff cột.
   - `generateId: false` cho id v7.
   - `user.create.before` chạy trước khi validate field bắt buộc, và sửa hoặc xoá được `username`/`image`/`name`.
   - `user.update.before` chặn được `username`/`image`.
   - `session.create.before` chạy ở luồng OAuth callback (đọc source nếu không test được Google).
   - `hooks.before` đọc được session để chặn user bị ban.
   - `revokeSessionsOnPasswordReset` và tên callback sau khi reset.
   - `accountLinking.requireLocalEmailVerified` mặc định `true`.
   - `onAPIError` map được `23505` không.
   - `hashPassword` của `better-auth/crypto` đăng nhập được.
   - Paraglide compile offline với plugin npm local.
2. Diff có cột thiếu thì sửa schema và sinh `0001_*`.
3. `shared`: schema user, env auth/smtp + refine production, Paraglide (khoá cho form, lỗi, 2 email), chạy `pnpm install` để `postinstall` compile.
4. `core`: policies, username, mailer (`mode: 'log'` → `console.info` chỉ in URL; **throw nếu `NODE_ENV=production`**), `buildAuthEmail`.
5. `auth`: `createAuth`, hooks, `bannedGuard`, `scripts/seed.ts`.
6. `api`: mount auth, middleware (gồm `csrf`), `/api/v1/me`. Test `requireRole`/`requireVerifiedEmail` bằng app Hono dựng riêng trong test.
7. Web: auth client, QueryClientProvider, 5 trang; `/` gọi `/api/v1/me` qua `createApiClient`; nút gửi lại mail xác thực gọi `authClient.sendVerificationEmail({ email, callbackURL: '/' })`.
8. Chạy lại kiểm tra bundle bằng sourcemap của phase 4, lần này `createApiClient` đã có consumer thật.
9. Chạy test int + e2e. Kiểm tay:
   - đăng ký, copy link xác thực từ log;
   - quên mật khẩu → link reset trong log → đặt lại;
   - Google: user chưa có credential (validate 2026-10-04) → ghi "chưa thử Google bằng tay" trong báo cáo, không ghi là đã kiểm. Điểm `session.create.before` chạy ở OAuth callback kiểm bằng đọc source ở spike.
10. Gate 4 lệnh + `pnpm test:e2e`. Đánh `[x]` checkbox 5.

## Function / Interface Checklist

- [x] `usernameSchema`, `displayNameSchema`, `RESERVED_USERNAMES`
- [x] `authEnvSchema`, `smtpEnvSchema`, `requireSmtpInProduction`
- [x] `PolicyUser`; `hasAnyRole`, `isEmailVerified`, `isBanned`
- [x] `generateUsername(email, random?)`, `isUsernameTaken(db, username)`
- [x] `createMailer(cfg): Mailer`; `buildAuthEmail({ kind, displayName, url })`; `type AuthMailPort`
- [x] `createAuth({ db, env, sendAuthEmail }): Auth`; `type Auth`, `type SessionUser`
- [x] hooks: `createUserCreateBefore(db)`, `userUpdateBefore`, `createSessionCreateBefore(db)`, `bannedGuard`
- [x] `sessionMiddleware(auth)`, `requireAuth`, `requireRole(...roles)`, `requireVerifiedEmail`, `csrf(appUrl)`
- [x] `ApiDeps.auth`, `ApiDeps.appUrl`; `GET /api/v1/me`
- [x] web: `authClient`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Đăng ký `{ name, username, email, password }` → user `reader`/`active`, `emailVerified=false`, id v7; cổng mail nhận `kind: 'verify'` + URL | int |
| Critical | Body có `role: 'admin'`, `status`, `image` → role/status mặc định, `avatarUrl` null | int |
| Critical | Username sai → 400 `USERNAME_INVALID`; trùng → 400 `USERNAME_TAKEN`; `name` rỗng hoặc 200 ký tự → 400 | int |
| High | Đăng ký không gửi username → username sinh ra có hậu tố, khớp schema | int |
| High | `generateUsername` với email có dấu hoặc ký tự lạ, local part dài → hợp lệ, ≤ 30 ký tự | unit |
| Critical | `update-user` gửi `username` hoặc `image` → bị từ chối, DB không đổi; `name` hợp lệ → đổi được | int |
| Critical | Đăng nhập khi chưa xác thực → thành công | int |
| Critical | User bị ban: đăng nhập → 403; session cũ gọi `POST /api/auth/update-user` → 403; gọi `/api/v1/me` → 401 | int |
| Critical | `/api/v1/me` không cookie → 401; có cookie → 200, không có `id` | int |
| Critical | Reset mật khẩu: request → cổng mail `kind: 'reset'` → reset bằng token → session cũ bị thu hồi, mật khẩu mới dùng được, `emailVerified=true` | int |
| High | Chiếm email: A đăng ký email X không xác thực → chủ X reset mật khẩu → A mất quyền truy cập | int |
| High | Cổng mail treo hoặc lỗi → đăng ký vẫn trả về trong dưới 1.5s | int (cổng giả treo) |
| High | `requireRole('mod','admin')`: reader 403, mod 200; `requireVerifiedEmail`: chưa xác thực 403 | unit |
| High | POST dạng form vào `/v1/*` với Origin lạ → 403 | unit |
| High | Gọi URL xác thực → `emailVerified=true` | int |
| High | User seed đăng nhập bằng `SEED_USER_PASSWORD` | int |
| Medium | `authEnvSchema`: chỉ có `GOOGLE_CLIENT_ID` → lỗi. `requireSmtpInProduction`: production thiếu `SMTP_HOST` → lỗi | unit |
| Medium | Mailer `mode: 'log'` khi `NODE_ENV=production` → throw | unit |
| Critical | E2E: `/dang-ky` → `/` thấy trạng thái đăng nhập + nút gửi lại → đăng xuất → `/dang-nhap` → đăng nhập lại | Playwright |
| High | Google OAuth | thủ công — hoãn: user chưa có credential; ghi rõ trong báo cáo |

## Dependency Map

- Cần phase 4 (`createApp`, error contract, `createApiClient`), phase 3 (bảng auth, `seedDatabase`, `truncateAll`), phase 2 (env).
- Phase 6: `sendAuthEmail` chuyển từ gọi mailer sang enqueue job; dùng `smtpEnvSchema` và `buildAuthEmail` trong worker.
- Giai đoạn 1: `requireVerifiedEmail` cho tạo truyện/chương; `banUser()` + công cụ mod; rate limit Redis; upload avatar.

## Success Criteria

- [x] Có spike report; mọi giả định đã được xác nhận hoặc plan đã điều chỉnh
- [x] Test matrix (trừ Google) xanh; `pnpm test:e2e` xanh; chạy lại 2 lần liên tiếp vẫn xanh
- [x] Kiểm tay: xác thực email và reset mật khẩu bằng link trong log
- [x] Báo cáo ghi rõ chưa thử Google bằng tay (thiếu credential); ràng buộc `GOOGLE_*` trong `authEnvSchema` có test unit
- [x] Bundle client sạch (kiểm bằng sourcemap)
- [x] Gate 4 lệnh xanh; checkbox 5 = `[x]`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Hook hoặc option không như giả định | Spike ở bước 1; dừng và hỏi user trước khi đổi thiết kế |
| Paraglide cần mạng lúc compile | Bắt buộc dùng plugin npm local; không được thì hỏi user |
| Lỗi `/api/auth/*` khác shape `/api/v1` | Chấp nhận: nằm ngoài contract v1; client dùng `better-auth/react` |
| Session middleware truy vấn DB mỗi request | Chấp nhận ở Giai đoạn 0; đo lại khi có traffic |
| Chưa có rate limit cho auth | Giai đoạn 0 chưa public; Giai đoạn 1 có checkbox rate limit Redis |
| Lộ việc email đã đăng ký (sign-up trả lỗi "đã tồn tại") | Chấp nhận (phổ biến). Ghi lại; xem lại khi làm rate limit |

## Security Considerations

- `role`/`status` có `input: false`; username bất biến; `image` từ client luôn bị loại bỏ; `name` validate bằng Zod.
- Ban chặn tạo phiên, chặn mọi endpoint `/api/auth/*` và `/api/v1/*`; không dùng cookie cache.
- Reset mật khẩu thu hồi mọi session; Google không tự liên kết vào tài khoản local chưa xác thực.
- `BETTER_AUTH_SECRET` ≥ 32 ký tự, chỉ nằm trong `.env`. `trustedOrigins` + `hono/csrf` chống CSRF.
- Production bắt buộc có SMTP; mailer log chỉ dùng ở dev/test.
- Mật khẩu seed chỉ lấy từ env; guard seed chỉ cho chạy với DB local.

## Kết quả (2026-10-04)

- Gate: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` xanh; `pnpm test` 102, `pnpm test:int` 66, `pnpm test:e2e` 2 (chạy 3 lần liên tiếp đều xanh).
- Kiểm tay trên dev (`pnpm dev`, link trong log `[mail:dev]`): seed đăng nhập bằng `SEED_USER_PASSWORD`; user seed bị ban → 403; đăng ký → link xác thực → `emailVerified=true`; quên mật khẩu → link → `/dat-lai-mat-khau` → đặt lại; session cũ 401, mật khẩu cũ 401, mật khẩu mới 200.
- **Google OAuth chưa thử bằng tay** (chưa có credential). Đã kiểm: cấu hình `sign-in/social` trả URL Google đúng `redirect_uri`; hook tạo user từ hồ sơ OAuth (bỏ ảnh, chuẩn hoá tên, tự sinh username); `authEnvSchema` + `requireGooglePair` có test unit.
- Bundle client (sourcemap): 0 nguồn từ `packages/core|db|auth`, `pg`, `ioredis`, `nodemailer`, `drizzle-orm`, phần server của Better Auth.
- Lệch so với plan (có lý do):
  - Cổng mail bọc fire-and-forget ngay trong `createAuth` (không phải ở `api-app.ts`) để test được với cổng treo; timeout ghi log 15s thay vì 1s vì request đã không chờ mail.
  - `ApiDeps.auth` là cổng hẹp `{ handler, lookupSession }`; `api` không phụ thuộc `better-auth`. `lookupSession` trả kèm `Set-Cookie` để gia hạn cookie phiên.
  - Session middleware chỉ gắn vào route cần user (`/me`), health không tra phiên.
  - Thêm `requireGooglePair`, `mailerConfigFromEnv`, `revokeUnprovenAccess`, `markEmailVerified`, subpath `@novel-hub/db/seed`; CLI seed chuyển sang `packages/auth/src/scripts/seed.ts`.
  - `pnpm-workspace.yaml`: `allowBuilds: { esbuild: false }` (user duyệt) để `pnpm install` thoát 0 và `postinstall` chạy.
- Sau code review: sửa cookie phiên không được gia hạn (guard dùng `disableRefresh`, `/api/v1` chuyển `Set-Cookie`); health không lỗi 500 khi có cookie mà DB sập; **xác thực email lần đầu xoá mọi session và mật khẩu cũ** (user chọn, chống chiếm tài khoản trước qua link xác thực; mail xác thực ghi rõ hệ quả); form quên mật khẩu dùng `method="post"`.
- Chấp nhận, chưa sửa: tên hiển thị lúc đăng ký đi vào nội dung mail (text thuần, xem lại khi có rate limit); `/api/auth/*` trả id của chính user (contract của Better Auth, ngoài `/api/v1`); mỗi request có cookie tra phiên hai lần.
- Reports: `reports/better-auth-spike-report.md`, `../reports/tester-261004-2258-phase-05-better-auth-report.md`, `../reports/code-reviewer-261004-2258-phase-05-better-auth-review-report.md`.

## Next Steps

Phase 6: worker BullMQ, chuyển hai loại mail auth sang hàng đợi.
