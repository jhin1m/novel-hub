# Code review phase 3: Drizzle schema, migration, seed

Ngày: 2026-10-04 · Điểm: 7/10 · Status: DONE_WITH_CONCERNS · Critical: 0 · High: 2

## Phạm vi

- `packages/db/**` (schema 6 file + columns/enums, client, migrate, truncate, seed 4 file, testing 2 file, 3 file test, `drizzle/0000_init.sql`), `packages/shared/src/schemas/preferences.ts` (+test), `packages/shared/src/index.ts`, root `vitest.config.ts`, `package.json`, spec mục 4. Thêm ngoài danh sách: `eslint.config.js`, `.prettierignore` (bỏ qua `packages/db/drizzle`), hợp lý.
- Kiểm lại: `pnpm typecheck`, `pnpm lint`, `pnpm test` (41 pass), `pnpm test:int` (28 pass): xanh. `drizzle-kit generate` trên bản clone: "No schema changes" (schema khớp `0000_init.sql`). `pnpm db:migrate` trên DB dev: no-op OK. `pnpm db:seed` trên DB dev đã có dữ liệu: từ chối đúng.

## Đối chiếu tiêu chí phase file

| Tiêu chí | Kết quả |
|---|---|
| 24 bảng, enum chỉ cho tập cố định (8 enum), text cho tập mở | Đạt (test đếm 24 bảng; SQL đọc tay) |
| FK actions, unique, CHECK, index theo bảng Architecture, tên tường minh | Đạt. `reports.reporter_id` set null (plan không nói rõ, hợp lý) |
| `timestamptz`, `created_at/updated_at` default `now()`, `$onUpdate` | Đạt (đã xác minh `onConflictDoUpdate` của Drizzle 0.45.3 cũng áp `$onUpdate`) |
| Guard seed: `NODE_ENV` ∈ {development,test} và host local, thiếu thì từ chối | Đạt về mặt test, nhưng **bypass được** (H2) |
| Seed từ chối khi `users` có dữ liệu, `--reset` để nạp lại | Đạt |
| `truncateAll` kiểm `current_database()` hậu tố `_test` | Đạt, test cả fake lẫn DB dev thật |
| `globalSetup` migrate DB test một lần | Đạt |
| Pool có connection timeout + statement timeout | Đạt về cấu hình; nhưng **không chống treo** khi kết nối đang ấm (M1) và **crash process** khi kết nối đang mượn bị đứt (H1) |
| Hợp đồng `createDb`/`runMigrations`/`assertSeedAllowed`/`seedDatabase`/`createTestDb`/`truncateAll`/`uuidPk`... | Khớp. `seedDatabase` thêm `opts.now` (mở rộng, không phá hợp đồng) |
| Spec mục 4 đồng bộ (email, email_verified, updated_at, bảng auth, stories.updated_at, chapters.created_at, ratings 1–5) | Đạt |
| Không regression `packages/shared`, `apps/web` | Đạt: chỉ thêm export; chưa package nào khác phụ thuộc `@novel-hub/db` |

## High

### H1. Process crash khi Postgres cắt kết nối đang được transaction mượn

- File: `packages/db/src/client.ts:24-27`.
- `pool.on('error')` chỉ bắt lỗi của client **idle**. pg-pool gỡ `idleListener` khi cho mượn client (`pg-pool/index.js:344`), và Drizzle không gắn listener cho client mượn trong `db.transaction()` (`drizzle-orm/node-postgres/session.js:182`). Khi backend bị cắt giữa hai câu lệnh của transaction (Postgres restart, `docker compose restart postgres`, `pg_terminate_backend`, `idle_in_transaction_session_timeout`), `Client` phát `'error'` không ai nghe → uncaught → process thoát.
- Đã tái hiện (probe trong scratchpad, DB `_test`): mở `db.transaction`, `pg_terminate_backend(pid)` từ kết nối khác, `await` 1 giây trong transaction → `Unhandled 'error' event ... 57P01`, `process exit code 1`. Promise transaction không kịp reject.
- Hậu quả production: một lần restart Postgres lúc có request đang ở giữa transaction (đăng chương: sanitize, đếm chữ, ghi revision giữa các câu lệnh) làm sập cả process `web`/`worker`, không chỉ request đó.
- Sửa (trong `createDb`):
  ```ts
  pool.on('connect', (client) => {
    client.on('error', (err) => console.error('[db] kết nối bị lỗi:', err.message));
  });
  ```
  Query đang chạy vẫn bị reject như cũ; listener chỉ ngăn crash. Thêm test int: terminate backend trong transaction → promise reject, process sống.

### H2. Guard seed bị vượt qua bằng query param `host` → `--reset` TRUNCATE DB từ xa

- File: `packages/db/src/seed/guard.ts:20-26`; hậu quả ở `packages/db/src/seed/cli.ts:18-20`.
- Guard đọc `new URL(url).hostname`, nhưng `pg-connection-string` (2.14.1, `index.js:40-56`) ưu tiên `?host=` trong query string hơn hostname.
- Đã tái hiện: `postgres://u:p@localhost:5432/novel_hub?host=db.prod.example.com` → `assertSeedAllowed` cho qua, `pg` kết nối tới `db.prod.example.com`.
- Kịch bản: `.env` có URL dạng trên (copy từ hướng dẫn hosting hoặc dùng `?host=` cho socket rồi sửa dở) + `NODE_ENV=development` → `pnpm db:seed --reset` chạy `TRUNCATE ... RESTART IDENTITY CASCADE` mọi bảng `public` trên DB thật. Xác suất thấp, nhưng hậu quả là mất toàn bộ dữ liệu, đúng rủi ro số 1 ở spec mục 11. Phase file yêu cầu "thiếu thông tin thì từ chối".
- Sửa: từ chối khi có `host` (và `hostaddr`) trong `searchParams`; hoặc lấy host bằng chính `parse()` của `pg-connection-string` (đã là dependency của `pg`, nhưng import trực tiếp thì phải khai báo dependency, nên cách đầu đơn giản hơn). Thêm case vào `guard.test.ts`.
- Rủi ro còn lại (ghi chú, không cần sửa ngay): SSH tunnel `localhost:15432 → prod` không phát hiện được bằng host. Có thể giảm thêm nếu `--reset` in `current_database()` + `inet_server_addr()` trước khi xoá.

## Medium

### M1. Pool vẫn treo khi Postgres đứng (kết nối đang ấm)

- File: `packages/db/src/client.ts:18-23`.
- `connectionTimeoutMillis` chỉ áp lúc lấy kết nối **mới**; `statement_timeout` chạy phía server nên vô dụng khi server không phản hồi. Pool giữ kết nối idle 10 giây (mặc định `idleTimeoutMillis`), nên trên server có traffic, gần như mọi query đi qua kết nối ấm.
- Đã tái hiện bằng TCP proxy đóng băng (tương đương `docker compose pause postgres`): query trên kết nối ấm **vẫn treo sau 25 giây**. Hàng "Pool: ... không treo" trong Test Scenario Matrix chỉ đúng khi pool không còn kết nối idle.
- Sửa: thêm `query_timeout` phía client (ví dụ `statementTimeoutMs + 5_000`, tắt khi `statementTimeoutMs === 0`) và `keepAlive: true`. Ghi lại kết quả kiểm thủ công cho đúng.

### M2. Index `last_chapter_at DESC NULLS LAST` không dùng được với `desc()` của Drizzle

- File: `packages/db/src/schema/stories.ts:67`.
- Drizzle `.desc()` trong index sinh `DESC NULLS LAST`, còn helper truy vấn `desc(col)` sinh `col desc`, mặc định là `NULLS FIRST` (`drizzle-orm/sql/expressions/select.js:5-6`). EXPLAIN trên DB dev (`enable_seqscan=off`):
  - `order by last_chapter_at desc` → `Index Scan` + **`Sort`** (index chỉ dùng để lọc, không dùng cho thứ tự; với `LIMIT 20` trang chủ vẫn phải sort mọi truyện published).
  - `order by last_chapter_at desc nulls last` → `Index Scan` thẳng, không sort.
- `NULLS LAST` là đúng ngữ nghĩa (truyện chưa có chương xuống cuối), nên giữ index. Sửa ở phía truy vấn: export helper từ `@novel-hub/db`, ví dụ `descNullsLast = (c) => sql\`${c} desc nulls last\``, và ghi vào JSDoc của index. Cùng lưu ý cho `chapter_revisions`, `notifications`, `reading_progress` (cột NOT NULL nên không ảnh hưởng, chỉ `last_chapter_at` nullable).

### M3. Thiếu index phía FK cho đường đọc và cascade đã biết trước

- Không có index cho: `ratings.story_id` (trang truyện: điểm TB + danh sách review), `reading_progress (story_id, chapter_id)` (spec mục 5: tỷ lệ bỏ dở theo chương ở dashboard tác giả; PK hiện là `(user_id, story_id)`), `reading_progress.chapter_id`, `library_items.story_id`, `comments.story_id`, `comments.user_id`, `featured_slots.story_id`, `reports.reporter_id/handled_by`, `user_badges.badge_id`.
- Hậu quả: xoá story/user và cascade/set null quét tuần tự từng bảng; dashboard bỏ dở quét toàn bảng `reading_progress` mỗi lần mở.
- Lý do nên thêm sớm: drizzle migrator chạy mỗi migration trong transaction nên sau này **không dùng được `CREATE INDEX CONCURRENTLY`**; thêm index lên bảng lớn sẽ khoá ghi. Bảng đang trống, migration `0000` chưa áp ngoài máy dev, nên sửa schema + sinh lại lúc này gần như miễn phí. Tối thiểu nên có: `ratings(story_id, created_at)`, `reading_progress(story_id, chapter_id)`, `reading_progress(chapter_id)`, `library_items(story_id)`, `comments(story_id)`, `comments(user_id)`. Plan không yêu cầu, nên đây là lỗ hổng của plan chứ không phải lỗi triển khai; cần lead quyết.

## Low

- L1. `packages/db/src/migrate.ts:25`, `packages/db/src/seed/cli.ts:28`: chỉ in `err.message`. Lỗi của Drizzle 0.45 là `DrizzleQueryError` với message `Failed query: <sql>\nparams: <params>`, còn lý do thật (ví dụ `relation already exists`) nằm ở `cause` và bị mất. Phase 5 truyền hash mật khẩu thì `params` có thể in hash ra log. Nên in `cause.message`/`code`, không in `params`. Phase 4 cần nhớ điều này: không trả message của `DrizzleQueryError` cho client.
- L2. `packages/db/src/seed/cli.ts:18-22`: `--reset` TRUNCATE và `seedDatabase` chạy ở hai transaction khác nhau; seed lỗi thì DB dev trống trơn. TRUNCATE trong Postgres có transaction, nên có thể truyền cờ `reset` vào `seedDatabase` để xoá trong cùng transaction.
- L3. `runMigrations` không có advisory lock (drizzle 0.45 không tự khoá) và không đặt `lock_timeout`. Hai process migrate cùng lúc (deploy web + worker, hai lần `test:int` song song) có thể đua nhau; migration sau này cần `ACCESS EXCLUSIVE` sẽ xếp hàng sau query dài và chặn mọi truy vấn đọc bảng đó. Nên `pg_advisory_lock` quanh `migrate()` và `SET lock_timeout` (ví dụ 10s) trên kết nối migrate khi có deploy (phase triển khai).
- L4. `tags_canonical_not_self` chỉ chặn tự trỏ; chuỗi `A→B→C` hoặc vòng `A→B→A` vẫn hợp lệ → redirect 301 lặp ở `/the-loai`. Công cụ gộp tag (Giai đoạn 1) phải đảm bảo tag đích có `canonical_id IS NULL` và trỏ lại các tag đang trỏ vào tag nguồn.
- L5. `comments.parent_id` mặc định `NO ACTION`: xoá cứng một bình luận cha có trả lời sẽ lỗi 23503. Chấp nhận được nếu bình luận chỉ ẩn bằng `status`; nên ghi chú vào schema.
- L6. `drizzle.config.ts:6` bắt buộc `DATABASE_URL` cả khi chỉ `generate` (không cần DB); CI kiểm drift migration sẽ phải đặt biến giả.
- L7. Test `truncateAll ... trỏ vào DB dev thật` (`schema.int.test.ts:238-246`) cần DB dev tồn tại; khi lên GitHub Actions chỉ có DB `_test` thì test này lỗi. Cân nhắc dùng một URL không đuôi `_test` trỏ tới DB `postgres` có sẵn.
- L8. `truncate.ts:12` lọc `__drizzle_migrations` trong schema `public` là code chết (bảng migration nằm ở schema `drizzle`). Vô hại; comment dòng 5 đã nói đúng.

## Tương thích Better Auth 1.7.7

- Cột khớp core schema: `users` (email unique, `emailVerified`, `name→displayName`, `image→avatarUrl`, `createdAt/updatedAt`), `sessions` (token unique, expiresAt, ipAddress, userAgent, userId), `accounts` (accountId, providerId, các token, `*ExpiresAt`, scope, password), `verifications` (identifier, value, expiresAt). Seed tạo `accountId = user.id` cho provider `credential`, khớp cách Better Auth làm.
- Ràng buộc phase 5 phải đáp ứng (đã có trong `phase-05-better-auth.md`, chỉ nhắc lại): `advanced.database.generateId: false` (cột id là `uuid`, id chuỗi mặc định của BA sẽ lỗi `22P02`); `username NOT NULL` + CHECK nên user Google phải được sinh username trong `user.create.before`; không dùng username plugin (cho phép dấu `.`, vi phạm CHECK) và admin plugin (role mặc định `user` không có trong enum `user_role`).
- `users_email_key` phân biệt hoa thường; dựa vào việc BA lowercase email. Seed dùng email chữ thường, khớp.

## Ghi nhận giúp đánh giá rủi ro

- Guard `truncateAll` hỏi `current_database()` từ server, không tin URL: đúng thiết kế, có test cả fake lẫn DB dev thật.
- Seed chạy trong một transaction, kiểm `users` rỗng bên trong transaction; `public_id` retry dùng `onConflictDoNothing` nên không làm hỏng transaction (bắt 23505 sẽ abort transaction). Đây là chỗ triển khai tốt hơn mô tả trong plan.
- Lỗi guard không in URL/mật khẩu, có test.

## Việc nên làm (theo thứ tự)

1. H1: gắn listener `'error'` cho client qua `pool.on('connect')` + test int.
2. H2: từ chối `host`/`hostaddr` trong query string + test.
3. M1: `query_timeout` + `keepAlive`; sửa ghi chú kiểm thủ công.
4. M3 (lead quyết): bổ sung index FK/đường đọc rồi sinh lại `0000` khi migration chưa áp ngoài máy dev.
5. M2: helper `descNullsLast` cho phase 1 (trang chủ "mới cập nhật").
6. L1–L8 khi tiện.

## Chỉ số

- Type: strict, không `any` (một `as unknown as` trong test fake và cast `pg.DatabaseError` có kiểm `'code' in`, chấp nhận được).
- Test: 41 unit + 28 int pass; tiêu chí Test Scenario Matrix đều có test, trừ hàng pool (thủ công) mà M1 cho thấy kết luận chưa đúng.
- Lint: 0.

## Câu hỏi chưa giải quyết

- M3: có bổ sung index ngay trong `0000` (cần sinh lại migration và `--reset` DB dev) hay để từng tính năng tự thêm migration sau?

Status: DONE_WITH_CONCERNS
Summary: Phase 3 đạt các tiêu chí phase file, gate xanh, schema khớp migration. Có 2 lỗi High trong hạ tầng dùng chung: process crash khi Postgres cắt kết nối đang được transaction mượn, và guard seed bị vượt qua bằng `?host=` (cả hai đã tái hiện).
Concerns/Blockers: Nên sửa H1, H2 (và M1) trước khi phase 4 dùng `createDb`. M3 cần lead quyết vì phải sinh lại `0000`.
