---
title: "Phase 3: Drizzle schema, migration, seed"
status: completed
priority: P1
effort: "1.5d"
dependencies: [2]
---

# Phase 3: Drizzle schema, migration, seed

Spec checkbox: `Drizzle schema mục 4 + migration đầu tiên + seed dữ liệu mẫu.`

## Context Links

- Spec mục 4 (bảng, URL, slug, public_id), 7 (role/status, báo cáo), 9 (snake_case, drizzle-kit, không sửa migration đã chạy), 10 (`is_ai_assisted`, `paragraph_id`), 11 (mất dữ liệu là rủi ro lớn nhất)
- `plans/reports/researcher-261004-1954-drizzle-better-auth-report.md`

## Overview

`packages/db` gồm:
- schema Drizzle cho **toàn bộ** bảng mục 4, kể cả bảng của Giai đoạn 2 (spec khuyến nghị thiết kế sẵn);
- 3 bảng Better Auth (`sessions`, `accounts`, `verifications`) và các cột Better Auth bắt buộc trên `users`;
- migration `0000`, script migrate, seed gọn, tiện ích test DB và `globalSetup` cho project `integration`.

## Key Insights

- Drizzle **0.45.3** / drizzle-kit **0.31.11** (bản 1.0 mới ở rc). Không dùng `relations()` để sau này nâng 1.0 rẻ.
- Driver `pg@8.23.1` (`drizzle-orm/node-postgres`), một `Pool` mỗi process, **có timeout kết nối và timeout câu lệnh**. <!-- Red Team: pool timeouts -->
- `casing: 'snake_case'` khai báo ở **cả** `drizzle.config.ts` lẫn `drizzle()`.
- PK: `uuid().primaryKey().default(sql\`uuidv7()\`)` (Postgres 18).
- Better Auth tra bảng theo **key JS** (`users`, `sessions`, `accounts`, `verifications` khi bật `usePlural`). Trên `users` nó cần `email` (unique), `emailVerified`, `updatedAt`; core field `name`/`image` sẽ map sang `displayName`/`avatarUrl` ở phase 5.
- `pgEnum` chỉ dùng cho tập giá trị mà spec đã cố định. Các tập còn mở (báo cáo, kiểm duyệt, trạng thái bình luận) dùng `text`; Zod enum định nghĩa khi Giai đoạn 1–2 thiết kế các tính năng đó. Lý do: Postgres không xoá hay đổi tên được giá trị enum. <!-- Red Team: enum over-commitment -->
- `packages/db` **không** phụ thuộc `better-auth`. Seed nhận `hashPassword` qua tham số; phase 5 truyền hàm thật vào. <!-- Red Team: layering -->

## Requirements

- Functional:
  - Đủ 24 bảng (liệt kê dưới), enum, FK, unique, index, CHECK.
  - `pnpm db:generate` sinh SQL; `pnpm db:migrate` áp lên DB trống; `pnpm db:seed` nạp dữ liệu mẫu.
  - **Guard chỉ cho chạy khi chắc chắn an toàn** cho seed và truncate (thiếu thông tin thì từ chối): <!-- Red Team: destructive guards -->
    - Seed chỉ chạy khi `NODE_ENV` ∈ {`development`, `test`} **và** host của `DATABASE_URL` ∈ {`localhost`, `127.0.0.1`, `::1`}. Thiếu `NODE_ENV` thì từ chối.
    - Seed từ chối khi `users` đã có dữ liệu, trừ khi có `--reset`. `--reset` dùng chung guard trên, sau đó TRUNCATE rồi nạp lại.
    - `truncateAll(db)` tự chạy `select current_database()` và chỉ thực hiện khi tên kết thúc `_test`.
  - `globalSetup` của project `integration`: migrate DB test **một lần** cho mọi package.
- Non-functional: migration sinh bằng drizzle-kit, không sửa tay sau khi đã chạy; tên bảng và cột snake_case.

## Architecture

### Enum (`pgEnum`)

| Enum | Giá trị |
|---|---|
| `user_role` | reader, author, mod, admin |
| `user_status` | active, muted, banned |
| `story_status` | ongoing, completed, hiatus |
| `story_visibility` | draft, published, hidden_by_mod |
| `tag_kind` | genre, theme, warning |
| `chapter_status` | draft, scheduled, published, hidden_by_mod |
| `follow_target` | story, user |
| `library_shelf` | reading, plan, done, dropped |

Dùng `text` (validate bằng Zod khi có tính năng): `comments.status`, `reports.target_type/reason/status`, `moderation_actions.target_type/action`, `notifications.type`.

### Bảng (cột ngoài spec đánh dấu ★)

| Bảng | Cột / ràng buộc chính |
|---|---|
| `users` | id; username (unique, CHECK `^[a-z0-9_]{3,30}$`); display_name; ★email (unique); ★email_verified (default false); avatar_url; bio; role (default reader); status (default active); preferences jsonb (default `{}`, `$type<UserPreferences>`); created_at; ★updated_at |
| `sessions` ★ | id; user_id → users cascade; token (unique); expires_at; ip_address; user_agent; created_at; updated_at. Idx user_id |
| `accounts` ★ | id; user_id → users cascade; account_id; provider_id; access_token; refresh_token; id_token; access_token_expires_at; refresh_token_expires_at; scope; password; created_at; updated_at. Unique(provider_id, account_id); idx user_id |
| `verifications` ★ | id; identifier; value; expires_at; created_at; updated_at. Idx identifier |
| `tags` | id; slug (unique); name; kind; canonical_id → tags set null (CHECK ≠ id); created_at |
| `stories` | id; public_id varchar(8) unique; slug; author_id → users restrict; title; synopsis (default ''); cover_url; main_tag_id → tags restrict, not null; status; visibility (default draft); is_ai_assisted; is_mature; word_count; chapter_count; last_chapter_at; created_at; ★updated_at. Idx author_id, (visibility, last_chapter_at desc), main_tag_id |
| `story_tags` | story_id → stories cascade; tag_id → tags restrict. PK(story_id, tag_id); idx tag_id |
| `chapters` | id; story_id → stories cascade; number (CHECK > 0); title (nullable); author_note; word_count; status (default draft); published_at; scheduled_at; ★created_at; updated_at; deleted_at. Unique(story_id, number), tính cả chương đã xoá mềm. Idx (story_id, status, number); partial idx scheduled_at WHERE status='scheduled' |
| `chapter_contents` | chapter_id PK → chapters cascade; doc_json jsonb; html; paragraph_ids text[]; content_hash |
| `chapter_drafts` | chapter_id PK → chapters cascade; doc_json jsonb; updated_at |
| `chapter_revisions` | id; chapter_id → chapters cascade; doc_json; word_count; created_at. Idx (chapter_id, created_at desc) |
| `chapter_fingerprints` | chapter_id PK → chapters cascade; minhash integer[]; simhash bigint (mode bigint) |
| `follows` | user_id → users cascade; target_type; target_id uuid (đa hình, không FK); created_at. PK(user_id, target_type, target_id); idx (target_type, target_id) |
| `library_items` | user_id → users cascade; story_id → stories cascade; shelf; added_at. PK(user_id, story_id) |
| `reading_progress` | user_id → users cascade; story_id → stories cascade; chapter_id → chapters cascade; scroll_pct real (CHECK 0..100); updated_at. PK(user_id, story_id); idx (user_id, updated_at desc) |
| `comments` | id; chapter_id → chapters cascade; story_id → stories cascade; user_id → users restrict; parent_id → comments; paragraph_id text null; body; status text (default 'visible'); created_at. Idx (chapter_id, created_at), parent_id |
| `ratings` | user_id → users cascade; story_id → stories cascade; score smallint (CHECK `score BETWEEN 1 AND 5`); review; created_at. PK(user_id, story_id) <!-- Updated: Validation Session 1 - thang điểm 1–5 --> |
| `notifications` | id; user_id → users cascade; type text; payload jsonb; read_at; created_at. Idx (user_id, created_at desc) |
| `reports` | id; reporter_id → users, nullable (báo cáo tự động không có người báo); target_type text; target_id uuid; reason text; detail; status text (default 'open'); handled_by → users null; created_at. Idx (status, created_at), (target_type, target_id) |
| `moderation_actions` | id; mod_id → users; target_type text; target_id uuid; action text; note; created_at. Idx (target_type, target_id), mod_id |
| `chapter_daily_stats` | chapter_id → chapters cascade; date (date); views, unique_readers, completions (int default 0). PK(chapter_id, date) |
| `badges` | id; code (unique); name; description; created_at |
| `user_badges` | user_id → users cascade; badge_id → badges cascade; awarded_at. PK(user_id, badge_id) |
| `featured_slots` | id; story_id → stories cascade; slot text; starts_at; ends_at (CHECK ends_at > starts_at). Idx (slot, starts_at) |

- Mọi timestamp dùng `timestamp({ withTimezone: true })`.
- `created_at` và `updated_at` default `now()`; `updated_at` thêm `$onUpdate(() => new Date())`.
- Tên index và constraint đặt tường minh.

### Cấu trúc package

```
packages/db/
├── package.json            # @novel-hub/db; exports ".", "./testing"; sideEffects false
├── drizzle.config.ts       # process.loadEnvFile + dbEnvSchema; casing snake_case; out ./drizzle
├── drizzle/                # migration sinh tự động (commit; không lint, không format)
└── src/
    ├── index.ts            # createDb, type Db, schema
    ├── client.ts           # createDb(url, opts)
    ├── migrate.ts          # runMigrations(url) + CLI entry
    ├── schema/{columns,enums,auth,stories,chapters,community,moderation,engagement,index}.ts
    ├── seed/
    │   ├── guard.ts        # assertSeedAllowed({ nodeEnv, databaseUrl })
    │   ├── fixtures.ts     # nội dung mẫu tiếng Việt
    │   ├── seed.ts         # seedDatabase(db, { hashPassword?, password? })
    │   └── cli.ts          # CLI tạm cho phase 3 (phase 5 thay bằng CLI trong packages/auth)
    └── testing/
        ├── index.ts        # createTestDb(), truncateAll(db)
        └── global-setup.ts # migrate TEST_DATABASE_URL (gắn vào project integration ở root)
```

```ts
createDb(url: string, opts?: { max?: number; connectionTimeoutMillis?: number; statementTimeoutMs?: number })
// mặc định: max 10, connectionTimeoutMillis 5000, statement_timeout 15000
```

`packages/shared` thêm `schemas/preferences.ts` (`userPreferencesSchema`, tối thiểu `{ showMature: boolean, mặc định false }`; Giai đoạn 1 mở rộng).

### Seed (gọn) <!-- Red Team: seed scope -->

| Nhóm | Nội dung |
|---|---|
| Tags | ~8 genre, 2 theme, 2 warning (bạo lực, nội dung 18+), 1 tag trùng (`tu-tien` → canonical `tien-hiep`) |
| Users | admin, mod, author, reader, banned; email `*@novelhub.local`, `email_verified = true`. Có `hashPassword` và `password` thì tạo account credential (phase 5) |
| Stories | 3: published ongoing (5 chương: 3 published, 1 scheduled, 1 draft có `chapter_drafts`); published `is_mature` kèm tag warning (2 chương); draft (1 chương draft) |
| Chương published | `chapter_contents` ≥ 300 chữ, HTML `<p data-pid="...">` đơn giản (pipeline sanitize thật có ở Giai đoạn 1) |
| Bộ đếm | `word_count`, `chapter_count`, `last_chapter_at` tính từ chương published chưa xoá |

- `public_id` sinh bằng `generatePublicId`. Gặp lỗi unique (`23505` trên `stories_public_id_key`) thì sinh lại, tối đa 5 lần.
- `slug` sinh bằng `slugify`.

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/db/**` (cây trên) | create | |
| `packages/shared/src/schemas/preferences.ts`, `packages/shared/src/index.ts` | create/modify | |
| `vitest.config.ts` (root) | modify | project `integration`: `globalSetup: ['packages/db/src/testing/global-setup.ts']` |
| `package.json` (root) | modify | `db:generate`, `db:migrate`, `db:seed` (`pnpm --filter @novel-hub/db ...`) |
| `docs/project-spec.md` | modify | bảng mục 4: thêm cột ★ và 3 bảng auth; ghi thang điểm `ratings` 1–5 (step 10) <!-- Updated: Validation Session 1 - đồng bộ spec mục 4 --> |

## Implementation Steps

1. Cài `drizzle-orm@0.45.3 pg` (dev: `drizzle-kit@0.31.11 @types/pg tsx`).
2. Viết `columns.ts`, `enums.ts` và 6 file schema theo bảng trên.
3. `client.ts`: tạo `new Pool({ connectionString, max, connectionTimeoutMillis, options: '-c statement_timeout=...' })`, rồi `drizzle({ client: pool, schema, casing: 'snake_case' })`. Kiểm chứng cách đặt `statement_timeout` qua `pg` (`statement_timeout` trong config hoặc `options`).
4. `drizzle.config.ts`: gọi `process.loadEnvFile` nếu có `.env`, rồi parse bằng `dbEnvSchema`. Không import gì ngoài package `shared`. Nếu drizzle-kit không nạp được TS từ workspace thì đọc `process.env.DATABASE_URL` trực tiếp và kiểm bằng Zod tại chỗ.
5. `pnpm db:generate` sinh `drizzle/0000_<tên>.sql`. **Đọc SQL đã sinh** và đối chiếu từng bảng, enum, index, CHECK. Chỗ nào sai thì sửa schema rồi sinh lại, không sửa SQL. Chỉ được làm vậy khi migration chưa chạy ở đâu ngoài máy dev.
6. `migrate.ts`: dùng `migrate()` của `drizzle-orm/node-postgres/migrator`.
7. `testing/index.ts`:
   - `createTestDb()` đọc `TEST_DATABASE_URL`, throw nếu tên DB không kết thúc `_test`.
   - `truncateAll(db)` chạy `select current_database()` và kiểm hậu tố `_test`. Danh sách bảng lấy từ `information_schema.tables` (schema `public`, bỏ `__drizzle_migrations`), sau đó `TRUNCATE ... RESTART IDENTITY CASCADE`.
   - `testing/global-setup.ts` gọi `runMigrations(TEST_DATABASE_URL)`.
   - Gắn global-setup vào root `vitest.config.ts`.
8. Seed:
   - `guard.ts`, `fixtures.ts`, `seed.ts`: `seedDatabase` chạy trong một transaction.
   - `cli.ts`: kiểm guard, kiểm `users` rỗng hoặc có `--reset`, in tóm tắt.
9. Viết test theo bảng dưới. Chạy `pnpm db:migrate && pnpm db:seed` trên DB dev thật, rồi mở psql kiểm vài truy vấn.
10. Sửa bảng mục 4 của spec (user đã duyệt ở validate 2026-10-04): <!-- Updated: Validation Session 1 - đồng bộ spec mục 4 -->
    - `users`: thêm `email` (unique), `email_verified`, `updated_at`; ghi chú email/xác thực do Better Auth quản lý.
    - Thêm một dòng `sessions`, `accounts`, `verifications`: bảng của Better Auth (phiên, liên kết OAuth/mật khẩu, token xác thực và reset).
    - `stories`: thêm `updated_at`. `chapters`: thêm `created_at`.
    - `ratings`: ghi chú `score` 1–5.
11. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int`. Đánh `[x]` checkbox 3.

## Function / Interface Checklist

- [x] `createDb(url, opts?): { db: Db; pool: Pool }`
- [x] `runMigrations(url): Promise<void>`
- [x] `assertSeedAllowed({ nodeEnv, databaseUrl }): void`
- [x] `seedDatabase(db, opts?: { hashPassword?: (p: string) => Promise<string>; password?: string }): Promise<SeedSummary>`
- [x] `createTestDb()`, `truncateAll(db)`
- [x] `uuidPk()`, `createdAt()`, `updatedAt()`
- [x] `userPreferencesSchema`, `type UserPreferences`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Migration áp lên DB test trống (globalSetup), có đủ 24 bảng | int `schema.int.test.ts` |
| Critical | Insert không truyền id → id là UUID version 7 | int |
| Critical | Trùng (story_id, number) → lỗi unique, kể cả khi chương cũ đã có `deleted_at` | int |
| High | `username` sai định dạng → vi phạm CHECK | int |
| High | Xoá story → chapters, chapter_contents, story_tags bị xoá cascade; xoá user đang có story → bị chặn | int |
| High | `scroll_pct = 150` → vi phạm CHECK; `ends_at <= starts_at` → vi phạm CHECK; `ratings.score` = 0 hoặc 6 → vi phạm CHECK | int |
| Critical | `seedDatabase` trên DB trống chạy thành công; bất biến: bộ đếm story khớp các chương published chưa xoá | int `seed.int.test.ts` |
| High | Seed lần 2 khi `users` có dữ liệu → từ chối; reset → chạy lại được | int |
| Critical | `assertSeedAllowed`: thiếu `NODE_ENV` → từ chối; `production` → từ chối; host không local → từ chối; `development` + localhost → cho phép | unit |
| Critical | `truncateAll` trên DB không đuôi `_test` → throw, không xoá gì | int (dùng DB dev, chỉ kiểm tra throw) |
| High | Pool: Postgres bị `docker compose pause` → truy vấn lỗi trong khoảng `connectionTimeoutMillis`, không treo | thủ công, ghi vào báo cáo cook |

## Dependency Map

- Cần phase 2 (Postgres 18, DB `_test`, env) và phase 1 (`slugify`, `generatePublicId`).
- Phase 4 dùng `createDb`. Phase 5 dùng bảng auth và thay CLI seed bằng bản có `hashPassword`. Mọi test int của phase 4–6 dùng `globalSetup` và `truncateAll` ở đây.
- Nếu `auth generate` ở phase 5 cho thấy cột lệch thì sinh migration `0001` (không sửa `0000` nếu đã áp ngoài máy dev).

## Success Criteria

- [x] `drizzle/0000_*.sql` khớp bảng thiết kế (đã đọc và đối chiếu)
- [x] `pnpm db:migrate` + `pnpm db:seed` chạy thành công trên DB dev trống
- [x] Gate 4 lệnh xanh
- [x] Bảng mục 4 của spec đã khớp schema (cột ★, bảng auth, thang điểm `ratings`)
- [x] Checkbox 3 spec = `[x]`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| `casing` không áp lên tên index/constraint | Đặt tên tường minh; đọc SQL sinh ra |
| Bảng auth tự viết lệch Better Auth 1.7.7 | Phase 5 chạy `npx auth@1.7.7 generate` (ghim version, không nạp `.env`) vào thư mục tạm rồi diff; Better Auth cũng tự kiểm schema lúc chạy |
| drizzle-kit không load được config import package JIT | Step 4 có phương án đọc env trực tiếp |
| Cột ★ ngoài spec | User đã duyệt ở validate; step 10 đồng bộ bảng mục 4 của spec |

## Security Considerations

- Guard seed/truncate chỉ cho chạy khi đủ điều kiện an toàn (localhost + `NODE_ENV` tường minh; DB `_test` cho truncate), vì mất dữ liệu là rủi ro số 1 theo spec mục 11.
- Mật khẩu seed chỉ lấy từ env (phase 5); guard đảm bảo không bao giờ seed lên DB không phải local.
- `preferences` luôn đi qua `userPreferencesSchema` khi ghi (từ Giai đoạn 1).

## Kết quả cook (2026-10-04)

- Gate: `pnpm typecheck`, `lint`, `test` (42), `test:int` (29) xanh; `drizzle-kit generate` báo không còn thay đổi.
- Thủ công: pause Postgres → kết nối mới lỗi sau 5 s; kết nối idle lỗi sau 20 s (`query_timeout` = statement_timeout + 5 s).
- Sửa theo code review (`plans/reports/code-reviewer-261004-2136-phase-03-drizzle-schema-review-report.md`):
  - Listener `error` trên từng client (Postgres cắt kết nối đang trong transaction không còn làm crash process; có test).
  - Guard seed từ chối `?host=`/`?hostaddr=` (pg ưu tiên query string hơn host của URL).
  - `query_timeout` + `keepAlive`; CLI chỉ in message lỗi gốc (không lộ tham số SQL).
- User chốt: thêm 11 index cho cột FK chưa có index vào `0000` (sinh lại; DB dev và test đã dựng lại schema).
- Cổng Postgres: container chạy lại theo `POSTGRES_PORT` trong `.env` (5432); `.env` không đổi.
- Còn lại (Low, để giai đoạn sau): `--reset` gồm 2 transaction; migrate chưa có advisory lock; chuỗi/vòng `canonical_id` cần chặn ở service gộp tag; `drizzle.config.ts` đòi `DATABASE_URL` cả khi `generate`; một test int cần DB dev tồn tại (lưu ý khi dựng CI). Truy vấn "mới cập nhật" phải dùng `desc nulls last`.

## Next Steps

Phase 4: Hono + health (dùng `createDb`).
