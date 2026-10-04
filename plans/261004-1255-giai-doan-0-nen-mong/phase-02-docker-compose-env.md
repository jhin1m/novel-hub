---
title: "Phase 2: Docker Compose và .env.example"
status: completed
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Docker Compose và .env.example

Spec checkbox: `Docker Compose: postgres, redis, meilisearch, minio; .env.example đầy đủ.`
→ Theo quyết định của user: **compose không có minio**. Cả dev lẫn production dùng server MinIO có sẵn qua biến `S3_*` (user cung cấp thông tin khi Giai đoạn 1 cần). Checkbox trong spec được sửa cho khớp.

## Context Links

- Spec mục 2 (dòng "Lưu trữ ảnh"), 3 (cây thư mục, `docker-compose.yml`), 5, 11 (Redis AOF, log, healthcheck, backup)
- `plans/reports/researcher-261004-1954-infra-tooling-bullmq-report.md` (mục Docker Compose, `.env.example`)

## Overview

- `docker-compose.yml` cho hạ tầng dev: postgres, redis, meilisearch. Mỗi service có healthcheck, giới hạn log, chỉ bind `127.0.0.1`.
- `.env.example` liệt kê đủ biến, mỗi biến có mô tả.
- Env loader dựng từ các **mảnh schema Zod** ghép lại; mỗi consumer chỉ ghép mảnh mình cần.
- Sửa spec theo các quyết định đã chốt.

`web` và `worker` chạy trên host khi dev. Container cho chúng làm khi deploy production, ngoài Giai đoạn 0 (ghi chú trong `plan.md`).

## Key Insights

- Postgres 18 có sẵn `uuidv7()`. Image PG18 đổi PGDATA → mount volume ở `/var/lib/postgresql`, **không** phải `/var/lib/postgresql/data`.
- BullMQ yêu cầu Redis `maxmemory-policy noeviction`; spec yêu cầu bật AOF.
- Script trong `/docker-entrypoint-initdb.d` và các biến `POSTGRES_*` chỉ có tác dụng khi volume còn trống.
- `process.loadEnvFile()` của Node 24 **không nội suy** `${VAR}`, Docker Compose thì có (red team đã kiểm trên Node 24.18) → `.env.example` ghi URL dạng literal. <!-- Red Team: env interpolation -->
- Env tách mảnh để `drizzle.config.ts` chỉ cần `DATABASE_URL` và worker không đòi biến auth. <!-- Red Team: env contracts -->

## Requirements

- Functional:
  - `pnpm infra:up` (= `docker compose up -d --wait`) đưa cả 3 service về `healthy`.
  - DB `novel_hub` và `novel_hub_test` tồn tại sau lần khởi tạo đầu.
  - `loadServerEnv(schema, opts)`:
    - nạp `.env` ở gốc repo nếu file tồn tại và `opts.loadFile !== false`;
    - parse bằng Zod;
    - lỗi thì **throw** `Error` liệt kê tên biến, không in giá trị. Không bao giờ `process.exit`; CLI entry tự quyết định thoát.
  - `.env.example` có mọi biến của Giai đoạn 0 và các biến đã biết của Giai đoạn 1 (S3, Meili), mỗi biến có comment mô tả.
- Non-functional: không có secret thật trong repo; mọi port chỉ bind localhost.

## Architecture

```yaml
# docker-compose.yml (phác thảo)
x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

services:
  postgres:
    image: postgres:18-alpine        # ghim minor khi triển khai (vd. 18.6-alpine)
    environment: POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB (bắt buộc qua ${VAR:?})
    volumes:
      - pgdata:/var/lib/postgresql
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    ports: ["127.0.0.1:5432:5432"]
    healthcheck: pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB
  redis:
    image: redis:8-alpine
    command: redis-server --appendonly yes --appendfsync everysec --maxmemory-policy noeviction
    volumes: [redisdata:/data]
    ports: ["127.0.0.1:6379:6379"]
    healthcheck: redis-cli ping
  meilisearch:
    image: getmeili/meilisearch:v1.54   # kiểm chứng tag khi triển khai
    environment: MEILI_MASTER_KEY (${MEILI_MASTER_KEY:?}), MEILI_ENV (${MEILI_ENV:-development}), MEILI_NO_ANALYTICS=true
    volumes: [meilidata:/meili_data]
    ports: ["127.0.0.1:7700:7700"]
    healthcheck: wget/curl http://localhost:7700/health (kiểm chứng tool có trong image)
  # mọi service: restart: unless-stopped, logging: *logging
volumes: { pgdata, redisdata, meilidata }
```

Env (`@novel-hub/shared/env`, subpath riêng để không lọt vào bundle client):

```ts
// phác thảo — mỗi mảnh là một z.object, ghép bằng .extend(other.shape)
export const appEnvSchema   = z.object({ NODE_ENV: z.enum(['development','test','production']), APP_URL: z.url() });
export const dbEnvSchema    = z.object({ DATABASE_URL: z.url() });
export const testEnvSchema  = z.object({ TEST_DATABASE_URL: z.url(), TEST_REDIS_URL: z.url() });
export const redisEnvSchema = z.object({ REDIS_URL: z.url() });
// phase 5 thêm: authEnvSchema, smtpEnvSchema (+ refine production)
export function loadServerEnv<S extends z.ZodType>(schema: S, opts?: { env?: NodeJS.ProcessEnv; loadFile?: boolean }): z.infer<S>
export function findRepoRoot(start?: string): string   // đi ngược tới thư mục có pnpm-workspace.yaml
```

- `NODE_ENV` **không có default** trong schema. Lệnh `dev`/`test` đặt nó tường minh trong script; `.env.example` ghi `NODE_ENV=development`. <!-- Red Team: fail-open guards -->
- Consumer ghép: web = app + db + redis (+ auth + smtp ở phase 5); worker = app + redis + smtp (phase 6); `drizzle.config.ts` và migrate = db; seed = app + db.

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `docker-compose.yml` | create | 3 service, healthcheck, x-logging, volumes |
| `docker/postgres/init/01-create-test-db.sh` | create | `CREATE DATABASE "${POSTGRES_DB}_test"` (chmod +x) |
| `docker/postgres/init/README.md` | create | init chỉ chạy khi volume trống; cách tạo DB test bằng tay; `POSTGRES_*` đổi sau lần đầu không có tác dụng |
| `.env.example` | create | xem bảng biến |
| `packages/shared/src/env.ts` | create | các mảnh schema, `loadServerEnv`, `findRepoRoot` |
| `packages/shared/src/env.test.ts` | create | unit |
| `packages/shared/package.json` | modify | export `./env` |
| `package.json` (root) | modify | scripts `infra:up`, `infra:down`, `infra:logs` |
| `docs/project-spec.md` | modify | xem step 7 |

Biến trong `.env.example` (giá trị mẫu chỉ cho local, secret để trống, URL viết literal):

| Nhóm | Biến | Mô tả |
|---|---|---|
| Runtime | `NODE_ENV`, `APP_URL` | `development`; `http://localhost:3000` |
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | compose dùng; chỉ áp dụng khi volume khởi tạo lần đầu |
| | `DATABASE_URL`, `TEST_DATABASE_URL` | URL literal, phải khớp `POSTGRES_*`; tên DB test kết thúc `_test` |
| Redis | `REDIS_URL`, `TEST_REDIS_URL` | test/e2e dùng DB index `/1` |
| Queue | `QUEUE_PREFIX` | tiền tố key BullMQ (mặc định `novelhub`); dùng từ phase 6 |
| Meilisearch | `MEILI_MASTER_KEY`, `MEILI_URL`, `MEILI_ENV` | key ≥ 16 byte; production đặt `MEILI_ENV=production`; app dùng từ Giai đoạn 1 |
| S3 (MinIO có sẵn) | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | dev dùng **bucket riêng**, không trỏ bucket production; dùng từ Giai đoạn 1 |
| Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret ≥ 32 ký tự (`openssl rand -base64 32`); Google để trống thì tắt provider; dùng từ phase 5 |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | dev để trống `SMTP_HOST` → in link ra log; production bắt buộc; dùng từ phase 5 |
| Seed | `SEED_USER_PASSWORD` | chỉ dev; dùng từ phase 5 |

## Implementation Steps

1. Viết `docker-compose.yml` theo phác thảo. Biến bắt buộc dùng `${VAR:?message}` để compose báo lỗi rõ khi thiếu `.env`.
2. `docker/postgres/init/01-create-test-db.sh` chạy `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -c "CREATE DATABASE \"${POSTGRES_DB}_test\""`. Viết kèm README.
3. Viết `.env.example` theo bảng.
4. Viết `packages/shared/src/env.ts` và test.
5. Thêm root scripts:
   - `"infra:up": "docker compose up -d --wait"`
   - `"infra:down": "docker compose down"`
   - `"infra:logs": "docker compose logs -f"`
6. Chạy thật:
   - `cp .env.example .env`, điền giá trị dev, rồi `pnpm infra:up`.
   - `docker compose ps`: cả 3 service `healthy`.
   - `docker compose exec postgres psql -U ... -c 'select uuidv7()'`: UUID trả về có ký tự version là `7`.
   - `\l`: thấy `novel_hub_test`.
   - `docker compose exec redis redis-cli config get appendonly` trả `yes`.
7. Sửa spec (đã được user duyệt ngày 2026-10-04):
   - Mục 2, dòng "Lưu trữ ảnh": `S3-compatible (MinIO tự host, server có sẵn) | Bìa truyện, avatar. Dev và production dùng cùng server MinIO; dev dùng bucket riêng`.
   - Mục 3, comment dòng `docker-compose.yml`: `postgres, redis, meilisearch (dev); web, worker thêm khi deploy`.
   - Mục 5, checkbox Giai đoạn 0: `Docker Compose: postgres, redis, meilisearch (MinIO dùng server có sẵn); .env.example đầy đủ.` → đánh `[x]`.
   - Mục 5, Giai đoạn 1: thêm checkbox `Rate limit Redis theo user và IP: đăng ký, đăng nhập, quên mật khẩu, tạo truyện, đăng chương, bình luận, báo cáo (mục 7).` Đặt ngay trước checkbox "Kiểm tra trùng lặp khi đăng chương...".
   - Mục 11: thay "Ảnh trên R2 không cần backup riêng." bằng "Ảnh trên MinIO tự host: server MinIO đã có script backup file hằng ngày do user vận hành."
8. Chạy gate: `pnpm typecheck && pnpm lint && pnpm test`.

## Function / Interface Checklist

- [x] `appEnvSchema`, `dbEnvSchema`, `testEnvSchema`, `redisEnvSchema`
- [x] `loadServerEnv(schema, opts?)`: trả object đã parse; throw `Error` chỉ liệt kê tên biến
- [x] `findRepoRoot(start?: string): string`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Thiếu `DATABASE_URL` → throw; message có tên biến và không có giá trị của biến nào | unit |
| Critical | Thiếu `NODE_ENV` → lỗi, không tự lấy mặc định | unit |
| High | Ghép `appEnvSchema.extend(dbEnvSchema.shape)`: thiếu một biến của mảnh nào cũng lỗi | unit |
| High | `dbEnvSchema` riêng: chỉ cần `DATABASE_URL`, không đòi `APP_URL`/`REDIS_URL` | unit |
| Medium | `loadFile: false` → không đọc file | unit (truyền `env` object, không đụng file thật) |
| Critical | 3 service `healthy`, `uuidv7()` chạy, DB test tồn tại, AOF bật | thủ công (step 6), ghi vào báo cáo cook |

## Dependency Map

- Cần phase 1 (workspace, `@novel-hub/shared`, zod).
- Phase 3 dùng `dbEnvSchema`, `testEnvSchema`, DB test. Phase 4 dùng `redisEnvSchema`. Phase 5 thêm `authEnvSchema`, `smtpEnvSchema`. Phase 6 dùng `QUEUE_PREFIX`, `TEST_REDIS_URL`.

## Success Criteria

- [x] `pnpm infra:up` → 3 service healthy
- [x] `select uuidv7()` chạy được trong Postgres
- [x] DB `*_test` tồn tại
- [x] `.env.example` đủ các biến trong bảng; `git check-ignore .env` trả về `.env`
- [x] Gate xanh; spec đã sửa theo step 7; checkbox 2 = `[x]`

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Volume `pgdata` đã có từ trước nên init script không chạy | README hướng dẫn tạo tay hoặc `docker compose down -v` |
| Image Meili không có `curl`/`wget` | Khi triển khai, chạy `docker compose exec meilisearch sh -c 'command -v curl wget'` rồi dùng tool có sẵn. Nếu không có cái nào thì báo user trước khi đổi image |
| `noeviction` + Redis đầy → lệnh ghi lỗi | Chấp nhận ở dev; production cần giám sát bộ nhớ (ghi vào phần hardening khi deploy) |
| Dev vô tình trỏ S3 vào bucket production | Comment cảnh báo trong `.env.example`; Giai đoạn 1 kiểm tra tên bucket khi khởi động |

## Security Considerations

- Không commit `.env`; `.env.example` không chứa secret thật.
- Port chỉ bind `127.0.0.1`.
- Lỗi env không in giá trị biến.
- `MEILI_MASTER_KEY` bắt buộc cả ở dev; `MEILI_ENV` lấy từ env để production không chạy chế độ development.
- Role DB riêng cho app, mật khẩu Redis, chỉ cho Cloudflare vào origin: làm khi dựng compose production, không thuộc Giai đoạn 0 (ghi trong `plan.md`).

## Next Steps

Phase 3: schema Drizzle, migration đầu tiên, seed.

## Kết quả cook (2026-10-04)

- Lệch plan, user chốt: cổng host đổi được qua env (`POSTGRES_PORT`, `REDIS_PORT`, `MEILI_PORT`, mặc định 5432/6379/7700) vì máy dev đã có Redis khác ở 6379. `.env` dev dùng `REDIS_PORT=6380`.
- Image ghim: `postgres:18.6-alpine`, `redis:8.10-alpine`, `getmeili/meilisearch:v1.54` (có `curl` cho healthcheck).
- `loadServerEnv`: biến rỗng coi như chưa đặt; truyền `env` hoặc không có gốc repo thì không nạp `.env`; lỗi refine in kèm message; URL kiểm giao thức.
- Healthcheck Postgres dùng TCP (`-h 127.0.0.1`) để không báo healthy khi init script còn chạy.
- Kiểm thật: 3 service healthy, `uuidv7()` ra version 7, có `novel_hub_test`, Redis AOF + `noeviction`, Meili 401 khi không có key. Gate xanh (31 unit test).
- Báo cáo: [review](../reports/code-reviewer-261004-2115-phase-02-docker-env-review-report.md), [test](../reports/tester-261004-2115-phase-02-docker-env-report.md).
