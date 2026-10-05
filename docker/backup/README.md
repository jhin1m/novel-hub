# Backup Postgres

Script chạy trên **host** (VPS), không chạy trong container. Spec mục 11: dump hằng ngày, giữ 14 bản trên VPS ngoài volume Postgres, bản sao ra bucket R2 riêng, thử restore trước khi mở public rồi mỗi tháng một lần.

- `pg-backup.sh [--local-only] [--keep N]`: kiểm đĩa trống (cần ~3 lần bản dump gần nhất) → `pg_dump -Fc` trong container `postgres` → kiểm toàn bộ archive → `.sha256` rồi `.dump` trong `BACKUP_DIR` → xoá bớt, giữ `BACKUP_KEEP` bản (`--keep N` thay giá trị này cho một lần chạy) → `rclone copy` cả thư mục lên `<RCLONE_REMOTE>/daily/` (chỉ file chưa có trên remote, nên ngày upload lỗi được bù ở lần sau) và so kích thước bản mới → ping healthchecks.io. Lỗi ở bất kỳ bước nào: exit ≠ 0, ping `/fail`, không để lại file dở. `--local-only` chỉ dùng khi cố ý bỏ bản offsite; thiếu `RCLONE_REMOTE` mà không có cờ này thì script báo lỗi.
  - **Dump teo bất thường**: bản mới nhỏ hơn `BACKUP_MIN_RATIO` (mặc định 0.5) lần bản **lớn nhất** đang giữ trong `BACKUP_DIR` → không xoá bản cũ nào, vẫn upload, rồi exit ≠ 0 (ping `/fail`). So với bản lớn nhất chứ không với bản liền trước, nên đêm sau vẫn fail tiếp (bản teo không thành mốc) và các bản tốt không bị xoá dần. Trạng thái này kéo dài mọi đêm cho tới khi người vận hành xác nhận bằng `BACKUP_ACCEPT_SHRINK=1` (xem [Xử lý cảnh báo dump teo](#xử-lý-cảnh-báo-dump-teo)).
  - **Khoá chạy chồng**: Linux dùng `flock -n` trên `BACKUP_DIR/.flock` (kernel tự nhả khi process chết). macOS không có `flock` nên dùng thư mục `BACKUP_DIR/.lock` kèm pid; thư mục khoá chưa có pid được coi là đang giữ, trừ khi cũ hơn 6 giờ.
  - rclone chờ kết nối tối đa 30 giây và đứng im tối đa 5 phút; URL healthcheck đưa vào `curl` qua stdin nên không hiện trong `ps`.
- `restore-test.sh [--no-live] [--remote | FILE]`: kiểm đĩa trống → restore bản mới nhất (local, hoặc tải từ remote và kiểm sha256) vào container Postgres tạm (`--network none`, cùng image với stack), kiểm số migration bằng số entry trong `packages/db/drizzle/meta/_journal.json`, in số dòng các bảng chính so với DB đang chạy, rồi xoá container cùng volume dữ liệu của nó (`docker rm -f -v`). Lỗi khi:
  - `users` hoặc `stories` rỗng trong bản restore (cài mới chưa có dữ liệu: chạy với `ALLOW_EMPTY=1`);
  - bảng rỗng trong bản restore mà DB đang chạy có dữ liệu;
  - không đọc được số liệu DB đang chạy (DB đang tắt, ví dụ lúc khôi phục thật: thêm `--no-live`);
  - `--remote` mà bản mới nhất trên remote cũ hơn `MAX_AGE_H` giờ (mặc định 36, đọc từ tên file): backup đã ngừng chạy.
- `backup.env.example`: mẫu cấu hình host (không phải `.env` của app).

Cần trên host: `docker` (Compose v2+), `rclone`, `curl`, `sha256sum` hoặc `shasum`. Không cần `pg_dump` trên host.

## Cài đặt trên VPS

Đường dẫn ví dụ: repo ở `/opt/novel-hub`, chạy bằng `root` (cần quyền Docker và đọc `/etc/novel-hub`).

1. **Bucket R2 riêng**, ví dụ `novel-hub-pg-backup`; **không** dùng chung bucket ảnh, không bật public access.
2. **Bucket lock (bắt buộc trước khi đánh `[x]` checkbox)**: rule prefix `daily/`, giữ 14 ngày. Làm từ máy cá nhân, không từ VPS: Dashboard (R2 → bucket → Settings → Bucket lock rules) hoặc `wrangler r2 bucket lock add`. Thêm lifecycle rule xoá object prefix `daily/` sau 19 ngày (lock thắng lifecycle nên lifecycle phải dài hơn lock). Bước này **chưa thử** ở staging; làm và kiểm khi có R2 (bước 7).
3. **API token R2** quyền Object Read & Write, giới hạn đúng bucket trên. Token này xoá được object nếu không có lock; không bao giờ cấp quyền sửa cấu hình bucket cho token đặt trên VPS.
4. **rclone**: `apt install rclone` (Ubuntu 24.04 có bản 1.60, đủ dùng) rồi `rclone config --config /etc/novel-hub/rclone.conf` tạo hai remote, kết quả tương đương:

   ```ini
   [r2-backup]
   type = s3
   provider = Cloudflare
   access_key_id = <token access key>
   secret_access_key = <token secret>
   endpoint = https://<account_id>.r2.cloudflarestorage.com
   acl = private
   # Token giới hạn theo bucket không gọi được API tạo/kiểm bucket.
   no_check_bucket = true

   [r2-backup-crypt]
   type = crypt
   remote = r2-backup:novel-hub-pg-backup
   # Giữ tên thư mục rõ để key trên R2 bắt đầu bằng "daily/" (khớp prefix lock);
   # tên file và nội dung vẫn mã hoá.
   directory_name_encryption = false
   password = <do rclone config sinh và obscure>
   password2 = <salt, cũng do rclone config sinh>
   ```

   `chmod 600 /etc/novel-hub/rclone.conf`. **Lưu bản sao section `[r2-backup-crypt]` (hoặc hai mật khẩu gốc) vào trình quản lý mật khẩu, ngoài VPS**: mất mật khẩu crypt là mất toàn bộ backup offsite.

5. **Cấu hình**: `install -m 600 docker/backup/backup.env.example /etc/novel-hub/backup.env`, sửa `COMPOSE_FILE`, `HEALTHCHECK_URL`. Giữ `RCLONE_REMOTE=r2-backup-crypt:` (gốc bucket) để dump nằm ở `daily/`.
6. **Healthchecks.io** (gói miễn phí): tạo check chu kỳ 1 ngày, grace 2 giờ, dán URL ping vào `HEALTHCHECK_URL`.
7. **Chạy tay và kiểm**:

   ```sh
   /opt/novel-hub/docker/backup/pg-backup.sh
   rclone --config /etc/novel-hub/rclone.conf lsf r2-backup:novel-hub-pg-backup/daily/
   /opt/novel-hub/docker/backup/restore-test.sh --remote
   # Kiểm bucket lock: lệnh này phải bị từ chối.
   rclone --config /etc/novel-hub/rclone.conf deletefile "r2-backup:novel-hub-pg-backup/daily/<một object vừa lên>"
   ```

8. **Cron** (`crontab -e` của root). Lịch đã chốt 03:15 giờ Việt Nam; xem múi giờ VPS bằng `timedatectl`:

   `timeout 4h` (coreutils) chặn lần chạy treo giữ khoá sang tận ngày hôm sau; bị cắt thì script exit ≠ 0 và ping `/fail`.

   ```cron
   # VPS chạy Asia/Ho_Chi_Minh:
   15 3 * * * timeout 4h /opt/novel-hub/docker/backup/pg-backup.sh >> /var/log/novel-hub-backup.log 2>&1
   # VPS chạy UTC (03:15 VN = 20:15 UTC hôm trước):
   # 15 20 * * * timeout 4h /opt/novel-hub/docker/backup/pg-backup.sh >> /var/log/novel-hub-backup.log 2>&1
   ```

   Logrotate, `/etc/logrotate.d/novel-hub-backup`:

   ```text
   /var/log/novel-hub-backup.log {
     weekly
     rotate 8
     compress
     missingok
     notifempty
   }
   ```

Theo dõi đĩa bằng `df -h /var/backups`; đĩa chật thì giảm `BACKUP_KEEP`.

## Xử lý cảnh báo dump teo

Healthchecks báo fail, log có dòng `below 0.5 x the largest kept dump ... not pruning`. Mỗi đêm còn ở trạng thái này, `BACKUP_DIR` giữ thêm một bản (không prune), nên để ý `df -h`.

1. Kiểm DB đang chạy: số dòng các bảng chính có tụt bất thường không, có ai vừa xoá dữ liệu lớn không.

   ```sh
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM stories) stories, (SELECT count(*) FROM chapters) chapters"'
   ```

2. **DB hỏng hoặc mất dữ liệu ngoài ý muốn**: làm theo [Khôi phục thật](#khôi-phục-thật), dùng bản lớn trước khi teo (vẫn còn đủ trong `BACKUP_DIR` vì không bị prune). Không chạy `BACKUP_ACCEPT_SHRINK=1`.
3. **Teo là đúng** (xoá spam/dữ liệu thử hàng loạt có chủ đích): xác nhận một lần.

   ```sh
   BACKUP_ACCEPT_SHRINK=1 /opt/novel-hub/docker/backup/pg-backup.sh
   ```

   Lần chạy này prune bình thường và ghi tên bản mới vào `BACKUP_DIR/.shrink-baseline`: từ đó chỉ các bản từ mốc này trở đi được dùng để so. Biến này chỉ đặt trên dòng lệnh, không ghi vào `backup.env` (để vậy thì kiểm tra bị tắt vĩnh viễn).

## Restore thử hằng tháng

Ngày 1 hằng tháng chạy tay và đọc kết quả:

```sh
/opt/novel-hub/docker/backup/restore-test.sh --remote
```

Phải thấy `restore test PASSED`. Lần chạy này cũng chứng minh mật khẩu crypt còn giải mã được và ghi lại thời gian restore (RTO tham khảo).

## Khôi phục thật

0. **Tắt cron backup trước tiên** (`crontab -e`, comment dòng `pg-backup.sh`): nếu không, lần chạy đêm nay sẽ dump DB đang hỏng và xoá bớt bản cũ, có thể đúng bản tốt cần dùng. Bật lại sau khi đã khôi phục xong và kiểm tra.
1. Nếu DB cũ còn đọc được: chụp lại trạng thái hiện tại bằng `pg-backup.sh --local-only --keep 9999` (`--keep` lớn để lần chạy khẩn không xoá bản cũ nào; dump nhỏ bất thường thì script báo lỗi nhưng file vẫn giữ) và xuất `moderation_actions`, `reports` tạo sau thời điểm của bản dump định dùng để mod áp lại. Hành động mod sau bản dump sẽ mất; nội dung đã bị ẩn sau đó sẽ hiện lại.

   ```sh
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy (SELECT * FROM moderation_actions WHERE created_at > '\''<giờ dump UTC>'\'') TO STDOUT WITH CSV HEADER"' > moderation-actions-after-dump.csv
   ```

2. Lấy bản dump và kiểm checksum (bản local trong `BACKUP_DIR` đã có sẵn `.sha256`):

   ```sh
   rclone --config /etc/novel-hub/rclone.conf copy r2-backup-crypt:daily/ /root/restore/ --include 'novel_hub-<timestamp>.dump*'
   cd /root/restore && sha256sum -c novel_hub-<timestamp>.dump.sha256
   ```

3. Dừng web và worker. Tạo lại DB chính rồi restore:

   ```sh
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
   docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < /root/restore/novel_hub-<timestamp>.dump
   pnpm db:migrate
   ```

4. **Purge toàn bộ Cloudflare** (Dashboard → Caching → Purge Everything, hoặc API dưới đây): HTML trong cache đang mang trạng thái mới hơn DB vừa restore. `pnpm cdn:purge -- --story <publicId>` chỉ purge một truyện, không đủ vì không biết URL nào lệch.

   ```sh
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' \
     --data '{"purge_everything":true}'
   ```

5. Dựng lại index tìm kiếm: `pnpm search:reindex` (Meilisearch không cần backup; đây là lúc reindex thật sự cần, vì dữ liệu trong index đang mới hơn DB vừa restore).
6. Bìa: bìa cũ không bị xoá khi đổi bìa, nên `cover_url` trong bản dump vẫn trỏ tới object còn trên MinIO. Chỉ khi MinIO cũng bị restore về bản cũ hơn: kiểm `stories.cover_url` bằng `curl -I`, URL nào không còn thì đặt `cover_url = NULL` (hiện bìa chữ).
7. Bật lại web, worker và cron backup (bước 0). Job trong Redis hoặc dòng `content_events` trỏ tới dữ liệu không còn sẽ được processor bỏ qua (processor đọc trạng thái hiện tại).

## Thử trên staging

Đã thử trên homelab (Ubuntu 24.04, Docker 29, rclone 1.60, `/bin/sh` là dash) và macOS: dump DB dev nạp vào Postgres staging, backup lên remote kiểu thư mục bọc crypt, `restore-test.sh` từ local và `--remote` đều pass. Để thử không cần `rclone.conf`, có thể khai báo remote bằng biến môi trường trong `backup.env`:

```sh
RCLONE_REMOTE=stagingcrypt:
RCLONE_CONFIG_STAGINGCRYPT_TYPE=crypt
RCLONE_CONFIG_STAGINGCRYPT_REMOTE=/path/to/offsite
RCLONE_CONFIG_STAGINGCRYPT_DIRECTORY_NAME_ENCRYPTION=false
RCLONE_CONFIG_STAGINGCRYPT_PASSWORD=<rclone obscure ...>
RCLONE_CONFIG_STAGINGCRYPT_PASSWORD2=<rclone obscure ...>
```
