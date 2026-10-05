---
phase: 17
title: "Phase 17: Backup offsite và thử restore"
status: pending
priority: P1
effort: "1d (+ thời gian user cấu hình R2/VPS)"
dependencies: [16]
---

# Phase 17: Backup offsite và thử restore

Spec checkbox: `Trước khi mở public: backup Postgres ra ngoài VPS và thử restore thành công (mục 11).`

## Context Links

- Spec mục 11 (pg_dump hằng ngày, giữ 14 bản trên VPS ngoài volume; bản sao ra R2 riêng, không chung bucket ảnh; thử restore vào DB tạm trước khi mở public rồi mỗi tháng; Meilisearch không cần backup; Redis AOF)
- [plan.md](./plan.md) — "Backup: host cron `pg_dump -Fc` + `rclone` lên bucket R2 riêng có bucket lock + restore thử trong container tạm"; "Ngoài phạm vi: deploy production … phase 17 chỉ cần VPS có Postgres chạy"
- Cloudflare R2 bucket locks (đã đọc docs 2026-10-05): chặn xoá và ghi đè object theo prefix trong N ngày, ngày cố định hoặc vô hạn; cấu hình ở Dashboard (R2 → bucket → Settings → Bucket lock rules) hoặc `wrangler r2 bucket lock add`; lock thắng lifecycle rule; sửa lock cần quyền sửa cấu hình bucket (token Object Read & Write không có).
- `plans/reports/researcher-261004-2352-storage-search-infra-report.md` mục 8
- Memory dự án `offsite-backup-deferred` (2026-10-04): backup hiện chỉ nằm trên VPS; bản offsite + thử restore hoãn tới trước khi mở public — **phase này là chỗ thực hiện**.
- Code: `docker-compose.yml:12-31` (service `postgres`, image `postgres:18.6-alpine`, biến `POSTGRES_USER/PASSWORD/DB` lấy từ `.env`), `docker/postgres/init/README.md` (văn phong README ops), `packages/db/drizzle/meta/_journal.json` (số migration), bảng migration mặc định `drizzle.__drizzle_migrations` (`packages/db/src/migrate.ts:14` không đổi schema/tên bảng).

## Overview

- `docker/backup/pg-backup.sh`: dump DB từ container, kiểm archive, giữ 14 bản local, đẩy lên R2 bằng rclone, ping dead-man tuỳ chọn.
- `docker/backup/restore-test.sh`: lấy bản mới nhất (local hoặc từ R2), restore vào container Postgres tạm, kiểm cấu trúc và số dòng bảng chính, dọn dẹp.
- `docker/backup/README.md`: cài rclone, tạo bucket + token R2, cấu hình remote (tuỳ chọn mã hoá), cron, quy trình restore hằng tháng và khôi phục thật.
- Gate thực tế ở máy dev (dump DB dev → restore container tạm, rclone remote kiểu `local`). Checkbox chỉ `[x]` khi user xác nhận đã chạy trên VPS với R2 thật và restore từ R2 thành công.

## Key Insights

- `pg_dump -Fc` đã nén (zlib) và cho phép `pg_restore` chọn lọc → không cần gzip thêm. Chạy **trong** container bằng `docker compose exec -T` để client cùng major version với server (18), không phụ thuộc `pg_dump` trên host.
- Biến `POSTGRES_*` đã có trong container (compose truyền vào), nên lệnh dump dùng `$POSTGRES_USER`/`$POSTGRES_DB` của container (`sh -c '…'`), script không cần đọc `.env` của app hay mật khẩu.
- Ghi ra `*.partial`, kiểm bằng `pg_restore --list` (đọc toàn bộ TOC, phát hiện file cụt), rồi `mv` → không bao giờ có file hỏng mang tên hợp lệ.
- Mã hoá: dùng remote `crypt` của rclone chồng lên remote R2 → script không đổi, không thêm công cụ (`age` chưa cài). Mất mật khẩu crypt = mất backup → README nhấn mạnh lưu ngoài VPS.
- Token R2 "Object Read & Write" **xoá được object** (S3 `DeleteObject`), nên VPS bị chiếm là kẻ tấn công xoá được toàn bộ bản offsite — script không xoá remote không phải là bảo vệ. Bảo vệ thật là **bucket lock bắt buộc** (prefix `daily/`, giữ **14 ngày** — user chốt ở validate): trong thời gian lock không ai xoá/ghi đè được, kể cả token đó; gỡ lock cần quyền sửa cấu hình bucket, token trên VPS không có. Lifecycle xoá sau 19 ngày (> lock, vì lock thắng lifecycle). <!-- Updated: Validation Session 1 - lock 14 ngày --> <!-- Red Team: R2 token claim -->
- Token R2 bị giới hạn theo bucket không gọi được API tạo/kiểm bucket → cấu hình remote `no_check_bucket = true`.
- macOS không có `flock` → khoá chống chạy chồng bằng `mkdir` (atomic, portable).
- So số dòng: bản dump là ảnh chụp lúc dump, DB live tiếp tục đổi → không so bằng nhau tuyệt đối. Kiểm cứng: restore không lỗi, số migration bằng số entry trong `_journal.json` của repo, bảng chính không rỗng khi live không rỗng; in bảng so sánh restored/live để người đọc.

## Requirements

**Functional**

- `pg-backup.sh [--local-only]`:
  - đọc cấu hình từ biến môi trường hoặc file `BACKUP_ENV_FILE` (mặc định `/etc/novel-hub/backup.env`): `COMPOSE_FILE`, `BACKUP_DIR` (mặc định `/var/backups/novel-hub/postgres`), `BACKUP_KEEP` (14), `RCLONE_REMOTE` (ví dụ `r2-backup-crypt:pg`), `HEALTHCHECK_URL` (tuỳ chọn);
  - tên file `novel_hub-YYYYMMDDTHHMMSSZ.dump` (UTC) + `.sha256`;
  - thiếu `RCLONE_REMOTE` mà không có `--local-only` → lỗi (production không được âm thầm bỏ bản offsite);
  - upload `rclone copyto` file và `.sha256` vào `RCLONE_REMOTE/daily/`, sau đó so kích thước remote (`rclone lsjson`) với local;
  - xoá bản local cũ, chỉ giữ `BACKUP_KEEP` bản mới nhất (theo tên, cả `.sha256`);
  - thành công → `curl` `HEALTHCHECK_URL`; lỗi ở bất kỳ bước nào → `HEALTHCHECK_URL/fail` (nếu có), exit ≠ 0, giữ file local nếu dump đã hợp lệ;
  - log có thời gian, kích thước, thời lượng; không in mật khẩu/token.
- `restore-test.sh [--remote | FILE]`:
  - không đối số → bản local mới nhất; `--remote` → tải bản mới nhất từ `RCLONE_REMOTE/daily/` vào thư mục tạm, kiểm `sha256`;
  - image lấy từ `docker compose config --images` (khớp image đang chạy, không hardcode);
  - container tạm `--network none`, không publish port, tên có PID; chờ `pg_isready`;
  - `pg_restore --no-owner --no-privileges --exit-on-error` qua stdin vào DB `restore_test`;
  - kiểm: số dòng `drizzle.__drizzle_migrations` = số entry `_journal.json`; với `users`, `stories`, `chapters`, `chapter_contents`, `reports`: in restored/live; live > 0 mà restored = 0 → lỗi;
  - in thời gian restore (RTO tham khảo); `trap EXIT` luôn xoá container và file tạm; exit ≠ 0 khi có lỗi.
- `README.md`: các bước ở Implementation Steps 4, cron mẫu, logrotate mẫu, quy trình hằng tháng, quy trình khôi phục thật (Implementation Steps 4.8).

**Non-functional**

- `sh` POSIX (`set -eu`), chạy được trên Debian/Ubuntu (VPS) và macOS (thử local); chỉ phụ thuộc `docker`, `rclone`, `curl`, `sha256sum` hoặc `shasum -a 256` (tự chọn).
- Không thêm dependency vào repo, không sửa `docker-compose.yml`, không thêm biến vào `.env.example` của app (cấu hình backup là của host, có file mẫu riêng).

## Architecture

```
cron (host, 03:15 Asia/Saigon)
  └─ pg-backup.sh
       lock mkdir ─▶ docker compose -f $COMPOSE_FILE exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
                  ─▶ $BACKUP_DIR/name.dump.partial ─▶ pg_restore --list (trong container, stdin) ─▶ mv + sha256
                  ─▶ rclone copyto → $RCLONE_REMOTE/daily/  (remote crypt → R2 bucket riêng, no_check_bucket)
                  ─▶ prune local (giữ 14) ─▶ curl HEALTHCHECK_URL | /fail
hằng tháng (tay hoặc cron)
  └─ restore-test.sh --remote
       rclone copyto newest → tmp ─▶ sha256 ─▶ docker run postgres:18.6-alpine --network none
       ─▶ pg_restore → restore_test ─▶ kiểm migration + số dòng ─▶ trap: docker rm -f, rm tmp
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `docker/backup/pg-backup.sh` | create | `chmod +x`; kebab-case |
| `docker/backup/restore-test.sh` | create | `chmod +x` |
| `docker/backup/backup.env.example` | create | biến host của backup, kèm mô tả; không chứa bí mật |
| `docker/backup/README.md` | create | tiếng Việt, theo văn phong `docker/postgres/init/README.md` |
| `.prettierignore` / `.editorconfig` | kiểm | file `.sh` không bị Prettier đụng; không cần sửa nếu đã ổn |
| `docs/project-spec.md` | modify | chỉ đánh `[x]` khi đủ điều kiện; sửa mục 11 nếu chi tiết thực tế khác (ví dụ thêm mã hoá crypt) — hỏi user trước |

## Implementation Steps

1. **`pg-backup.sh`**: parse `--local-only`; nạp `BACKUP_ENV_FILE` nếu tồn tại (`set -a; . file; set +a`); kiểm biến bắt buộc và công cụ (`command -v`). Khoá `mkdir "$BACKUP_DIR/.lock"` + `trap` gỡ khoá. Dump → `.partial` → `pg_restore --list` qua `docker compose exec -T postgres pg_restore --list < file > /dev/null` → `mv` → sha256. Upload + so kích thước. Prune: liệt kê `novel_hub-*.dump` sort theo tên, xoá phần dư cùng `.sha256`. Hàm `ping()` cho healthcheck với `curl -fsS -m 10 --retry 3`. `trap` lỗi gọi `ping /fail`.
2. **`restore-test.sh`**: chọn nguồn, tải/kiểm sha256, lấy image (`docker compose -f "$COMPOSE_FILE" config --images | grep '^postgres'`), `docker run -d --rm --network none -e POSTGRES_PASSWORD=<ngẫu nhiên> -e POSTGRES_DB=restore_test`, chờ `pg_isready` tối đa 60 s, `docker exec -i … pg_restore -U postgres -d restore_test --no-owner --no-privileges --exit-on-error < file`, đếm dòng bằng `psql -At`, so với live qua `docker compose exec -T postgres psql`. Số migration kỳ vọng: đếm `"tag"` trong `packages/db/drizzle/meta/_journal.json` của repo (`grep -c`).
3. **`backup.env.example`** và **README**.
4. **README — hướng dẫn user** (việc user làm, phase không tự làm):
   1. Tạo bucket R2 riêng (ví dụ `novel-hub-pg-backup`), **không** dùng bucket ảnh. **Bắt buộc** thêm bucket lock rule: prefix `daily/`, giữ 14 ngày (Dashboard hoặc `wrangler r2 bucket lock add`, chạy từ máy cá nhân, không từ VPS). Lifecycle xoá object `daily/` sau 19 ngày. <!-- Red Team: bucket lock -->
   2. Tạo API token R2 quyền Object Read & Write, giới hạn đúng bucket đó. Token này xoá được object nếu không có lock — không bao giờ cấp quyền sửa cấu hình bucket cho token trên VPS.
   3. Cài rclone trên VPS (gói của distro hoặc bản chính thức), `rclone config` tạo remote `r2-backup` (`type = s3`, `provider = Cloudflare`, `endpoint = https://<account_id>.r2.cloudflarestorage.com`, `no_check_bucket = true`), rồi remote `r2-backup-crypt` (`type = crypt`, `remote = r2-backup:novel-hub-pg-backup`). Lưu mật khẩu crypt ở trình quản lý mật khẩu, ngoài VPS.
   4. Tạo `/etc/novel-hub/backup.env` (quyền 600) từ file mẫu.
   5. Chạy tay `pg-backup.sh`, xem file trên R2; chạy `restore-test.sh --remote`.
   6. Cron: `15 3 * * * /opt/novel-hub/docker/backup/pg-backup.sh >> /var/log/novel-hub-backup.log 2>&1` (đặt `CRON_TZ=Asia/Saigon` hoặc tính theo giờ VPS) + logrotate; dead-man healthchecks.io (gói miễn phí) cho `HEALTHCHECK_URL`.
   7. Nhắc hằng tháng chạy `restore-test.sh --remote`.
   8. **Khôi phục thật** (runbook):
      1. Nếu DB cũ còn đọc được: xuất `moderation_actions` và `reports` sau thời điểm dump (`COPY … TO STDOUT`) để mod áp lại — hành động mod sau bản dump bị mất, nội dung đã ẩn sau đó sẽ hiện lại.
      2. Dừng web và worker; restore vào DB chính; `pnpm db:migrate`.
      3. **Purge toàn bộ Cloudflare** (Dashboard → Caching → Purge Everything, hoặc `curl -X POST …/zones/$CF_ZONE_ID/purge_cache -H "Authorization: Bearer $CF_API_TOKEN" --data '{"purge_everything":true}'`): HTML cache đang chứa trạng thái mới hơn DB vừa restore (chương/truyện tạo hoặc ẩn sau bản dump). Purge theo URL (`pnpm cdn:purge -- --story <publicId>`, phase 9) không đủ vì không biết URL nào lệch; chỉ dùng để bù cho truyện cụ thể sau này. <!-- Red Team: restore purge -->
      4. Reindex Meilisearch bằng `pnpm search:reindex` (phase 11).
      5. Bìa: phase 2 không xoá bìa cũ nên `cover_url` trong bản dump vẫn trỏ tới object còn trên MinIO. Chỉ khi MinIO cũng bị restore về bản cũ hơn: tìm `stories.cover_url` trỏ tới object không còn (`curl -I` từng URL) và đặt `cover_url = NULL` (hiện bìa chữ). <!-- Red Team: cover after restore -->
      6. Bật lại web, worker. Job trong Redis hoặc dòng `content_events` trỏ tới dữ liệu không còn được processor bỏ qua (processor idempotent, đọc trạng thái hiện tại).
5. **Thử local (gate thực tế của phase)**: `pnpm infra:up && pnpm db:seed`; chạy với `BACKUP_DIR=<scratch>`, `COMPOSE_FILE=<repo>/docker-compose.yml`, `RCLONE_CONFIG_LOCALTEST_TYPE=local`, `RCLONE_REMOTE=localtest:<scratch>/remote` → kiểm file local + "remote", sha256 khớp. Chạy 16 lần (đổi tên bằng cách chờ 1 s hoặc biến thời gian giả) → còn đúng 14 bản. `restore-test.sh` và `restore-test.sh --remote` → pass, container tạm đã bị xoá (`docker ps -a`). Trường hợp lỗi: dừng postgres → script exit ≠ 0, không để lại `.partial` mang tên hợp lệ, khoá được gỡ; cắt cụt file dump → `restore-test.sh FILE` báo lỗi.
6. Kiểm tĩnh: `sh -n` cả hai script; nếu user đồng ý thì chạy `shellcheck` qua `docker run --rm koalaman/shellcheck` (không cài vào repo).
7. Gate repo không đổi code TS nhưng vẫn chạy: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`, cộng `pnpm format:check` (README).
8. **Điều kiện đánh `[x]`**: user xác nhận (dán log tóm tắt) đã (a) bật bucket lock cho `daily/`, và thử xoá một object bằng token của VPS (`rclone deletefile`) → bị từ chối; (b) chạy `pg-backup.sh` trên VPS với R2 thật; (c) `restore-test.sh --remote` pass. Chưa có VPS/R2 → chạy thử toàn bộ (cron, `pg-backup.sh`, `restore-test.sh`, có `--remote` khi đã có bucket R2) trên **homelab staging** (Ubuntu server trên NAS, user tự dựng Docker + Postgres), báo `DONE_WITH_CONCERNS`, để checkbox trống tới khi chạy được trên VPS thật trước khi mở public, nhắc lại theo memory `offsite-backup-deferred`. Xong thật thì cập nhật/xoá memory đó.

## Function / Interface Checklist

- [ ] `pg-backup.sh [--local-only]` (biến: `COMPOSE_FILE`, `BACKUP_DIR`, `BACKUP_KEEP`, `RCLONE_REMOTE`, `HEALTHCHECK_URL`, `BACKUP_ENV_FILE`)
- [ ] `restore-test.sh [--remote | FILE]`
- [ ] `backup.env.example`, `README.md`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Dump DB dev → restore container tạm → migration khớp, bảng chính có dữ liệu | thủ công (step 5) |
| Critical | Upload qua remote `local` → `restore-test.sh --remote` pass, sha256 khớp | thủ công |
| Critical | Trên VPS: dump → R2 thật → restore từ R2 pass | thủ công (user, điều kiện `[x]`) |
| Critical | Token VPS xoá/ghi đè object trong `daily/` → bị từ chối nhờ bucket lock | thủ công (user, điều kiện `[x]`) |
| High | Giữ đúng 14 bản local sau 16 lần chạy | thủ công |
| High | Postgres dừng / rclone lỗi → exit ≠ 0, ping `/fail`, không có file hỏng mang tên hợp lệ, khoá được gỡ | thủ công |
| High | Dump cụt → `restore-test.sh` báo lỗi; container tạm luôn bị xoá kể cả khi lỗi | thủ công |
| High | Thiếu `RCLONE_REMOTE` không có `--local-only` → lỗi rõ ràng | thủ công |
| Medium | Hai lần chạy chồng nhau → lần sau thoát vì khoá | thủ công |
| Medium | `sh -n` / shellcheck sạch | thủ công |

Không có unit/int test tự động: script chỉ chạy trên host có Docker, test bằng Vitest sẽ phải điều khiển Docker từ trong test, nặng và giòn. Kết quả các kịch bản ghi vào báo cáo cook.

## Dependency Map

- Cần: Postgres trong `docker-compose.yml` (Giai đoạn 0), migration đầy đủ của Giai đoạn 1 (phase 5 `0001_content_events`, phase 14 `0002_dedupe_fingerprints`: `lsh_keys`, `content_hash`, `reports_open_auto_key`; `_journal.json` có 3 entry). Runbook dùng lệnh `pnpm search:reindex` (phase 11) và biến `CF_*` (phase 9). Script không phụ thuộc code phase 2–16.
- Cần từ user: VPS có repo + Docker Compose chạy Postgres; tài khoản Cloudflare R2; nơi lưu mật khẩu crypt.
- Sau phase này: mở public được (cùng các checkbox khác); deploy production (container web/worker, Cloudflare rule) là việc riêng chưa có checkbox.

## Success Criteria

- [ ] Hai script + file mẫu + README trong `docker/backup/`
- [ ] Thử local: dump, giữ 14 bản, upload remote giả, restore từ local và remote đều pass, lỗi được báo đúng
- [ ] Bucket lock bật cho `daily/` và đã thử xoá bằng token VPS bị từ chối
- [ ] README có runbook khôi phục thật gồm purge toàn bộ Cloudflare, reindex, lưu ý bìa và hành động mod sau bản dump
- [ ] User xác nhận chạy trên VPS với R2 riêng và restore từ R2 thành công → checkbox `[x]`; memory `offsite-backup-deferred` được cập nhật
- [ ] Gate repo xanh

## Risk Assessment

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Mất mật khẩu crypt → backup vô dụng | Thấp × Rất cao | README bắt lưu ngoài VPS; restore thử từ remote hằng tháng chứng minh còn giải mã được |
| Cron chết âm thầm | TB × Cao | Dead-man `HEALTHCHECK_URL`; log có rotate |
| VPS bị chiếm, kẻ tấn công xoá backup R2 bằng token Object R/W | Thấp × Rất cao | Bucket lock bắt buộc trước khi đánh `[x]`; token VPS không có quyền sửa cấu hình bucket |
| Sau restore, CDN phục vụ HTML lệch DB (nội dung đã ẩn hiện lại hoặc ngược lại) | TB × Cao | Runbook: purge toàn bộ Cloudflare trước khi bật lại web |
| Dump lớn làm đầy đĩa VPS | Thấp × TB | 14 bản `-Fc` nén; README hướng dẫn theo dõi `df`; giảm `BACKUP_KEEP` nếu cần |
| `pg_dump` khoá bảng gây chậm | Thấp × Thấp | `pg_dump` chỉ lấy `ACCESS SHARE`, không chặn ghi; chạy giờ thấp điểm |
| Image Postgres đổi major mà restore dùng image cũ | Thấp × TB | Restore lấy image từ `docker compose config --images` |

Rollback: xoá cron; script không đổi dữ liệu DB chính (chỉ đọc), container tạm tự xoá.

## Security Considerations

- Dump chứa email, hash mật khẩu, token phiên → mã hoá bằng rclone crypt (đề xuất), file local quyền 600 trong thư mục 700, bucket R2 riêng, không công khai.
- `backup.env` quyền 600, không commit; token R2 tối thiểu quyền, scope một bucket. Token Object R/W xoá được object → bucket lock là lớp bảo vệ duy nhất chống xoá, không phải quyền token.
- Container restore `--network none`, mật khẩu ngẫu nhiên, xoá ngay sau khi kiểm.
- Script không in biến bí mật ra log.

## Next Steps

Hết checkbox Giai đoạn 1 → nhắc user chạy `/ak:plan --deep docs/project-spec.md` cho Giai đoạn 2 (không tự lên plan).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Mã hoá bằng rclone crypt: có.
2. Bucket lock `daily/` 14 ngày; lifecycle xoá sau 19 ngày.
3. Chưa có VPS và R2; có homelab staging (Ubuntu server trên NAS, chưa thiết lập). Thử script trên homelab (local trước, `--remote` khi có R2); checkbox 13 chỉ `[x]` khi chạy trên VPS thật trước khi mở public.
4. Dead-man: healthchecks.io gói miễn phí.
5. Lịch 03:15 giờ Việt Nam hằng ngày, restore thử ngày 1 hằng tháng.

