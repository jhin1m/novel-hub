# Hướng dẫn deploy production

Một VPS chạy Docker Compose (`docker-compose.prod.yml`), Cloudflare phía trước qua **Cloudflare Tunnel**: VPS chỉ kết nối ra ngoài, không mở cổng 80/443. Kiến trúc và lý do: spec mục 2, 3, 11. Cấu hình cache và purge của Cloudflare: [`deployment-cloudflare.md`](./deployment-cloudflare.md). Backup Postgres: [`docker/backup/README.md`](../docker/backup/README.md).

Các lệnh dưới chạy ở `/opt/novel-hub` trên VPS. Viết tắt cho gọn:

```sh
alias dc='docker compose -f docker-compose.prod.yml'
```

## 1. Yêu cầu VPS và máy chủ thật

- Ubuntu 24.04, Docker Engine + Compose v2 (`docker compose version`). Dựng image trên VPS cần khoảng 2 vCPU / 4 GB RAM và 10 GB đĩa trống; máy nhỏ hơn dùng mục 9.
- Firewall: không mở cổng mới cho site này, giữ nguyên rule hiện có (nginx 80/443 của host phục vụ site khác; site này không dùng chúng, Cloudflare vào qua tunnel). Stack **không publish cổng nào ra host** (web, Postgres, Redis, Meilisearch chỉ trong mạng Docker); kiểm tra bằng `docker compose exec`.
- Kiến trúc CPU của VPS phải trùng máy dựng image (`sharp` có binary riêng theo CPU và glibc). Dựng trên VPS thì luôn đúng.

**Máy chủ production hiện tại (`dcn-prod`)**, kiểm bằng đọc-chỉ:

- Ubuntu 24.04.5 x86_64, 20 vCPU, 62 GB RAM, 1,7 TB đĩa; Docker 29.1.3, Compose 2.40.3. Dựng image ngay trên máy được.
- **Máy dùng chung** với site khác: nginx của host giữ 0.0.0.0:80/443; MariaDB host ở 127.0.0.1:3306/3307; redis-server host ở 127.0.0.1:6379/6380. Vì vậy compose này không publish cổng nào và Redis của stack là container riêng (không dùng Redis host).
- Đã có stack `rap-ai-prod` (app + `cloudflare/cloudflared:2026.10.0` + postgres): cùng mẫu Tunnel, nên giữ nguyên cách này. Stack của site này dùng project `novel-hub-prod` (đặt trong file compose) nên tên container, mạng, volume (`novel-hub-prod_pgdata`...) không đụng `rap-ai-prod`. Mọi lệnh chỉ chạy trong `/opt/novel-hub` với `-f docker-compose.prod.yml`; không `docker rm/prune` ngoài project này.
- Chưa cài Tailscale; `rrsync` có sẵn ở `/usr/bin/rrsync` (dùng cho backup kéo). User deploy hiện là root: vẫn chạy stack từ thư mục riêng `/opt/novel-hub`, không sửa gì của project khác.

## 2. Đưa mã lên

Khi có remote: `git clone <repo> /opt/novel-hub`. Tạm thời, từ máy dev:

```sh
# Một lần, trên VPS: thư mục gốc thuộc root, không ai khác ghi được.
ssh vps 'install -d -m 755 -o root -g root /opt/novel-hub'

rsync -rlt --delete --chown=root:root --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r,F+X \
  --exclude node_modules --exclude .git --exclude '.env*' --exclude plans --exclude .claude --exclude CLAUDE.local.md \
  --exclude .output --exclude test-results --exclude playwright-report \
  ./ root@vps:/opt/novel-hub/
```

Lý do: script backup chạy bằng root từ cron, nên mọi file trong cây này phải thuộc root và không ghi được bởi group/other (`--chmod` bỏ bit ghi và giữ bit thực thi của script). `--chown` chỉ có tác dụng khi bên nhận chạy bằng root (nên đích là `root@vps`). `--delete` không xoá `.env` production trên VPS vì nó nằm trong danh sách loại trừ. Kiểm sau khi đẩy:

```sh
ssh vps "stat -c '%U %a %n' /opt/novel-hub /opt/novel-hub/docker/backup/*.sh"   # root 755, mọi script root 755
```

Không đẩy `.env` của dev lên VPS (`.dockerignore` cũng không đưa nó vào image). Rollback dùng tag image (mục 8), không cần lịch sử git trên VPS.

## 3. `.env` production

Tạo `/opt/novel-hub/.env`, `chmod 600 .env`. Compose đọc file này vừa để nội suy biến vừa làm `env_file` cho web và worker (đổi file khác bằng `APP_ENV_FILE`, `--env-file`). Bí mật chỉ nằm ở đây, không vào image. Sinh bí mật: `openssl rand -base64 32` (`BETTER_AUTH_SECRET`), `openssl rand -base64 24` (`MEILI_MASTER_KEY`), `openssl rand -hex 16` (`POSTGRES_PASSWORD`).

| Biến | Giá trị / ràng buộc |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL`, `BETTER_AUTH_URL` | `https://saynovel.com` (bằng nhau) |
| `ALLOW_INDEXING` | `false` cho tới khi quyết định mở public |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | tên và mật khẩu mới; chỉ có tác dụng khi volume tạo lần đầu |
| `DATABASE_URL` | `postgres://<user>:<password>@postgres:5432/<db>` (khớp ba biến trên; ký tự đặc biệt trong mật khẩu phải percent-encode, nên dùng `openssl rand -hex`) |
| `REDIS_URL` | `redis://redis:6379/0` |
| `QUEUE_PREFIX` | `novelhub` |
| `BETTER_AUTH_SECRET` | tối thiểu 32 ký tự |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | cả hai hoặc không cái nào; redirect URI `https://saynovel.com/api/auth/callback/google` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | đủ thông tin; worker không khởi động nếu thiếu `SMTP_HOST`/`SMTP_FROM` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | bucket production (không dùng chung bucket dev) |
| `CF_ZONE_ID`, `CF_API_TOKEN` | cả hai; token chỉ quyền Zone → Cache Purge |
| `MEILI_MASTER_KEY` | tối thiểu 16 byte |
| `MEILI_URL` | `http://meilisearch:7700` |
| `MEILI_SEARCH_KEY` | khác `MEILI_MASTER_KEY`; chỉ lấy được sau khi Meilisearch chạy (mục 4) |
| `TRUST_CF_IP` | `true` (an toàn vì web không nhận kết nối ngoài tunnel, xem `deployment-cloudflare.md`) |
| `RATE_LIMIT_FACTOR` | `1` (khác 1 thì web không khởi động) |
| `CLOUDFLARE_TUNNEL_TOKEN` | token tunnel (mục 5); coi như bí mật |
| `IMAGE_TAG` | tag image của lần deploy (mặc định `latest`); **nguồn duy nhất** là dòng này trong `.env`: sửa file, không `export` |

Mỗi service bị đặt rỗng các bí mật nó không dùng: web không giữ `CF_API_TOKEN`, `SMTP_PASS`, `POSTGRES_PASSWORD`, `CLOUDFLARE_TUNNEL_TOKEN`; worker không giữ `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `S3_SECRET_ACCESS_KEY`, `POSTGRES_PASSWORD`, `CLOUDFLARE_TUNNEL_TOKEN` (app chỉ đọc mật khẩu Postgres qua `DATABASE_URL`; token tunnel chỉ cloudflared dùng). Web **vẫn** giữ `MEILI_MASTER_KEY`: chỉ để từ chối khi `MEILI_SEARCH_KEY` bằng khoá master, không dùng để ghi.

## 4. Lần đầu

```sh
# Đặt IMAGE_TAG=<yymmdd> trong .env (mục 3), rồi:
dc build

# Meilisearch trước: khoá tìm kiếm chỉ có sau khi nó chạy.
dc up -d --wait meilisearch
dc exec -T meilisearch sh -c \
  'curl -fsS -H "Authorization: Bearer $MEILI_MASTER_KEY" http://localhost:7700/keys' \
  | jq -r '.results[] | select(.name == "Default Search API Key") | .key'
# (cần `jq` trên VPS: `apt install jq`)
# Chép đúng khoá in ra (chỉ khoá tìm kiếm, không phải khoá admin) vào MEILI_SEARCH_KEY trong .env.

dc up -d --wait                            # migrate chạy trước, rồi web + worker
dc run --rm worker node --import tsx ../../packages/auth/src/scripts/seed-tags.ts
dc run --rm worker node --import tsx src/scripts/reindex-search.ts
```

Lệnh một lần (`run --rm worker ...`) chạy trong thư mục `apps/worker` của image (chứa `tsx`), nên đường dẫn script tính từ đó. `migrate` chạy lại mỗi lần `up` và bỏ qua migration đã áp. `up -d --wait` thoát 0 khi `migrate` đã `Exited (0)` (kiểm trên Compose v5.1.3; Compose 2.40.3 của VPS chưa kiểm). Nếu bản Compose nào đó báo lỗi vì `migrate` đã thoát, dùng `dc up -d`, rồi `dc wait migrate` và `dc ps` (mọi service còn lại `healthy`).

## 5. Cloudflare Tunnel

Việc của chủ site, một lần:

1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel (cloudflared) → đặt tên → copy **token**.
2. Public hostname: `saynovel.com` → Service `HTTP` → `web:3000`. (Tuỳ quyết định: thêm `www.saynovel.com` cùng service và một Redirect Rule về apex.)
3. Dán token vào `CLOUDFLARE_TUNNEL_TOKEN` trong `.env`, rồi:

```sh
dc --profile tunnel up -d --wait
```

Cache Rule, Purge và chuẩn hoá URL: `deployment-cloudflare.md`. Thêm redirect URI Google `https://saynovel.com/api/auth/callback/google` trong Google Console.

`cloudflared` có healthcheck `cloudflared tunnel ready` (endpoint metrics cố định `127.0.0.1:20241` trong container).

## 6. Kiểm sau deploy

```sh
dc exec -T web node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(console.log)"   # {"status":"ok",...}
dc --profile tunnel ps                                           # mọi service healthy, migrate Exited (0)
dc logs web | grep 'client IP source'                            # cf-connecting-ip (lần đầu có request qua domain; `peer` = request không đi qua Cloudflare)
```

Rồi các lệnh `curl` ở cuối `deployment-cloudflare.md` với domain thật (HIT ở lần hai, không `set-cookie`).

Backup: cài cron dump trên VPS và bản kéo offsite về homelab theo `docker/backup/README.md` (VPS: `BACKUP_GROUP`, user `nhbackup`, cron 03:15; homelab: `pull-offsite-backup.sh`, cron 05:00). Phải kéo thật và restore thử thành công trước khi mở public.

## 7. Cập nhật phiên bản

1. Có migration mới: backup trước, vì migration chỉ đi tới và không rollback được: `COMPOSE_FILE=docker-compose.prod.yml docker/backup/pg-backup.sh --keep 9999`.
2. Lấy mã mới (`git pull` hoặc rsync như mục 2).
3. Sửa `IMAGE_TAG=$(date +%y%m%d)` trong `.env` (ví dụ `sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$(date +%y%m%d)/" .env`), rồi `dc build; dc --profile tunnel up -d --wait` (migrate chạy trước web và worker).
4. Bản mới đổi hash file CSS/JS/font (hầu hết bản có đổi giao diện): **Purge Everything** trên dashboard Cloudflare ngay khi web healthy, nếu không HTML cache cũ trỏ tới asset không còn. Không chắc thì cứ purge.
5. Kiểm như mục 6.

## 8. Rollback

Image cũ còn trên máy theo tag (`docker image ls novel-hub-web`). Quay lại bản trước:

```sh
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<tag cũ>/' .env
dc --profile tunnel up -d --no-build --wait
```

Nếu bản mới đã chạy migration không tương thích ngược với bản cũ: khôi phục DB từ backup theo mục "Khôi phục thật" của `docker/backup/README.md`, rồi chạy image cũ. Purge Everything sau rollback đổi asset.

## 9. Dựng image ở nơi khác (VPS nhỏ)

Dựng ở máy cùng kiến trúc CPU (ví dụ NAS), chuyển sang VPS, không dựng lại:

```sh
IMAGE_TAG=<tag> docker compose -f docker-compose.prod.yml build   # máy dựng: biến này chỉ cho lệnh build
docker save novel-hub-web:<tag> novel-hub-worker:<tag> | ssh vps docker load
# trên VPS: đặt IMAGE_TAG=<tag> trong .env rồi
dc --profile tunnel up -d --no-build --wait
```

## 10. Vận hành

- Log: `dc logs -f web` (hoặc `worker`). Docker giữ 10 MB x 3 file mỗi service. Dung lượng Docker: `docker system df`; dọn image cũ theo tag khi cần.
- Healthcheck chỉ báo trạng thái và điều kiện `depends_on`; Docker **không tự restart** container unhealthy (chỉ restart khi process thoát). Cảnh báo thật là dịch vụ uptime bên ngoài gọi `/api/v1/health`.
- Worker không có HTTP: healthy khi file heartbeat (`/tmp/worker-heartbeat`) được ghi trong 90 giây gần nhất, và ghi khi kết nối Redis của worker còn `ready`.
- Dừng sạch: `dc stop worker` (SIGTERM, chờ job đang chạy tối đa 30 giây). Tắt hết: `dc --profile tunnel down` (giữ volume; **không** thêm `-v`, nó xoá dữ liệu).
- Giới hạn RAM (máy dùng chung, nên mỗi service có `mem_limit` cứng): web 1g, worker 1g, migrate 512m, Postgres 2g, Meilisearch 2g, Redis 768m (`maxmemory 512mb`, chính sách `noeviction` vì BullMQ; đầy thì ghi lỗi chứ không xoá key hàng đợi), cloudflared 256m. Tất cả có `no-new-privileges`. Mức dùng lúc rảnh trên máy thử: worker ~165 MiB, web ~70 MiB, Postgres ~40 MiB, Meilisearch ~35 MiB, Redis ~7 MiB. Xem bằng `docker stats --no-stream`; chỉ nâng một giới hạn khi thấy service sát trần.

## 11. CI

`.github/workflows/ci.yml` chạy cho mỗi pull request và mỗi push lên `main`, hai job song song:

- `check`: `pnpm format:check`, `typecheck`, `lint`, `test` (unit).
- `integration`: `pnpm test:int` trên Postgres 18, Redis 8, Meilisearch 1.54 dựng bằng service container (cùng image với `docker-compose.yml`). Test S3 tự bỏ qua vì CI không có endpoint S3.

CI **không** chạy `pnpm test:e2e` (cần trình duyệt Playwright và cả stack dịch vụ); gate local vẫn bắt buộc e2e trước khi merge. Workflow không dùng secret nào; khoá Meilisearch trong YAML chỉ dành cho container tạm.

Bật CI (việc của chủ repo; máy staging đã tắt push URL):

1. Tạo repo GitHub (private), bật lại push URL, push nhánh và mở một PR thử.
2. Xác nhận cả hai job `check` và `integration` xanh ở lần chạy đầu.
3. Settings → Branches: bật branch protection cho `main`, bắt buộc hai check `check` và `integration`.
