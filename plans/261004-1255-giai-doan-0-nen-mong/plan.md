---
title: "Giai đoạn 0: Nền móng"
description: "Dựng monorepo TypeScript, hạ tầng dev, schema DB, Hono API, Better Auth và worker BullMQ theo mục 5 Giai đoạn 0 của spec."
status: completed
priority: P1
effort: 7.5d
branch: main
tags: [infra, backend, database, api, auth]
blockedBy: []
blocks: []
created: 2026-10-04
---

# Giai đoạn 0: Nền móng

## Overview

Repo đang trống. Spec `docs/project-spec.md` là nguồn chuẩn. Mỗi checkbox Giai đoạn 0 tương ứng một phase, làm tuần tự, mỗi lần `/ak:cook` đúng một phase. Xong phase nào thì đánh `[x]` checkbox tương ứng trong spec mục 5.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Workspace pnpm có `pnpm typecheck`, `pnpm lint`, `pnpm test` xanh từ phase 1 | P1 |
| 2 | Hạ tầng dev chạy bằng một lệnh (`pnpm infra:up`), `.env.example` đủ biến | P1 |
| 3 | Schema đủ bảng mục 4 + bảng auth, migration đầu tiên, seed mẫu | P1 |
| 4 | `/api/v1/health` qua Hono mount ở `/api/$`, client `hc` có type | P1 |
| 5 | Đăng ký/đăng nhập email + Google, reset mật khẩu, phiên, middleware phân quyền | P1 |
| 6 | Worker BullMQ chạy job thật (mail xác thực và mail reset mật khẩu) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Monorepo, TypeScript, ESLint, Prettier, Vitest](./phase-01-start.md) | Completed |
| 2 | [Docker Compose và .env.example](./phase-02-docker-compose-env.md) | Completed |
| 3 | [Drizzle schema, migration, seed](./phase-03-drizzle-schema-migration-seed.md) | Completed |
| 4 | [Hono mount, client hc, /api/v1/health](./phase-04-hono-api-health.md) | Completed |
| 5 | [Better Auth và middleware phân quyền](./phase-05-better-auth.md) | Completed |
| 6 | [Worker BullMQ và job mẫu](./phase-06-bullmq-worker.md) | Completed |

Phụ thuộc tuyến tính: 1 → 2 → 3 → 4 → 5 → 6.

## Quyết định đã chốt (user, 2026-10-04)

- **S3/MinIO:**
  - `docker-compose.yml` không có MinIO.
  - Dev và production dùng server MinIO có sẵn của user; dev dùng bucket riêng. User cung cấp thông tin khi Giai đoạn 1 cần.
  - Server MinIO đã có script backup file hằng ngày.
  - Spec sửa ở phase 2.
- **Xác thực email:** cho đăng nhập khi chưa xác thực; chặn đăng truyện/chương/bình luận bằng `core/policies`.
- **Reset mật khẩu:** làm ở phase 5. Reset xong thì thu hồi session và đánh dấu email đã xác thực (chống việc người khác đăng ký trước email của mình).
- **Rate limit:** để Giai đoạn 1. Phase 2 thêm checkbox "Rate limit Redis theo user và IP" vào spec.
- **Test gate:**
  - `pnpm test` = unit, không cần Docker.
  - `pnpm test:int` = Postgres/Redis thật, một project, một DB test, chạy tuần tự.
  - `pnpm test:e2e` = Playwright cô lập trên port 3100, DB và Redis test.
- **Auth UI:** trang tối giản, chuỗi qua Paraglide (chỉ locale `vi`).
- **Validate (2026-10-04):**
  - Duyệt toàn bộ dependency phụ trợ.
  - Cột ★ ngoài spec được giữ; phase 3 cập nhật bảng mục 4 của spec.
  - `ratings.score` thang 1–5.
  - Job mẫu phase 6 là mail auth thật.
  - Username của user Google tự sinh, luôn kèm hậu tố.
  - Chưa có Google OAuth client nên phase 5 chưa thử tay luồng Google.

## Quyết định kỹ thuật (từ research và red team)

- TypeScript `~6.0.3` (typescript-eslint chưa hỗ trợ TS 7). Node 24 LTS, pnpm 12.9.1.
- Package nội bộ dạng JIT (exports trỏ `./src/index.ts`, `sideEffects: false`); browser chỉ import `@novel-hub/api/client` (chỉ có type).
- Postgres 18 với `default uuidv7()`; Better Auth `generateId: false`.
- Drizzle 0.45.3 / drizzle-kit 0.31.11, driver `pg` có timeout; không dùng relations API; `pgEnum` chỉ cho tập giá trị spec đã cố định.
- Env tách thành các mảnh Zod (app, db, redis, queue, auth, smtp, test), mỗi consumer ghép mảnh mình cần; production bắt buộc có SMTP.
- Guard cho seed và truncate chỉ cho chạy khi đủ điều kiện an toàn (localhost + `NODE_ENV` tường minh; DB tên `_test`).
- Better Auth 1.7.7: `username` tự quản; `image` từ client luôn bị loại bỏ; user bị ban bị chặn ở mọi endpoint; không dùng plugin admin hay username.
- Gửi mail fire-and-forget có timeout; queue tạo sẵn khi dựng deps.
- Paraglide: CLI là nơi duy nhất ghi output, chạy ở `postinstall`, plugin npm local (không tải CDN).

## Dependency phụ trợ (ngoài bảng mục 2, user đã duyệt 2026-10-04)

`tsx`, `pg` + `@types/pg`, `ioredis` (peer bắt buộc của BullMQ 6), `typescript-eslint`, `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-config-prettier`, `prettier-plugin-tailwindcss`, `@tanstack/react-router`, `vite`, `@vitejs/plugin-react`, `nitro` (beta, ghim chính xác), `@playwright/test`, `@types/node`, `@types/nodemailer`, `@inlang/plugin-message-format`.

## Ngoài phạm vi Giai đoạn 0 (làm khi deploy production)

Container `web`/`worker` + healthcheck, role DB riêng cho app, mật khẩu Redis, `MEILI_ENV=production`, chỉ cho Cloudflare vào origin, chọn chạy `tsx` hay bundle cho worker ở production. Spec chưa có checkbox cho các việc này; user chưa chọn đưa vào Giai đoạn 1.

## Success Criteria

- [x] 6 checkbox Giai đoạn 0 trong spec được đánh `[x]`
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh sau phase 6
- [x] `pnpm db:migrate && pnpm db:seed` chạy được trên DB trống (kiểm ở phase 3)
- [x] `curl localhost:3000/api/v1/health` trả 200 ngay lần đầu; tắt Redis hoặc pause Postgres trả 503 (kiểm ở phase 4)
- [x] Đăng ký → link xác thực in ra log worker → đăng nhập → `/api/v1/me` trả user; quên mật khẩu chạy trọn luồng
- [x] Mục "Lệnh" trong `CLAUDE.md` được cập nhật

## Câu hỏi mở

Không còn. 4 câu cũ đã trả lời ở Validation Session 1.

## Research

- [TanStack Start + Hono](../reports/researcher-261004-1954-tanstack-start-hono-report.md)
- [Drizzle + Better Auth](../reports/researcher-261004-1954-drizzle-better-auth-report.md)
- [Infra, tooling, BullMQ](../reports/researcher-261004-1954-infra-tooling-bullmq-report.md)

## Red Team Review

### Session — 2026-10-04
**Findings:** 15 sau khi gộp (38 thô từ 4 reviewer). 13 Accept, 2 do user quyết (cả hai đã chốt), 1 Accept một phần.
**Severity:** 1 Critical, 11 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Integration test của nhiều package chạy song song trên cùng DB test, tên project Vitest không hợp lệ | Critical | Accept | Phase 1, 3 |
| 2 | E2E rò sang DB, Redis và worker của dev; không chạy lại được | High | Accept | Phase 2, 5, 6 |
| 3 | Guard seed/truncate mặc định cho chạy (thiếu `NODE_ENV` vẫn coi là dev) | High | Accept | Phase 2, 3 |
| 4 | User bị ban vẫn dùng session cũ gọi `/api/auth/*` | High | Accept | Phase 5 |
| 5 | `name`/`image` qua Better Auth không validate; body dùng `name` chứ không phải `displayName` | High | Accept | Phase 5 |
| 6 | Email bị đăng ký trước + không có reset mật khẩu → chủ thật bị khoá | High | User: thêm reset mật khẩu | Phase 5, 6 |
| 7 | Rate limit in-memory lệch spec, tin header IP giả được, làm vỡ test | High | User: để Giai đoạn 1 + thêm checkbox | Phase 2, 5 |
| 8 | Enqueue mail treo khi Redis chết, không có cách gửi lại | High | Accept | Phase 5, 6 |
| 9 | Client `hc` kéo `pg`/`ioredis` vào bundle browser; bước grep không phát hiện được | High | Accept | Phase 4, 5 |
| 10 | Singleton lazy: health đầu tiên luôn 503, HMR rò kết nối, pool không có timeout | High | Accept | Phase 3, 4 |
| 11 | Hợp đồng env vỡ (thiếu `workerEnvSchema`, Node không nội suy `${}`) | High | Accept | Phase 2, 5, 6 |
| 12 | Production thiếu SMTP → link có token bị ghi ra log | High | Accept | Phase 5, 6 |
| 13 | Paraglide: output bị gitignore mà nhiều lệnh không compile trước, hai nơi cùng ghi, tải CDN | Medium | Accept | Phase 5, 6 |
| 14 | Enum Postgres đặt quá sớm, seed quá to, `db` phụ thuộc `better-auth` | Medium | Accept | Phase 3, 5 |
| 15 | CSRF `/v1`, lỗi đua username `23505`, ghim `auth@1.7.7`, `MEILI_ENV`; role DB riêng / mật khẩu Redis ở dev | Medium | Accept một phần (phần dev → mục ngoài phạm vi) | Phase 1, 2, 3, 5 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-06
- Decision deltas checked: 15
- Stale references reconciled: `generateUniquePublicId`, `baseEnvSchema`, `onSendVerificationEmail`/`send-verification-email`, `countWords`, `LIMITS`, Paraglide Vite plugin, rate limit, `auth@latest`, câu hỏi backup MinIO
- Unresolved contradictions: 0

## Trạng thái và bước tiếp theo

- Đã xong: research, viết plan, red team + áp dụng, consistency sweep, validate (Session 1).
- Phase 1–6 xong (2026-10-04). Giai đoạn 0 hoàn tất.
- **Tiếp theo:** `/ak:plan --deep docs/project-spec.md` cho Giai đoạn 1.
- Nhắc trước khi mở public: backup Postgres ra ngoài VPS + thử restore (checkbox cuối Giai đoạn 1).

## Validation Log

### Session 1 — 2026-10-04
**Trigger:** `/ak:plan validate` trước khi cook phase 1; plan có 4 câu mở.
**Questions asked:** 6

#### Questions & Answers

1. **[Scope]** Bạn có duyệt danh sách dependency phụ trợ ngoài mục 2 của spec không? (tsx, pg, @types/pg, ioredis, typescript-eslint, @eslint/js, globals, eslint-plugin-react-hooks, eslint-config-prettier, prettier-plugin-tailwindcss, @tanstack/react-router, vite, @vitejs/plugin-react, nitro beta ghim chính xác, @playwright/test, @types/node, @types/nodemailer, @inlang/plugin-message-format)
   - Options: Duyệt toàn bộ | Duyệt, bỏ prettier-plugin-tailwindcss
   - **Answer:** Duyệt toàn bộ
   - **Rationale:** CLAUDE.md cấm thêm dependency ngoài mục 2 khi chưa được đồng ý, nên cook bị chặn từ phase 1 nếu chưa duyệt.
2. **[Architecture]** Phase 3 có các cột ngoài spec: users.email, users.email_verified, users.updated_at, 3 bảng auth (sessions, accounts, verifications), stories.updated_at, chapters.created_at. Xử lý thế nào?
   - Options: Đồng ý, cập nhật bảng mục 4 | Đồng ý, không sửa spec | Chỉ giữ cột auth bắt buộc
   - **Answer:** Đồng ý, cập nhật bảng mục 4
   - **Rationale:** Spec là nguồn chuẩn; schema lệch spec mà không ghi lại sẽ gây nhầm ở các giai đoạn sau.
3. **[Assumptions]** Thang điểm của ratings.score là gì? Phase 3 cần nó để đặt CHECK constraint.
   - Options: 1–5 sao nguyên | 1–10
   - **Answer:** 1–5 sao nguyên
   - **Rationale:** CHECK nằm trong migration `0000`; sau khi đã chạy thì đổi phải tạo migration mới.
4. **[Scope]** Job mẫu ở phase 6 nên là job gì?
   - Options: Gửi mail auth thật | Job ping đơn giản
   - **Answer:** Gửi mail auth thật
   - **Rationale:** Giữ đúng thiết kế phase 5–6 hiện tại; mail đi qua queue theo spec mục 3.
5. **[Tradeoffs]** Username không đổi được và nằm trong URL công khai /tac-gia/{username}. Hiện plan tự sinh username cho user Google từ email kèm hậu tố ngẫu nhiên (vd. ducanhfake_k3m9), và user sẽ giữ nó vĩnh viễn. Xử lý thế nào?
   - Options: Google lần đầu phải chọn | Tự sinh, luôn kèm hậu tố | Tự sinh, hậu tố chỉ khi trùng
   - **Answer:** Tự sinh, luôn kèm hậu tố
   - **Rationale:** Giữ đơn giản ở Giai đoạn 0. Đánh đổi: URL tác giả của user Google mang hậu tố ngẫu nhiên vĩnh viễn.
6. **[Risks]** Khi tới phase 5, bạn có Google OAuth client (ID + secret, callback http://localhost:3000/api/auth/callback/google) để thử tay không?
   - Options: Có, sẽ cung cấp | Chưa có
   - **Answer:** Chưa có
   - **Rationale:** Luồng Google chỉ kiểm qua cấu hình và đọc source; báo cáo phase 5 phải ghi rõ chưa thử tay.

#### Confirmed Decisions
- Dependency phụ trợ: duyệt toàn bộ — mở khoá cook.
- Cột ★: giữ, đồng bộ bảng mục 4 của spec ở phase 3.
- `ratings.score`: CHECK 1–5.
- Job mẫu phase 6: `send-auth-email` thật.
- Username Google: tự sinh + hậu tố (giữ plan).
- Google OAuth: chưa thử tay ở phase 5.

#### Action Items
- [x] Phase 3: CHECK `ratings.score BETWEEN 1 AND 5` + test; sửa bảng mục 4 của spec (step 10).
- [x] Phase 5: báo cáo ghi "chưa thử Google bằng tay".

#### Impact on Phases
- Phase 3: bảng `ratings`, File Inventory (thêm `docs/project-spec.md`), step 10 mới (sửa spec), test CHECK, Risk, Success Criteria.
- Phase 5: Context Links (2 quyết định), step 9, test matrix dòng Google, Success Criteria.
- Phase 1, 2, 4, 6: không đổi (câu 1 và 4 xác nhận thiết kế sẵn có).

### Verification Results
- Bỏ qua: plan đã có Red Team Review; không có tag `[UNVERIFIED]`; repo chưa có code (mọi file trong plan đều ở trạng thái create).
- Claims checked: 0 | Verified: 0 | Failed: 0 | Unverified: 0
- Tier: Full (6 phase), được miễn theo guard Red Team

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-06
- Decision deltas checked: 6
- Stale references reconciled: "Câu hỏi mở (hỏi ở bước validate)", "cần user duyệt" (dependency), "CHECK theo thang điểm user chốt ở validate", "hỏi xác nhận ở bước validate" (cột ★), "Google nếu user cung cấp credential"
- Unresolved contradictions: 0

<!-- slug: giai-doan-0-nen-mong -->
