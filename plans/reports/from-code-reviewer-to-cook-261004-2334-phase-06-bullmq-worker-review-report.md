# Review phase 6: Worker BullMQ và job `send-auth-email`

Ngày 2026-10-04. Chỉ review, không sửa code.

## Phạm vi

- Shared: `packages/shared/src/{queues.ts,queues.test.ts,index.ts,env.ts}`
- Core: `packages/core/src/infra/redis.ts`, `queue/{job-options,producer}.ts` (+ test, int test), `mail/ports.ts`, `index.ts`
- Worker: `apps/worker/{package.json,tsconfig.json}`, `src/{index,env,router,mail-worker,shutdown}.ts`, `processors/send-auth-email.ts`, các test
- Web: `apps/web/src/server/api-app.ts`; root `package.json`, `pnpm-workspace.yaml`, `CLAUDE.md`
- Đối chiếu thêm: `packages/auth/src/auth.ts`, `packages/core/src/lib/with-timeout.ts`, `packages/core/src/mail/mailer.ts`, `apps/web/playwright.config.ts`, mã nguồn BullMQ 6.3.11 (`dist/esm/classes/{redis-connection,worker,queue-base}.js`), tsx 4.23.15 (`dist/cli.mjs`, `dist/preflight.cjs`)

Đã chạy lại: `pnpm typecheck` xanh; ESLint trên phạm vi thay đổi sạch; unit test phạm vi thay đổi 21/21 xanh.
Probe: chạy một script bắt SIGINT dưới `tsx watch` và `tsx` rồi gửi SIGINT cho cả process group (giống Ctrl+C).

## Đánh giá chung

Phần lõi đúng. Hợp đồng queue nằm ở `shared`, payload được parse ở cả producer lẫn processor. Queue và Worker đều có listener `error` nên không crash. Thứ tự đóng là worker trước, kết nối sau, và đã kiểm với source BullMQ: instance truyền vào là `shared`, `close()` không tự ngắt nó (`redis-connection.js:503`). `withTimeout` dùng `Promise.race` nên rejection đến muộn vẫn có handler. Log job lỗi không chứa payload. Không có lỗi Critical hay High.

Có 2 lỗi Medium. Lỗi đầu khiến tiêu chí "Ctrl+C worker khi đang xử lý job → thoát sạch" **không đạt** khi chạy bằng lệnh dev đã ghi trong tài liệu.

## Critical

Không có.

## High

Không có.

## Medium

### M1. Dưới `tsx watch` (`pnpm dev`), Ctrl+C gửi SIGINT hai lần nên worker `exit(1)` ngay, bỏ qua việc chờ job

- Vị trí: `apps/worker/src/shutdown.ts:21-24`, kết hợp với `apps/worker/package.json:7` (`tsx watch`) và root `dev`.
- Cơ chế: Ctrl+C gửi SIGINT tới cả foreground process group, gồm pnpm, tsx và process node con. Ở chế độ watch, tsx còn chuyển tiếp SIGINT cho process con một lần nữa (`killProcess` → `m.kill(S)` trong `tsx/dist/cli.mjs`). Chế độ không watch thì không bị, vì preflight báo cho tsx qua IPC và tsx bỏ qua bước chuyển tiếp. Như vậy process con nhận hai SIGINT cách nhau vài ms, và nhánh "tín hiệu lần hai" gọi `exit(1)` trước khi `worker.close()` kịp chạy.
- Bằng chứng (probe): `tsx watch probe.ts` cho ra `got SIGINT #1`, `got SIGINT #2`, `exit=1`. `tsx probe.ts` chỉ cho ra `got SIGINT #1`, `exit=0`.
- Hậu quả: khi dev, job đang chạy bị bỏ dở. Lock hết hạn, job bị coi là stalled, chạy lại, nên có thể gửi trùng mail. `pnpm dev` báo lỗi ELIFECYCLE mỗi lần Ctrl+C. Kết quả kiểm tay "SIGINT → exit 0" có lẽ đo bằng `start` hoặc `kill -INT <pid>`, không phải Ctrl+C trên `pnpm dev`. Ngoài ra, tsx watch tự SIGKILL process con sau 5 giây, nên mức chờ 30 giây chỉ có tác dụng với `start`.
- Production (`tsx src/index.ts` hoặc node) không bị ảnh hưởng.
- Cách sửa: bỏ qua tín hiệu trùng đến trong một khoảng ngắn. Ví dụ:
  ```ts
  let startedAt: number | undefined;
  // trong shutdown:
  if (startedAt !== undefined) {
    if (Date.now() - startedAt < 1_000) return; // tín hiệu trùng (tsx watch chuyển tiếp lại)
    exit(1);
    return;
  }
  startedAt = Date.now();
  ```
  Thêm unit test: hai tín hiệu liền nhau thì không exit; tín hiệu thứ hai sau hơn 1 giây thì `exit(1)`. Dùng fake timers, hoặc inject `now`.

### M2. `logRedisErrors` gắn vào Worker/Queue nuốt mất lỗi không phải lỗi kết nối, và gọi tất cả là "lỗi kết nối"

- Vị trí: `packages/core/src/infra/redis.ts:52-63`, gọi từ `apps/worker/src/mail-worker.ts:13` và `packages/core/src/queue/producer.ts:22`.
- Cơ chế: BullMQ Worker phát `error` cho nhiều lỗi **không phải lỗi kết nối**. Source lọc tường minh bằng `isNotConnectionError` ở `worker.js:441, 951`, và còn phát ở 743 (resume), 805 (lỗi khi close), 887 (stalled checker). Cờ `reported` chỉ được đặt lại khi kết nối phát `ready`, mà lúc chạy ổn định thì `ready` chỉ phát một lần lúc khởi động. Vì vậy sau lỗi đầu tiên (ví dụ lỗi stalled checker hay "Missing lock"), **mọi lỗi sau đó bị im lặng vô thời hạn** cho tới khi Redis nối lại. Lỗi đầu tiên đó cũng bị ghi nhãn sai là "lỗi kết nối".
- Hậu quả: worker hỏng âm thầm. Spec mục 11 chỉ dựa vào log stdout để giám sát.
- Cách sửa: chỉ gộp lỗi khi kết nối thật sự đang không `ready`:
  ```ts
  source.on('error', (err) => {
    const connecting = redis.status !== 'ready';
    if (connecting && reported) return;
    if (connecting) reported = true;
    console.error(`${label} ${connecting ? 'lỗi kết nối' : 'lỗi'}:`, err.message || err.code || err.name);
  });
  ```
  Thêm unit test bằng một EventEmitter giả: khi `status === 'ready'`, hai lỗi liên tiếp thì log đủ cả hai.

## Low

### L1. Queue tạo lúc Redis chết: `add` vẫn treo sau khi timeout và chạy muộn khi Redis sống lại

- Vị trí: `apps/web/src/server/api-app.ts:75-76, 126-129`; `packages/core/src/queue/producer.ts:35`.
- Source BullMQ (`RedisConnection.waitUntilReady`) chờ `ready` mà không giới hạn. Đây là ưu điểm: Queue không bị hỏng vĩnh viễn và tự phục hồi. Nhưng promise `add` đã bị `withTimeout` bỏ rơi vẫn còn treo, và khi Redis lên lại thì job vẫn được đẩy vào.
- Hậu quả: log ghi "gửi mail lỗi" nhưng sau đó mail vẫn đi. Nếu người dùng đã bấm "gửi lại" thì nhận hai mail. Các promise treo tích lũy theo số request trong lúc Redis chết (có giới hạn, nhỏ).
- Có thể chấp nhận. Nếu muốn fail nhanh và nhất quán: trong `sendAuthEmail`, nếu `queueRedis.status !== 'ready'` thì throw trước khi `add`.

### L2. Timeout tắt 30 giây ngắn hơn thời gian SMTP tệ nhất; Docker mặc định chỉ chờ 10 giây

- Vị trí: `apps/worker/src/index.ts:8`; `packages/core/src/mail/mailer.ts:40-42` (connect 10s + greeting 10s + socket idle 20s).
- Nếu SMTP chậm, `exit(1)` xảy ra giữa chừng, job bị coi là stalled rồi chạy lại, có thể gửi trùng mail. Khi deploy cần đặt `stop_grace_period` của Docker ≥ 35 giây, vì mặc định 10 giây sẽ SIGKILL trước mốc 30 giây. Ghi lại cho phase deploy.

### L3. E2E đẩy job vào Redis test mà không có worker và không dọn

- Vị trí: `apps/web/playwright.config.ts:31-39`; `apps/web/e2e/global-setup.ts` chỉ truncate DB.
- Mỗi lần chạy e2e để lại job `e2e:mail:*` chứa URL có token trong Redis DB 1. `removeOnComplete`/`removeOnFail` không bao giờ áp dụng vì job không được xử lý.
- Sửa: trong global-setup, gọi `obliterate({ force: true })` cho queue `mail` prefix `e2e`.
- Comment `SMTP_HOST: ''` ("link xác thực chỉ in ra log") đã cũ: web không còn đọc SMTP, và e2e không có worker nên link không được in ở đâu cả. Nên bỏ biến này hoặc sửa comment.

### L4. Log `failed` có thể chứa địa chỉ email (PII)

- Vị trí: `apps/worker/src/mail-worker.ts:17-22`.
- `err.message` của nodemailer khi người nhận bị từ chối thường lặp lại phản hồi của server, ví dụ `550 5.1.1 <x@y>: Recipient address rejected`. Không có token, nên chấp nhận được. Chỉ cần lưu ý nếu sau này đẩy log ra dịch vụ ngoài.

### L5. Tài liệu và trạng thái plan chưa theo kịp

- `.env.example:73` vẫn ghi "SMTP (dùng từ phase 5)", chưa nói rằng giờ chỉ worker đọc SMTP và web bỏ qua.
- `docs/project-spec.md:148` vẫn `[ ]`, `plan.md:40` vẫn `Pending`. Đây là bước 8, làm sau review.

## Kiểm tra theo yêu cầu

**(a) Tiêu chí nghiệm thu**

| Tiêu chí | Kết quả |
|---|---|
| Worker xử lý job thật từ luồng đăng ký và quên mật khẩu | Đạt (int test + kiểm tay) |
| Retry 5 lần, backoff mũ; payload sai hoặc tên job lạ → `UnrecoverableError` | Đạt (`job-options.ts:9-10`, `router.ts:13`, `send-auth-email.ts:16`, int test retry) |
| Enqueue lỗi hoặc quá 1s → log, request vẫn trả về | Đạt (`auth.ts:52-61` fire-and-forget, `mailTimeoutMs: 1000`, `producer.int.test.ts`) |
| SIGINT/SIGTERM → `worker.close` → đóng kết nối; quá 30s → `exit(1)` | Đạt với `start`; **không đạt dưới `tsx watch`/`pnpm dev`** (M1) |
| Log không có payload | Đạt (L4 là PII từ phản hồi SMTP, không phải payload) |
| Production thiếu SMTP → worker không khởi động | Đạt (`requireSmtpInProduction` + `createMailer` throw ở chế độ log) |
| Root `pnpm dev` chạy song song web và worker; mục "Lệnh" trong `CLAUDE.md` | Đạt |
| Test matrix | Đủ các dòng. Unit test của shutdown không phủ trường hợp hai tín hiệu đến gần như cùng lúc (M1) |

**(b) Hồi quy ở các điểm chạm**

- Đường gửi mail auth: giữ nguyên bọc fire-and-forget.
- Health Redis: `createHealthRedis` dùng `logRedisErrors` mặc định `source = redis`, hành vi tương đương trước.
- Singleton HMR: `mailQueue` nằm trong `Infra` cache trên `globalThis`, `buildApp` dùng lại, không mở kết nối mới khi HMR.
- Đóng khi nhận tín hiệu: queue close có timeout 2s, rồi `disconnect`. Không thấy hồi quy.

**(c) Thay đổi hợp đồng ngoài phần đã nêu.** Tất cả đều là thêm mới, không phá vỡ gì:

- `@novel-hub/core` export thêm `logRedisErrors`, `DEFAULT_JOB_OPTIONS`, `MailQueue`, `createMailQueue`, `enqueueAuthEmail`, `createWorkerConnection`, `createProducerConnection`.
- Entry chính `@novel-hub/shared` (có vào bundle client) export thêm schema queue. Zod vốn đã có trong bundle qua `schemas/*`, nên chi phí không đáng kể.
- `AuthMailMessage`/`AuthEmailKind` giờ suy ra từ Zod, cùng hình dạng như trước.
- Env mới `QUEUE_PREFIX` có default.
- Lưu ý: worker nạp barrel `@novel-hub/core`, kéo theo `@novel-hub/db` (drizzle, pg) lúc khởi động dù worker không dùng DB. Không sai, chỉ thừa.

**(d) Theo pattern có sẵn.** Đạt: Zod env tách mảnh, `loadServerEnv`, processor thuần có deps inject, log không lộ giá trị.

**(e) Bảo mật.**

- Payload và token không xuất hiện trong log hay message lỗi; message `UnrecoverableError` không chứa input.
- Job lỗi giữ URL có token trong 7 ngày, đúng bảng rủi ro của plan, và token Better Auth có hạn.

**(f) Các edge case được yêu cầu kiểm**

| Mục | Kết quả |
|---|---|
| Listener `error` trên Queue/Worker | Có. Thiếu thì crash, vì `queue-base.js:33` chuyển tiếp lỗi lên. Nhưng xem M2 |
| Tín hiệu lần hai | Logic đúng, nhưng bị kích hoạt oan dưới tsx watch (M1) |
| Thứ tự `worker.close` → `disconnect` | Đúng |
| Handler `unhandledRejection` | Có. Chỉ log message và giữ process sống, chấp nhận theo plan |
| `enableOfflineQueue: false` | Đã kiểm source: sau khi `ready`, `add` fail nhanh lúc mất kết nối; lúc khởi tạo thì chờ `ready` không giới hạn rồi tự phục hồi (L1) |
| `removeOnComplete`/`removeOnFail` | Khớp plan |
| Redis | `noeviction` + AOF đã có trong compose |

## Việc nên làm (theo thứ tự)

1. M1: bỏ qua tín hiệu trùng trong khoảng ≤ 1 giây ở `registerShutdown`, kèm test. Kiểm lại bằng Ctrl+C trên `pnpm dev` khi có job đang chạy.
2. M2: chỉ gộp lỗi khi `redis.status !== 'ready'`, kèm test.
3. L3: obliterate queue `e2e` trong global-setup của e2e; dọn `SMTP_HOST` cũ trong `playwright.config.ts`.
4. L1, L2, L4, L5: tuỳ chọn; ghi L2 vào danh sách việc của phase deploy.

## Số liệu

- Typecheck: xanh. Lint (phạm vi thay đổi): 0 lỗi. Unit (phạm vi thay đổi): 21/21. Theo báo cáo của cook: 124 unit, 69 int, 2 e2e.
- Coverage: không đo.

## Câu hỏi còn mở

- Kết quả kiểm tay "SIGINT → exit 0" đo bằng lệnh nào: `start`, `kill <pid>`, hay Ctrl+C trên `pnpm dev`?
