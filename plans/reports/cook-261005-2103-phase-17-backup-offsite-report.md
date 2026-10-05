# Cook phase 17: Backup offsite và thử restore

Ngày 2026-10-05. Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-17-backup-offsite-restore.md`. Môi trường thử theo quyết định "User (2026-10-05, sau phase 16)" mục (c): staging NAS + macOS, remote thư mục bọc rclone crypt thay R2.

## File

| File | Việc |
|---|---|
| `docker/backup/pg-backup.sh` | dump trong container → verify toàn archive → `.dump` + `.sha256` (600, thư mục 700) → prune giữ `BACKUP_KEEP` → `rclone copyto` `<remote>/daily/` + so size → ping healthcheck (`/fail` khi lỗi); khoá `mkdir` + pid, tự gỡ khoá stale |
| `docker/backup/restore-test.sh` | local mới nhất / `--remote` (sha256 bắt buộc) / FILE → container tạm `--network none`, image từ `compose config --images` → `pg_restore --exit-on-error` → kiểm migration = `_journal.json`, bảng chính restored/live; trap xoá container + tmp |
| `docker/backup/backup.env.example` | biến host, không giá trị thật |
| `docker/backup/README.md` | cài đặt VPS (R2, bucket lock, token, rclone + crypt, cron, logrotate, healthchecks.io), restore hằng tháng, runbook khôi phục thật, ghi chú staging |

Không đổi code app, `docker-compose.yml`, `.env.example`, dependency.

## Lệch plan

1. **Crypt và prefix lock**: crypt mặc định mã hoá cả tên thư mục → trên R2 không có prefix `daily/`, lock `daily/` không khớp object nào. Sửa: `directory_name_encryption = false`, `RCLONE_REMOTE=r2-backup-crypt:` (gốc bucket) → key `daily/<tên file mã hoá>`. Script xử lý remote kết thúc bằng `:` (`REMOTE_DAILY`). Đã kiểm layout trên staging.
2. **Verify dump**: `pg_restore --list` chỉ đọc TOC, không bắt được file cụt ở phần dữ liệu → dùng `pg_restore --file=/dev/null` (đọc toàn archive). Đã kiểm: file cắt 40 KB → exit 1 "could not read from input file: end of file".
3. Khoá có ghi pid; khoá của pid đã chết được gỡ tự động (tránh cron chết vĩnh viễn sau reboot/kill -9). `.partial` sót lại được xoá khi đã giữ khoá.
4. Thêm `RCLONE_CONFIG=/etc/novel-hub/rclone.conf` vào mẫu để mọi bí mật backup nằm ở `/etc/novel-hub`.

## Kết quả thử

Staging `ssh nas` (`~/novel-hub-staging`, compose project `novel-hub-staging`, port 127.0.0.1:15432, `/bin/sh` = dash). Dữ liệu: dump DB dev local (users 11, stories 3, chapters 8, chapter_contents 6, reports 0, migration 3) nạp vào staging.

| Kịch bản | Kết quả |
|---|---|
| Backup → remote crypt (tên + nội dung mã hoá, header `RCLONE\0\0`) | pass |
| `restore-test.sh --remote` (kéo về, sha256, restore, migration 3/3, số dòng khớp live) | PASSED |
| `restore-test.sh` (local) | PASSED |
| macOS: backup qua remote `local`, restore local + `--remote` | PASSED |
| 16 lần chạy → còn 14 `.dump` + 14 `.sha256` | pass |
| Thiếu `RCLONE_REMOTE` không `--local-only` | exit 1, thông báo rõ |
| Remote hỏng | exit 1, dump local giữ lại, khoá gỡ |
| Khoá đang giữ bởi pid sống | exit 1, không đụng khoá |
| Khoá stale (pid chết) | gỡ, backup chạy xong |
| Postgres dừng | exit 1, không `.partial`, khoá gỡ |
| Dump cụt → `restore-test.sh FILE` | FAILED đúng, container tạm đã xoá |
| sha256 sai | FAILED đúng |
| Healthcheck (HTTP server tạm) | nhận `GET /ping` khi xong, `GET /ping/fail` khi lỗi; URL chết chỉ cảnh báo, backup vẫn exit 0 |
| Runbook khôi phục thật (DROP/CREATE + pg_restore, `\copy` moderation_actions) trên DB staging | chạy đúng |
| `sh -n`, shellcheck (`koalaman/shellcheck:stable`, `-s sh`) | sạch |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` | xanh (605 test) |

`test:int`/`test:e2e` không chạy: không đụng code app.

## Trạng thái staging

- `~/novel-hub-staging/` (700): `repo/` (compose, `docker/`, `_journal.json`, `.env` sinh ngẫu nhiên), `backup.env` (600, chứa mật khẩu crypt obscure), `rclone.conf` rỗng (cô lập khỏi `~/.config/rclone`), `backups/` (14 dump), `offsite/daily/`.
- Đã `docker compose down` (volume `novel-hub-staging_pgdata` giữ lại). Không container tạm, không cron mới (crontab chỉ còn dòng sẵn có của user).
- Chạy lại: `cd ~/novel-hub-staging/repo && docker compose up -d postgres`, rồi `BACKUP_ENV_FILE=~/novel-hub-staging/backup.env ~/novel-hub-staging/repo/docker/backup/pg-backup.sh`. Xoá hẳn: `docker compose down -v` trong `repo/` rồi xoá thư mục.

## Chưa làm (điều kiện checkbox 13)

- Bucket R2 riêng + bucket lock `daily/` 14 ngày + lifecycle 19 ngày; thử `rclone deletefile` bằng token VPS bị từ chối.
- Chạy `pg-backup.sh` trên VPS với R2 thật, `restore-test.sh --remote` pass.
- Chưa có code review cho phase này.

## Câu hỏi mở

- Spec mục 11 chưa nhắc mã hoá crypt; có muốn thêm một dòng vào spec không (plan nói hỏi trước khi sửa)?
