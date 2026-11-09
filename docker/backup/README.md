# Backup Postgres

Spec mục 11. Hai máy, hai script, không bên nào giữ credential của bên kia theo hướng nguy hiểm:

```
VPS  cron 03:15  pg-backup.sh ──> /var/backups/novel-hub/postgres/novel_hub-<UTC>.dump (+ .sha256)
                                   ▲  chỉ đọc, qua forced command `rrsync -ro` (user nhbackup)
Homelab cron 05:00  pull-offsite-backup.sh ── ssh (Tailscale) ──> nhbackup@vps
    └─> .incoming/ → kiểm tên, tuổi, số lượng, sha256 → PULL_DEST (700/600) → shrink → bản tháng → giữ 30 → ping healthchecks
Hằng tháng, homelab: restore-test.sh --no-live → container Postgres tạm (không mạng)
```

Cứu được gì:

- Lỗi dữ liệu, thao tác nhầm: bản local 14 ngày trên VPS (và 30 ngày trên homelab, kèm 12 bản tháng).
- Mất VPS hoặc hỏng đĩa VPS: bản trên homelab.
- VPS bị chiếm: VPS không có khoá nào tới homelab nên không xoá được bản đã kéo. Nhưng VPS bị chiếm vẫn phục vụ được file giả, nên script kéo tự phòng thủ (không ghi đè, tối đa `PULL_MAX_NEW` dump mới mỗi lần (mặc định 1), từ chối tên thời gian tương lai, file `.sha256` phải đúng một dòng và nêu đúng tên dump, sha256 phải khớp, dump teo thì không xoá bản cũ). Dump đầu tiên kéo được của mỗi tháng còn được giữ riêng trong `PULL_DEST/monthly/` (`PULL_MONTHLY_KEEP`, mặc định 12 tháng, `0` = tắt) và không bị prune hằng ngày, nên VPS bị chiếm cũng không thể đẩy hết bản tốt ra khỏi cửa sổ giữ hằng ngày. Production chốt 2026-10-12: `PULL_KEEP=7`, `PULL_MONTHLY_KEEP=0` (đúng 7 bản; đổi lại là VPS bị chiếm quá 7 ngày mà không ai phát hiện thì có thể mất hết bản tốt).
- Không cứu: homelab và VPS hỏng cùng lúc.

Các file:

- `pg-backup.sh [--keep N]` (VPS): kiểm đĩa trống (cần ~3 lần bản dump gần nhất) → `pg_dump -Fc` trong container `postgres` → kiểm toàn bộ archive → `.sha256` rồi `.dump` (rename nguyên tử) trong `BACKUP_DIR` → giữ `BACKUP_KEEP` bản (`--keep N` thay giá trị này cho một lần chạy; chụp khẩn dùng số lớn để không xoá gì) → ping healthchecks. Lỗi ở bất kỳ bước nào: exit ≠ 0, ping `/fail`, không để lại file dở.
  - Có `BACKUP_GROUP`: thư mục `750`, dump và `.sha256` `640` thuộc group đó (chặn trước khi file lộ tên cuối). Không có: `700`/`600`.
  - **Dump teo bất thường**: bản mới nhỏ hơn `BACKUP_MIN_RATIO` (mặc định 0.5) lần bản **lớn nhất** đang giữ → không xoá bản cũ nào, exit ≠ 0 (ping `/fail`), mỗi đêm cho tới khi người vận hành xác nhận (xem [Xử lý dump teo](#xử-lý-dump-teo)).
  - **Khoá chạy chồng**: `flock -n` trên `BACKUP_DIR/.flock` (macOS không có flock: thư mục `BACKUP_DIR/.lock` kèm pid).
- `pull-offsite-backup.sh [--dry-run]` (homelab): xem [Homelab](#homelab-kéo-bản-dump). `--dry-run` chỉ liệt kê dump sẽ kéo.
- `restore-test.sh [--no-live] [FILE]`: mặc định lấy dump mới nhất trong `BACKUP_DIR`, **bắt buộc** có `.sha256` khớp và không cũ hơn `MAX_AGE_H` giờ (mặc định 36, đọc từ tên file; `ALLOW_STALE=1` bỏ kiểm tuổi khi cố ý). Restore vào container Postgres tạm do compose project riêng `novel-hub-restore-test-<pid>` (file `restore-test.compose.yml`, `network_mode: none`, cùng image với stack), kiểm số migration bằng số entry trong `packages/db/drizzle/meta/_journal.json`, in số dòng các bảng chính (so với DB đang chạy nếu không có `--no-live`), rồi `down -v` xoá container và volume. Image postgres lấy từ `RESTORE_IMAGE` nếu đặt, nếu không thì đọc dòng `image: postgres:...` của `COMPOSE_FILE` như văn bản (không cần `.env` production nên chạy được trên homelab). Lỗi khi:
  - `users` hoặc `stories` rỗng trong bản restore (cài mới chưa có dữ liệu: `ALLOW_EMPTY=1`);
  - bảng rỗng trong bản restore mà DB đang chạy có dữ liệu;
  - không đọc được DB đang chạy (thêm `--no-live`, luôn dùng trên homelab).
- `backup.env.example` (VPS), `pull.env.example` (homelab): mẫu cấu hình, không phải `.env` của app.

Cần trên VPS: `docker` (Compose v2), `curl`, `sha256sum`. Cần trên homelab: `rsync`, `ssh`, `flock`, `curl`, `sha256sum`; thêm `docker` để restore thử. Không cần `pg_dump` trên host.

## VPS

Đường dẫn ví dụ: repo ở `/opt/novel-hub`, chạy bằng `root` (cần quyền Docker). Stack production là `docker-compose.prod.yml`.
Trong tài liệu này `dc` = `docker compose -f docker-compose.prod.yml` (như `docs/deployment-guide.md`).

1. **Cấu hình**: `install -d -m 755 /etc/novel-hub && install -m 600 docker/backup/backup.env.example /etc/novel-hub/backup.env`, sửa `COMPOSE_FILE` (đã trỏ `docker-compose.prod.yml`), `HEALTHCHECK_URL`, giữ `BACKUP_GROUP=novelhub-backup`.
2. **Healthchecks.io** (gói miễn phí): check "vps-dump", chu kỳ 1 ngày, grace 2 giờ, dán URL ping vào `HEALTHCHECK_URL`.
3. **Group và user kéo** (cần quyền root):

   ```sh
   groupadd novelhub-backup
   useradd -m -s /bin/sh -G novelhub-backup nhbackup   # forced command vẫn cần shell; `restrict` chặn tương tác
   passwd -l nhbackup                                   # không đăng nhập bằng mật khẩu
   install -d -m 700 -o nhbackup -g nhbackup /home/nhbackup/.ssh
   ```

   `/home/nhbackup/.ssh/authorized_keys` (một dòng; khoá công khai sinh ở bước Homelab; chỉ nhận từ dải Tailscale; chỉ đọc đúng thư mục dump):

   ```text
   restrict,from="100.64.0.0/10",command="/usr/bin/rrsync -ro /var/backups/novel-hub/postgres" ssh-ed25519 AAAA... homelab-pull
   ```

   `chmod 600` file này, owner `nhbackup`. `rrsync` có sẵn ở `/usr/bin/rrsync` trên Ubuntu 24.04 (bản cũ: `/usr/share/doc/rsync/scripts/rrsync`). **Không dùng Tailscale SSH** cho user này: nó bỏ qua `authorized_keys` nên mất forced command. Không thêm `nhbackup` vào sudo hay group `docker`.

4. **Thư mục cha phải cho group đi qua**:

   ```sh
   mkdir -p /var/backups/novel-hub
   chgrp novelhub-backup /var/backups/novel-hub && chmod 750 /var/backups/novel-hub
   ```

5. **Chạy tay và kiểm quyền** (sau lần dump đầu):

   ```sh
   /opt/novel-hub/docker/backup/pg-backup.sh
   stat -c '%a %U:%G %n' /var/backups/novel-hub/postgres /var/backups/novel-hub/postgres/*   # 750 / 640, group novelhub-backup
   sudo -u nhbackup ls /var/backups/novel-hub/postgres                                       # đọc được
   sudo -u nhbackup touch /var/backups/novel-hub/postgres/x                                  # phải bị từ chối
   ```

6. **Cron** (`crontab -e` của root). Lịch đã chốt 03:15 giờ Việt Nam; xem múi giờ VPS bằng `timedatectl`. `timeout 4h` chặn lần chạy treo giữ khoá sang ngày hôm sau (bị cắt thì exit ≠ 0 và ping `/fail`).

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

## Tailscale

Cài Tailscale trên VPS và homelab (cùng tailnet). ACL cho phép homelab tới VPS cổng 22. Trên VPS chạy `tailscale up --accept-dns=false` (VPS dùng chung, không đổi DNS của máy) và **không** thêm `--ssh`. ACL tailnet chỉ cho homelab tới VPS cổng 22 (`tcp:22`), không cho chiều ngược lại hay cổng khác. sshd nghe như hiện có; `from="100.64.0.0/10"` trong `authorized_keys` loại mọi nguồn ngoài Tailscale. Dùng tên máy Tailscale của VPS trong `PULL_SOURCE`.

## Homelab: kéo bản dump

Chạy bằng user thường, không cần root. Repo checkout ở `~/novel-hub` (hoặc chỉ cần thư mục `docker/backup/` kèm `docker-compose.prod.yml` và `packages/db/drizzle/meta/_journal.json` để restore thử).

1. **Khoá riêng cho việc kéo** (không passphrase vì chạy từ cron; rủi ro được bù bằng `rrsync -ro` và `from=`):

   ```sh
   ssh-keygen -t ed25519 -N '' -C homelab-pull -f ~/.ssh/novel-hub-pull
   cat ~/.ssh/novel-hub-pull.pub    # dán vào authorized_keys của nhbackup trên VPS (bước VPS 3)
   ```

2. **Cấu hình**: `install -d -m 700 ~/.config/novel-hub && install -m 600 docker/backup/pull.env.example ~/.config/novel-hub/pull.env`, sửa `PULL_SOURCE` (`nhbackup@<tên-tailscale-vps>:`, dấu `:` cuối bắt buộc), `PULL_DEST`, `PULL_SSH_KEY`, `HEALTHCHECK_URL`. Chọn `PULL_DEST` ngoài mọi thư mục đồng bộ cloud; dump chứa email và hash mật khẩu. Nên đặt trên đĩa mã hoá.
3. **Healthchecks.io**: check "homelab-pull", chu kỳ 1 ngày, grace 2 giờ.
4. **Chạy tay**: `docker/backup/pull-offsite-backup.sh --dry-run` rồi chạy thật. Thư mục đích đầu tiên nhận được tới `PULL_KEEP` dump một lần; các lần sau tối đa `PULL_MAX_NEW` dump mới (mặc định 1) và chỉ dump có tên **mới hơn** dump mới nhất đang giữ. Bỏ lỡ một ngày thì lần sau thấy 2 dump mới và fail: kiểm nguồn rồi chạy tay một lần với `PULL_MAX_NEW=2`. Kết quả: `PULL_DEST` mode `700`, file `600`; `PULL_DEST/monthly/` giữ dump đầu tiên của mỗi tháng.

   Chưa làm: kiểm `pg_restore --list` từng dump mới ngay khi kéo (cần docker trên homelab mỗi đêm). Restore thử hằng tháng bên dưới đã kiểm dump mới nhất đọc được.

5. **Cron** (`crontab -e`), 05:00 giờ Việt Nam, sau cron dump 03:15 (đổi giờ nếu homelab chạy UTC: 22:00 UTC hôm trước):

   ```cron
   0 5 * * * timeout 2h $HOME/novel-hub/docker/backup/pull-offsite-backup.sh >> $HOME/novel-hub-pull.log 2>&1
   ```

Script fail (exit ≠ 0, ping `/fail`) khi: không liệt kê hoặc tải được nguồn; quá `PULL_MAX_NEW` dump mới (thư mục `.incoming` giữ lại để xem); tên dump ở tương lai; thiếu `.sha256`, `.sha256` không nêu đúng tên dump hoặc sha256 sai; dump mới nhất teo; dump mới nhất cũ hơn `MAX_AGE_H`. Dump đã có trong `PULL_DEST` không bao giờ bị ghi đè dù nguồn đổi nội dung.

## Restore thử

Trước khi mở public, rồi ngày 1 hằng tháng, **trên homelab** (kiểm luôn việc kéo về đúng và đọc được):

```sh
BACKUP_DIR=<PULL_DEST> COMPOSE_FILE=$HOME/novel-hub/docker-compose.prod.yml \
  $HOME/novel-hub/docker/backup/restore-test.sh --no-live
```

Phải thấy `restore test PASSED`. Ghi lại dòng `restore took Ns` làm RTO tham khảo. Trên VPS có thể chạy cùng lệnh (bỏ `--no-live` để so số dòng với DB thật) để kiểm bản local.

## Xử lý dump teo

Healthchecks báo fail, log có `below 0.5 x the largest ... dump`. Chưa có gì bị xoá: cả VPS lẫn homelab đều giữ nguyên bản cũ. Mỗi đêm còn ở trạng thái này, cả hai nơi giữ thêm một bản, nên để ý `df -h`.

1. Kiểm DB đang chạy: số dòng các bảng chính có tụt bất thường không, có ai vừa xoá dữ liệu lớn không.

   ```sh
   dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM stories) stories, (SELECT count(*) FROM chapters) chapters"'
   ```

   (`dc` = `docker compose -f docker-compose.prod.yml`.)

2. **DB hỏng hoặc mất dữ liệu ngoài ý muốn**: làm theo [Khôi phục thật](#khôi-phục-thật), dùng bản lớn trước khi teo. Không chạy lệnh chấp nhận.
3. **Teo là đúng** (xoá spam hàng loạt có chủ đích): xác nhận một lần ở **từng nơi** báo lỗi, chỉ trên dòng lệnh, không ghi vào file cấu hình:

   ```sh
   BACKUP_ACCEPT_SHRINK=1 /opt/novel-hub/docker/backup/pg-backup.sh                  # VPS
   PULL_ACCEPT_SHRINK=1 $HOME/novel-hub/docker/backup/pull-offsite-backup.sh         # homelab
   ```

   Lần chạy này prune bình thường và ghi tên bản mới vào `.shrink-baseline` trong thư mục đích; từ đó chỉ các bản từ mốc này trở đi được dùng để so.

## Khôi phục thật

0. **Tắt cron dump trên VPS và cron kéo trên homelab trước tiên** (comment dòng tương ứng): nếu không, lần chạy đêm nay dump DB đang hỏng rồi xoá bớt bản cũ, có thể đúng bản tốt cần dùng. Bật lại sau khi đã khôi phục xong và kiểm tra.
1. Nếu DB cũ còn đọc được: chụp lại trạng thái hiện tại bằng `pg-backup.sh --keep 9999` (`--keep` lớn để lần chạy khẩn không xoá bản cũ nào) và xuất `moderation_actions` tạo sau thời điểm của bản dump định dùng để mod áp lại. Hành động mod sau bản dump sẽ mất; nội dung đã bị ẩn sau đó sẽ hiện lại.

   ```sh
   dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy (SELECT * FROM moderation_actions WHERE created_at > '\''<giờ dump UTC>'\'') TO STDOUT WITH CSV HEADER"' > moderation-actions-after-dump.csv
   ```

2. Lấy bản dump và kiểm checksum. Bản local trên VPS (`/var/backups/novel-hub/postgres`) dùng thẳng được. Nếu VPS mất: lấy từ homelab về máy mới, ví dụ `rsync -t <PULL_DEST>/novel_hub-<timestamp>.dump* root@<vps>:/root/restore/`, rồi:

   ```sh
   cd /root/restore && sha256sum -c novel_hub-<timestamp>.dump.sha256
   ```

3. Dừng web và worker. Tạo lại DB chính rồi restore:

   ```sh
   dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
   dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < /root/restore/novel_hub-<timestamp>.dump
   dc run --rm migrate    # hoặc pnpm db:migrate nếu chạy từ checkout dev
   ```

4. **Purge toàn bộ Cloudflare** (Dashboard → Caching → Purge Everything, hoặc API dưới đây): HTML trong cache đang mang trạng thái mới hơn DB vừa restore. `pnpm cdn:purge -- --story <publicId>` chỉ purge một truyện, không đủ vì không biết URL nào lệch.

   ```sh
   # Nạp hai biến từ .env production (không gõ token vào lệnh, giá trị trong .env không để trong dấu nháy):
   CF_ZONE_ID=$(grep -m1 '^CF_ZONE_ID=' /opt/novel-hub/.env | cut -d= -f2-)
   CF_API_TOKEN=$(grep -m1 '^CF_API_TOKEN=' /opt/novel-hub/.env | cut -d= -f2-)
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' \
     --data '{"purge_everything":true}'
   ```

5. Dựng lại index tìm kiếm: `dc run --rm worker node --import tsx src/scripts/reindex-search.ts` (Meilisearch không cần backup; đây là lúc reindex thật sự cần vì index đang mới hơn DB vừa restore).
6. Bìa: bìa cũ không bị xoá khi đổi bìa, nên `cover_url` trong bản dump vẫn trỏ tới object còn trên MinIO. Chỉ khi MinIO cũng bị restore về bản cũ hơn: kiểm `stories.cover_url` bằng `curl -I`, URL nào không còn thì đặt `cover_url = NULL` (hiện bìa chữ).
7. Bật lại web, worker và các cron (bước 0). Job trong Redis hoặc dòng `content_events` trỏ tới dữ liệu không còn sẽ được processor bỏ qua (processor đọc trạng thái hiện tại).

## Thử trên staging (không cần sshd, cron, sudo)

Dùng shim `ssh` giả chạy đúng forced command của VPS, trên một máy:

```sh
S=$(mktemp -d)
cat > $S/fake-ssh.sh <<EOF
#!/bin/sh
while [ \$# -gt 0 ]; do case "\$1" in -*) shift ;; *) break ;; esac; done
shift  # host
SSH_ORIGINAL_COMMAND="\$*" exec /usr/bin/rrsync -ro $S/vps/postgres
EOF
chmod +x $S/fake-ssh.sh

# Phía VPS: dump vào thư mục thử, nhóm là group hiện tại.
BACKUP_ENV_FILE=/dev/null BACKUP_DIR=$S/vps/postgres BACKUP_GROUP=$(id -gn) docker/backup/pg-backup.sh

# Phía homelab: PULL_RSH thay cho ssh (chỉ để thử).
PULL_ENV_FILE=/dev/null PULL_RSH=$S/fake-ssh.sh PULL_SOURCE=dummy: PULL_DEST=$S/homelab \
  docker/backup/pull-offsite-backup.sh

# Chứng minh -ro: ghi lên nguồn phải bị từ chối.
rsync -e $S/fake-ssh.sh /etc/hostname dummy:

BACKUP_ENV_FILE=/dev/null BACKUP_DIR=$S/homelab COMPOSE_FILE=$PWD/docker-compose.prod.yml \
  docker/backup/restore-test.sh --no-live
```

Đã thử theo cách này: kéo lần đầu (700/600, bản tháng đúng), chạy lại (không kéo gì), ghi bị từ chối, nguồn đổi nội dung dump cũ (đích không đổi), 2 dump mới (fail vì mặc định 1), `.sha256` nêu tên khác hoặc hai dòng (fail), tên năm 2099 (fail), sha256 sai (fail, không move), dump teo (fail không prune; `PULL_ACCEPT_SHRINK=1` pass), `PULL_KEEP` nhỏ (daily bị prune, `monthly/` còn), `PULL_MONTHLY_KEEP=1` (bản tháng cũ bị prune), ping healthchecks lỗi (chỉ cảnh báo), restore thử PASSED.
