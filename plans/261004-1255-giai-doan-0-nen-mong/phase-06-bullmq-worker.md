---
title: "Phase 6: Worker BullMQ và job mẫu"
status: completed
priority: P1
effort: "1d"
dependencies: [5]
---

# Phase 6: Worker BullMQ và job mẫu

Spec checkbox: `Worker BullMQ chạy được một job mẫu.`

## Context Links

- Spec mục 3 (worker là process riêng, việc chậm đi qua hàng đợi), 9, 11 (log ra stdout)
- `plans/reports/researcher-261004-1954-infra-tooling-bullmq-report.md` (mục BullMQ)

## Overview

- `apps/worker` chạy BullMQ 6 bằng `tsx`.
- Job đầu tiên là **job thật** `send-auth-email`, gửi mail xác thực và mail reset mật khẩu. Cổng `sendAuthEmail` của phase 5 chuyển từ gọi mailer trực tiếp sang enqueue.
- Hợp đồng hàng đợi (tên queue, tên job, Zod payload) nằm ở `packages/shared`; kết nối và producer nằm ở `packages/core`.
- Cập nhật mục "Lệnh" trong `CLAUDE.md`.

## Key Insights

- BullMQ 6 khai báo `ioredis` là optional peer, nên phải cài tường minh (đã có `ioredis@^5` từ phase 4; smoke-test ở bước 1).
- Kết nối worker cần `maxRetriesPerRequest: null`.
- Kết nối producer phía web:
  - `Queue` **chờ `ready` vô hạn** khi Redis chết lúc khởi tạo (red team đã đọc source BullMQ 6.3.11).
  - Better Auth `await` callback gửi mail.
  - Vì vậy: tạo `Queue` **ngay khi dựng deps** (`getApiApp`), và mỗi lần enqueue là fire-and-forget bọc `withTimeout(…, 1000)` + log lỗi. <!-- Red Team: mail path hang -->
  - Đã có từ phase 5: `createAuth` tự gọi `sendAuthEmail` kiểu fire-and-forget, bọc `withTimeout(…, mailTimeoutMs)` + log lỗi. Phase 6 chỉ cần `sendAuthEmail = (m) => enqueueAuthEmail(mailQueue, m)` và truyền `mailTimeoutMs: 1000` vào `createAuth`, không bọc thêm lần nữa. <!-- Updated: phase 5 cook -->
- Mất một mail (Redis chết) thì có đường phục hồi: nút "gửi lại mail xác thực" ở `/` và trang quên mật khẩu (phase 5).
- Processor là hàm thuần `(data, deps)`; deps được inject.
- `prefix` lấy từ `QUEUE_PREFIX`. Test và e2e dùng prefix và Redis DB riêng, nên không đẩy job vào queue của dev. <!-- Red Team: E2E isolation -->
- Job scheduler (`upsertJobScheduler`) để Giai đoạn 2.

## Requirements

- Functional:
  - `pnpm --filter @novel-hub/worker dev` (`tsx watch`) khởi động, log "ready", xử lý queue `mail`.
  - Đăng ký hoặc quên mật khẩu trên web → job `send-auth-email` → worker gửi qua mailer (dev: link in ra log **của worker**).
  - Enqueue lỗi hoặc quá 1s → log lỗi, request auth vẫn trả về bình thường.
  - Job lỗi tạm thời → retry 5 lần, backoff mũ. Payload sai hoặc tên job lạ → `UnrecoverableError`, không retry.
  - SIGINT/SIGTERM → `worker.close()` (chờ job đang chạy xong) → đóng kết nối; quá 30s → `exit(1)`.
  - Root `pnpm dev` chạy song song web và worker.
- Non-functional:
  - Log ra stdout.
  - Log job lỗi chỉ ghi id, tên, message; **không ghi payload** (payload có URL chứa token).
  - Production thiếu SMTP → worker không khởi động.

## Architecture

```
packages/shared/src/queues.ts
  QUEUES = { mail: 'mail' } as const
  MAIL_JOBS = { sendAuthEmail: 'send-auth-email' } as const
  sendAuthEmailPayload = z.object({ kind: z.enum(['verify','reset']), to: z.email(), displayName: z.string(), url: z.url() })
packages/shared/src/env.ts
  + queueEnvSchema = z.object({ QUEUE_PREFIX: z.string().default('novelhub') })

packages/core/src/infra/redis.ts       + createWorkerConnection(url), createProducerConnection(url)
packages/core/src/queue/job-options.ts DEFAULT_JOB_OPTIONS (attempts 5, backoff exponential 10s,
                                        removeOnComplete { age: 3600, count: 1000 }, removeOnFail { age: 7d })
packages/core/src/queue/producer.ts    createMailQueue(conn, prefix); enqueueAuthEmail(queue, payload) (parse Zod trước khi add)

apps/worker/src/env.ts                 workerEnvSchema = requireSmtpInProduction(app + redis + queue + smtp)
apps/worker/src/index.ts               env → connection → mailer → new Worker(QUEUES.mail, routeJob, { prefix }) → shutdown
apps/worker/src/router.ts              job.name → processor; tên lạ → UnrecoverableError
apps/worker/src/processors/send-auth-email.ts  processSendAuthEmail(data, { mailer }) — dùng buildAuthEmail của core
apps/worker/src/shutdown.ts            registerShutdown(closables, { timeoutMs, exit })

apps/web/src/server/api-app.ts         tạo mailQueue khi dựng deps; sendAuthEmail = (m) => enqueueAuthEmail(mailQueue, m); createAuth({ …, mailTimeoutMs: 1000 })
                                       env web ghép thêm queueEnvSchema; đóng queue khi nhận tín hiệu
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/queues.ts` (+ test) | create | |
| `packages/shared/src/env.ts` (+ test) | modify | `queueEnvSchema` |
| `packages/core/src/infra/redis.ts` | modify | 2 factory mới |
| `packages/core/src/queue/{producer,job-options}.ts` (+ int test) | create | dep `bullmq@^6.3.11` |
| `apps/worker/package.json`, `tsconfig.json` | create | `@novel-hub/worker`; scripts `dev: tsx watch src/index.ts`, `start: tsx src/index.ts`, `typecheck` |
| `apps/worker/src/{index,env,router,shutdown}.ts` | create | |
| `apps/worker/src/processors/send-auth-email.ts` (+ test) | create | |
| `apps/worker/src/worker.int.test.ts` | create | |
| `apps/web/src/server/api-app.ts` | modify | producer thay mailer; env thêm queue |
| `package.json` (root) | modify | `dev`: song song web + worker |
| `CLAUDE.md` | modify | mục "Lệnh" |

## Implementation Steps

1. Cài `bullmq@^6.3.11` vào `core` và `worker`. Smoke-test bằng script tạm ở scratchpad (không commit): add và xử lý một job với `ioredis@5`. Lỗi tương thích thì thử `ioredis@6`, ghi lại lựa chọn rồi ghim.
2. `shared/queues.ts`, `queueEnvSchema`. `core`: connection factories, `DEFAULT_JOB_OPTIONS`, producer.
3. Worker:
   - processor, router, shutdown, `env.ts`;
   - `index.ts`: `worker.on('failed')` log id, tên, message; `worker.on('error')`; `process.on('unhandledRejection')`.
4. Web: tạo queue khi dựng deps, `sendAuthEmail` chuyển sang enqueue, đóng queue khi nhận tín hiệu.
5. Root `dev`: `pnpm --parallel --filter @novel-hub/web --filter @novel-hub/worker dev`. Paraglide đã compile sẵn nhờ `postinstall` từ phase 5.
6. Chạy test theo bảng dưới. Kiểm tay:
   - `pnpm infra:up && pnpm dev`, đăng ký qua `/dang-ky` → link xác thực xuất hiện trong log worker;
   - quên mật khẩu → link reset trong log worker;
   - tắt worker, đăng ký tiếp → job nằm chờ; bật lại → job được xử lý;
   - `docker compose stop redis` rồi đăng ký → request trả về trong dưới 1.5s, log có lỗi enqueue;
   - `Ctrl+C` worker khi đang xử lý job → thoát sạch.
7. Cập nhật mục "Lệnh" trong `CLAUDE.md`, chỉ ghi lệnh đã tồn tại và đã chạy thử: `infra:up/down/logs`, `dev`, `build`, `db:generate/migrate/seed`, `i18n:compile`, `test`, `test:int`, `test:e2e`, `typecheck`, `lint`, `format`, worker `dev/start`.
8. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox 6; cập nhật status trong `plan.md`.

## Function / Interface Checklist

- [x] `QUEUES`, `MAIL_JOBS`, `sendAuthEmailPayload`, `type SendAuthEmailPayload`
- [x] `queueEnvSchema`, `workerEnvSchema`
- [x] `createWorkerConnection(url)`, `createProducerConnection(url)`
- [x] `DEFAULT_JOB_OPTIONS`, `createMailQueue(conn, prefix)`, `enqueueAuthEmail(queue, payload)`
- [x] `processSendAuthEmail(data, { mailer })`, `routeJob(job, deps)`
- [x] `registerShutdown(closables, { timeoutMs, exit })`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Processor `kind: 'verify'` và `'reset'` → `mailer.send` đúng `to`, nội dung chứa URL | unit |
| High | Payload sai → `UnrecoverableError`, không gọi mailer; tên job lạ → `UnrecoverableError` | unit |
| High | `enqueueAuthEmail` với payload sai → throw trước khi `add` | unit |
| High | `registerShutdown`: đóng mọi closable; quá timeout → gọi `exit(1)` (inject `exit`) | unit |
| Medium | `workerEnvSchema`: production thiếu SMTP → lỗi; không đòi biến auth | unit |
| Critical | Redis thật (`TEST_REDIS_URL`, prefix riêng mỗi file): enqueue → worker xử lý → mailer stub nhận đúng payload | int; dọn bằng `obliterate({ force: true })` |
| High | Mailer ném lỗi một lần → job retry, lần 2 thành công (backoff rút ngắn trong test) | int |
| High | Queue **tạo khi port Redis đóng** → enqueue bọc `withTimeout` reject trong dưới 1.5s | int |
| Critical | Đăng ký → link trong log worker; worker tắt rồi bật lại vẫn xử lý job tồn; Redis tắt không làm treo đăng ký | thủ công (step 6) |

## Dependency Map

- Cần phase 5 (`AuthMailPort`, `buildAuthEmail`, mailer, `smtpEnvSchema`, `requireSmtpInProduction`), phase 4 (`core/infra/redis.ts`, `withTimeout`, `getApiApp`), phase 2 (Redis `noeviction` + AOF, `QUEUE_PREFIX`, `TEST_REDIS_URL`).
- Giai đoạn 1–2 thêm queue: kiểm tra trùng lặp, đồng bộ Meilisearch, purge CDN, flush counter (scheduler), thông báo.

## Success Criteria

- [x] Worker xử lý job `send-auth-email` thật từ luồng đăng ký và quên mật khẩu
- [x] Retry, `UnrecoverableError`, shutdown, timeout enqueue hoạt động đúng test matrix
- [x] `CLAUDE.md` mục "Lệnh" đã cập nhật
- [x] Gate đầy đủ xanh; checkbox 6 = `[x]`; plan status `completed`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| BullMQ 6 và ioredis lệch version | Smoke-test ở bước 1, chọn version chạy được rồi ghim |
| Job mail chứa URL có token nằm trong Redis | `removeOnComplete` 1h, `removeOnFail` 7 ngày; token Better Auth có hạn; Redis chỉ bind localhost |
| Worker không chạy ở dev nên không thấy link | Root `pnpm dev` chạy cả hai; web log khi enqueue |
| Chạy `tsx` ở production | Quyết định khi làm deploy (ngoài Giai đoạn 0) |

## Security Considerations

- Payload validate bằng Zod ở cả producer lẫn processor.
- Log không ghi payload.
- Redis chưa có mật khẩu chỉ chấp nhận được ở dev (bind localhost); hardening production làm khi deploy.

## Implementation Notes (2026-10-04)

- Smoke-test: `bullmq@6.3.11` + `ioredis@5.11.1` chạy được, giữ ioredis 5. `pnpm-workspace.yaml` từ chối build `msgpackr-extract` (prebuild có sẵn), giống esbuild.
- Thêm `apps/worker/src/mail-worker.ts` (`createMailWorker`) để `index.ts` và int test dùng chung; worker có dep `ioredis` (peer của BullMQ).
- `logRedisErrors(redis, label, source?)` ở `core/infra/redis.ts`: lúc mất kết nối chỉ ghi lỗi đầu, lúc kết nối tốt ghi mọi lỗi; dùng cho health Redis, Queue, Worker (Queue/Worker thiếu listener `error` thì crash).
- Web bỏ `smtpEnvSchema`/`requireSmtpInProduction` (web không còn gửi mail); worker giữ. Web log `[mail] đã xếp hàng mail <kind>` (không payload).
- Shutdown: tín hiệu trùng trong 1s bị bỏ qua (Ctrl+C + `tsx watch` chuyển tiếp SIGINT = 2 tín hiệu); `tsx watch` tự SIGKILL sau 5s nên mức chờ 30s chỉ có tác dụng với `start`.
- Kiểm tay đạt: link verify/reset ra log worker; worker tắt → job chờ, bật lại → xử lý; Ctrl+C (process group, `tsx watch`) → exit 0; Redis tắt → đăng ký 200 trong 0,1s, log lỗi enqueue; Redis lên lại → enqueue bình thường.
- Review: `plans/reports/from-code-reviewer-to-cook-261004-2334-phase-06-bullmq-worker-review-report.md`. Đã sửa 2 Medium. Low để lại: web khởi động lúc Redis tắt thì job có thể vào muộn sau khi đã báo lỗi (có thể mail trùng); SMTP tệ nhất ~40s > mức chờ tắt 30s (xem khi deploy); e2e để lại job trong Redis test (tiền tố `e2e`); log job lỗi có thể chứa email từ phản hồi SMTP.

## Next Steps

Giai đoạn 0 xong → chạy `/ak:plan` cho Giai đoạn 1. Nhắc user: backup offsite + thử restore Postgres vẫn đang chờ, phải làm trước khi mở public.
