# Checklist ra mắt

Danh sách duy nhất, theo thứ tự, cho tới khi mở public. Mỗi dòng: **ai làm** (USER = chủ site, CLAUDE = đã làm trong repo), cách kiểm, kỳ vọng. USER tự đánh `[x]`. Mục 1–11 xong thì USER đánh checkbox "Checklist ra mắt" ở Giai đoạn R trong `docs/project-spec.md`.

Ghi chú vận hành: VPS là `dcn-prod` (dùng chung với các site khác, compose project `novel-hub-prod`). Lệnh `dc` dưới đây là alias `docker compose -f docker-compose.prod.yml` (xem `docs/deployment-guide.md`).

## 1. Hạ tầng

- [x] CLAUDE (2026-10-09): deploy theo `docs/deployment-guide.md` (mục 2–4), image tag `261009`; bí mật mới sinh cho Postgres, Better Auth, Meilisearch. Kiểm: `dc --profile tunnel ps` mọi service `healthy`, `migrate` thoát `0`.
- [x] Tunnel `novel-hub-prod` (id `ae5664d1-69b2-4c2d-9b26-0d0b34796f81`) đã tạo, quản lý từ xa; ingress `saynovel.com` → `http://web:3000`, mặc định 404. Token ở `.env` (`CLOUDFLARE_TUNNEL_TOKEN`), không chép đi đâu khác.
- [x] DNS: CNAME `saynovel.com` → tunnel, proxied, đã tạo.
- [x] CLAUDE (2026-10-09): `dc --profile tunnel up -d --wait`, rồi `curl -sI https://saynovel.com/api/v1/health` → `200`.

## 2. Env production

USER điền `/opt/novel-hub/.env` (`chmod 600`). Bảng suy ra từ guard trong code; "Cả hai" = web và worker. Quy trình và cách sinh bí mật: `docs/deployment-guide.md` mục 3.

| Biến | Ai đọc | Bắt buộc? (guard) | Giá trị mẫu / cách sinh |
| --- | --- | --- | --- |
| `NODE_ENV` | Cả hai | Có (`appEnvSchema`, không mặc định) | `production` |
| `APP_URL` | Cả hai | Có (`appEnvSchema`, URL http/https) | `https://saynovel.com` |
| `BETTER_AUTH_URL` | Web | Có (`authEnvSchema`) | `https://saynovel.com` (bằng `APP_URL`) |
| `BETTER_AUTH_SECRET` | Web | Có, tối thiểu 32 ký tự | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Web | Cặp: cả hai hoặc không cái nào (`requireGooglePair`) | Từ Google Console |
| `DATABASE_URL` | Cả hai (+ `migrate`) | Có, `postgres://` | `postgres://<user>:<pass>@postgres:5432/<db>` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose | Có (compose nội suy) | `openssl rand -hex 16` cho mật khẩu; chỉ có tác dụng khi volume tạo lần đầu |
| `REDIS_URL` | Cả hai | Có, `redis://` | `redis://redis:6379/0` |
| `QUEUE_PREFIX` | Cả hai | Không (mặc định `novelhub`) | `novelhub` |
| `ALLOW_INDEXING` | Web | Không (mặc định `false`) | `false` tới bước 11 |
| `TRUST_CF_IP` | Web | Không (mặc định `false`) | `true` (web chỉ nhận kết nối qua tunnel) |
| `RATE_LIMIT_FACTOR` | Web | Phải bằng 1 ở production (`requireUnitRateLimitFactorInProduction`) | `1` |
| `SMTP_HOST`, `SMTP_FROM` | Worker | Có ở production (`requireSmtpInProduction`); thiếu thì worker không khởi động | Theo nhà cung cấp, mục 3 |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Worker | Không có guard riêng (cổng mặc định 587); gần như luôn cần | Theo nhà cung cấp |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | Web | Có ở production (`loadOptionalEnv`: thiếu hoặc sai thì web không khởi động) | Bucket production riêng, không dùng bucket dev |
| `S3_REGION`, `S3_FORCE_PATH_STYLE` | Web | Không (mặc định `us-east-1`, `true`) | MinIO: giữ mặc định |
| `MEILI_URL` | Cả hai | Có ở production | `http://meilisearch:7700` |
| `MEILI_MASTER_KEY` | Worker, Meili, web (chỉ để so sánh) | Có, tối thiểu 16 byte | `openssl rand -base64 24` |
| `MEILI_SEARCH_KEY` | Web | Có ở production; khác `MEILI_MASTER_KEY` | Lấy sau khi Meili chạy, xem `docs/deployment-guide.md` mục 4 (trường `key` của "Default Search API Key") |
| `CF_ZONE_ID` | Worker | Có ở production, 32 ký tự hex | `92dbe28efce88d7126842ba595f3ddde` (zone `saynovel.com`) |
| `CF_API_TOKEN` | Worker | Có ở production | Token Zone → Cache Purge, giới hạn một zone |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflared | Cần khi dùng profile `tunnel` | Token của tunnel `novel-hub-prod` |
| `IMAGE_TAG` | Compose | Không (mặc định `latest`) | Ngày dựng, ví dụ `20261009` |
| `WORKER_HEARTBEAT_FILE` | Worker | Không; compose tự đặt | Để trống trong `.env` |

- [ ] USER: điền đủ bảng. Kiểm: `dc up -d --wait` không có service restart-loop; `dc logs worker | head` không có lỗi "Biến môi trường không hợp lệ".

## 3. SMTP

Nhà cung cấp: Brevo (SMTP relay `smtp-relay.brevo.com`, cổng 587 STARTTLS, `SMTP_FROM="SayNovel <no-reply@saynovel.com>"`; tên hiển thị SayNovel theo quyết định ở mục 10). Giá trị nằm trong `.env` local (dạng comment), không chép vào docs. App chỉ cần `SMTP_HOST`/`SMTP_FROM` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).

- [x] Chọn Brevo, tạo tài khoản.
- [x] USER: thêm IP production vào Brevo → Security → Authorized IPs (Brevo chặn IP lạ: đăng nhập từ NAS trả `525 5.7.1 Unauthorized IP address`). Đã thêm `144.76.108.5` và `2a01:4f8:192:5304::2`; đăng nhập SMTP từ `dcn-prod` thành công. Đổi VPS/IP thì phải thêm lại.
- [x] USER: xác thực domain `saynovel.com` trong Brevo. DNS (Cloudflare, DNS-only) đã có `brevo-code` TXT, CNAME `brevo1._domainkey` và `brevo2._domainkey`, `_dmarc` TXT `p=none`.
- [ ] USER: điền `SMTP_*` vào `.env` production (mục 2).
- [ ] USER: sau deploy, đăng ký tài khoản bằng email thật và kiểm mail xác thực thật từ production: nhận được, link mở được, không vào spam (mail-tester.com tuỳ chọn). Mail xác thực nằm trong luồng đăng truyện, nên mục này chặn việc mở public.

## 4. Google OAuth

- [x] USER: redirect URI production `https://saynovel.com/api/auth/callback/google` đã thêm.
- [ ] USER: giữ redirect URI dev (`http://localhost:<cổng>/api/auth/callback/google`) trong cùng client.
- [ ] USER: publish consent screen (đưa app khỏi "Testing", nếu không chỉ test user đăng nhập được). Kiểm: đăng nhập Google bằng tài khoản ngoài danh sách test user.

## 5. Cloudflare `saynovel.com`

Zone id `92dbe28efce88d7126842ba595f3ddde`. Chi tiết và lệnh `curl`: `docs/deployment-cloudflare.md`.

- [x] CLAUDE: token trong `.env` kiểm chỉ-đọc: `user/tokens/verify` trả `success`, `status: active`; `GET zones/<zone id>` trả zone `saynovel.com`, `active`. Chưa kiểm quyền Cache Purge (cần gọi API ghi; kiểm bằng bước purge thử bên dưới).
- [ ] USER: SSL/TLS để mặc định (Tunnel không cần chế độ Full); bật Always Use HTTPS.
- [x] CLAUDE (2026-10-09, qua API): Cache Rule `public-html` (edge TTL bypass khi không có header, browser TTL theo origin); kiểm `/` MISS rồi HIT, API DYNAMIC. URL normalization: chưa kiểm, để mặc định. Gốc: theo `deployment-cloudflare.md`.
- [x] CLAUDE (2026-10-09): `CF_ZONE_ID` + `CF_API_TOKEN` trong `.env` production; purge thử một URL qua API trả `success`.
- [ ] USER: kiểm sau deploy: `curl` cuối `deployment-cloudflare.md` (lần hai `HIT` và không `set-cookie`; `?utm_source=x` trả `301` + `no-store`; API `DYNAMIC`/`BYPASS`).
- [ ] USER: sửa thử một chương, log worker có job `purge-urls` thành công, rồi `cf-cache-status` đi `MISS` rồi `HIT`.
- [ ] USER: `www.saynovel.com` redirect về apex (nếu giữ) bằng Redirect Rule; thêm hostname `www` vào tunnel hoặc dùng DNS proxied như mục 6.

## 6. `saynovel.net`

Zone id `e871eec6cd8f5a798b31972201f627ec`. Cách làm: mục "Domain phụ `saynovel.net`" trong `docs/deployment-cloudflare.md`.

- [ ] USER: DNS proxied + Single Redirect 301 → `https://saynovel.com` giữ path và query; `www` của cả hai domain.
- [ ] USER: kiểm `curl -sI 'https://saynovel.net/stories/x?y=1'` → `301`, `location: https://saynovel.com/stories/x?y=1`.

## 7. Tài khoản quản trị

Better Auth chặn client tự đặt `role`, nên cấp mod/admin bằng CLI (chạy được cả khi `NODE_ENV=production`, cần `--yes`; CLI in `host:port/db` đích, không in mật khẩu).

- [ ] USER: đăng ký tài khoản qua web (email thật, đã xác thực).
- [ ] USER chạy trên VPS:

```sh
dc run --rm worker node --import tsx ../../packages/auth/src/scripts/set-user-role.ts --username <username> --role admin --yes
```

Thêm mod: cùng lệnh với `--role mod`. Dev: `pnpm user:set-role --username <username> --role mod`. Role đọc lại ở mỗi request nên có hiệu lực ngay, không cần đăng nhập lại.

- [ ] USER kiểm: menu "Kiểm duyệt" hiện và `/moderation` mở được.

Lưu ý: CLI không ghi `moderation_actions` (cột `mod_id` NOT NULL, CLI không có người thực hiện); kết quả chỉ in ra stdout. Muốn có vết kiểm toán thì xem lại log lệnh của VPS.

## 8. Uptime monitor

- [ ] USER: UptimeRobot, Better Stack hoặc healthchecks.io (gói miễn phí): HTTP GET `https://saynovel.com/api/v1/health` mỗi 5 phút, báo email/Telegram.
- [ ] USER kiểm: `dc stop web` khoảng 6 phút, có cảnh báo, rồi `dc start web`. Healthcheck của Docker chỉ để quan sát, không tự restart; monitor này là cảnh báo thật.

## 9. Backup

- [ ] USER: điều kiện đã xong: cron dump trên VPS, bản kéo offsite về homelab chạy thật, và restore thử thành công (`docker/backup/README.md`; spec §11). Chưa xong thì không mở public.

## 10. Nội dung pháp lý

Kết quả rà `/terms` và `/content-policy` đối chiếu spec: không có sai lệch rõ nên không sửa chuỗi. Đề xuất để USER quyết định:

| Mục | Hiện tại | Đề xuất |
| --- | --- | --- |
| Bản quyền, quyền hiển thị miễn phí, kiếm tiền opt-in (spec §7 "Điều khoản") | Đủ ở `terms_copyright_*`, `terms_free_*` | Giữ |
| Quy định GĐ 2+ (chương rác/thông báo, kéo người ra ngoài, tên chương, nhãn AI, cảnh cáo) | Đủ ở `rules_chapters_*`, `rules_external_*`, `rules_ai_*`, `rules_warnings_*` | Giữ |
| 18+ (spec §7) | `rules_mature_body` liệt kê trang chủ, tag, tìm kiếm, xếp hạng | Thiếu "khu truyện nổi bật", bình luận ở truyện 18+ chỉ cho tài khoản đã bật tuỳ chọn, và noindex; nên bổ sung một câu |
| Tên thương hiệu | Đã chốt 2026-10-09: tên hiển thị "SayNovel" (`app_name` trong `vi.json`); tên dự án/package nội bộ vẫn là `novel-hub` | Giữ |
| Quyền riêng tư (Nghị định 13/2023) | Không có trang | Thêm trang trước khi mở public: dữ liệu thu thập (email, IP cho rate limit, tiến độ đọc), mục đích, cookie phiên, quyền xoá |
| Liên hệ | Không có email liên hệ | Thêm email (ví dụ `support@saynovel.com` qua Cloudflare Email Routing) vào điều khoản và nơi báo bản quyền |
| Gỡ nội dung / xoá tài khoản | `terms_copyright_body` hứa quyền chấm dứt khi tác giả gỡ nội dung | Hiện không thấy chức năng xoá tài khoản; nên nêu cách yêu cầu xoá (qua email liên hệ) |
| Thay đổi điều khoản | `terms_changes_body` hứa thông báo trên trang | Chưa có cơ chế; dùng "Thông báo" trên trang chủ khi cần hoặc đổi câu chữ cho đúng thực tế |
| Tuổi tối thiểu tài khoản | Không nêu (chỉ 18+ cho nội dung) | Cân nhắc nêu tuổi tối thiểu đăng ký |

- [ ] USER: trang quyền riêng tư, email liên hệ; yêu cầu Claude cập nhật `packages/shared/messages/vi.json` nếu cần.

## 11. Mở public

- [ ] USER: mục 1–10 đều xong.
- [ ] USER: `ALLOW_INDEXING=true` trong `.env` rồi `dc up -d web` (restart web); purge `/robots.txt` và Purge Everything.
- [ ] USER: `TRUST_CF_IP=true` đã đặt; `dc logs web | grep 'client IP source'` hiện `cf-connecting-ip`.
- [ ] USER: gửi sitemap `https://saynovel.com/sitemap.xml` trong Google Search Console. Kiểm: `curl -s https://saynovel.com/robots.txt` cho phép crawl và có dòng `Sitemap:`.

## 12. Sau khi mở public

- [ ] USER: theo dõi log 429 của `/sign-in/email` và `/request-password-reset` (rủi ro khoá 24 giờ, `deployment-cloudflare.md`).
- [ ] USER: hai check healthchecks.io (dump trên VPS, kéo trên homelab) luôn xanh.
- [ ] USER: restore thử ngày 1 hằng tháng (`docker/backup/README.md`).
- [ ] USER: tạm dừng tính năng mới 2–4 tuần để sửa lỗi và nghe phản hồi (spec Giai đoạn R).
