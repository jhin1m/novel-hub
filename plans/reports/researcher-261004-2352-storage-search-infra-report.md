# Research: storage, search, infra cho Giai đoạn 1 (2026-10-04)

Ghi lại từ kết quả researcher (harness của researcher không cho ghi file). Mục đánh UNVERIFIED chưa đối chiếu docs.

## 0. Versions (npm view, 2026-10-04)
| Package | Version | Ghi chú |
|---|---|---|
| `@aws-sdk/client-s3` | 3.1146.0 | 11 deps trực tiếp, 3.3 MB |
| `aws4fetch` | 1.0.20 | 0 deps, 65 KB |
| `minio` | 8.0.7 | 13 deps |
| `sharp` | 0.35.5 | Node >=20.9; binary qua `@img/*` optional deps, không có install script |
| `meilisearch` | 0.62.0 | 0 deps; Node `^20.19 \|\| >=22.12` |

## 1. S3 client cho MinIO
- Khuyến nghị **`aws4fetch`**: chỉ cần PUT/DELETE file WebP nhỏ; 0 dep; dùng lại được cho R2. Path-style tự dựng URL `${endpoint}/${bucket}/${key}`.
- Fallback `@aws-sdk/client-s3` (`forcePathStyle: true`; SDK mới gửi CRC32 mặc định, cần `requestChecksumCalculation: "WHEN_REQUIRED"` — UNVERIFIED với MinIO).
- Key có hash nội dung `covers/{storyId}/{hash}-600.webp` → `Cache-Control: public, max-age=31536000, immutable`, không cần purge CDN ảnh.
- Delete lỗi: log, bỏ qua (orphan vô hại).

```ts
const s3 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region })
await s3.fetch(`${endpoint}/${bucket}/${key}`, { method: 'PUT', body: buf,
  headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' } })
```

## 2. sharp
- 0.35.5 không có install script → không cần `allowBuilds`. Docker: `node:24-bookworm-slim`. Lockfile build trên macOS cài trên linux: thêm `supportedArchitectures` trong `pnpm-workspace.yaml`.
- sharp có trong mục 2 spec.
```ts
const img = sharp(buf, { limitInputPixels: 40_000_000, failOn: 'error' })
const m = await img.metadata()          // magic bytes, không tin extension
// format ∈ jpeg|png|webp; EXIF orientation 5–8 → hoán đổi w/h trước khi kiểm >= 600x900
sharp(buf, opts).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer()
```
- Metadata/EXIF bị bỏ mặc định (không gọi `keepMetadata`). Ảnh động: lấy frame đầu.
- Giới hạn dung lượng file kiểm trước sharp.

## 3. Hono multipart
- `bodyLimit` (`hono/body-limit`) chỉ gắn route upload, đặt hơi trên 5 MB rồi kiểm `file.size` chính xác.
- `c.req.parseBody()` buffer toàn bộ — chấp nhận ở 5 MB. Zod 4: `z.instanceof(File)`.
- Không tin `file.type`. Kiểm giới hạn body của Nitro ≥ 5 MB.
- `hc` với `File` khó suy type → upload dùng `FormData` + `fetch`.

## 4. Meilisearch
- Client `meilisearch@0.62.0`, tương thích server v1.x.
- Tiếng Việt: Charabia bỏ dấu chữ Latin; có `vietnamese.rs` (xử lý `đ`) — **chưa có docs xác nhận**, cần int test "Kiếm Đạo Độc Tôn" ↔ "kiem dao doc ton". Typo tolerance mặc định (1 lỗi từ 5 ký tự, 2 lỗi từ 9).
- Settings stories: searchable `title, author_name, synopsis`; filterable `tag_slugs, main_tag_slug, status, word_count, is_mature, is_ai_assisted, visibility, author_id`; sortable `last_chapter_at, word_count, chapter_count, created_at`. Authors: searchable `username, display_name`.
- Chỉ index truyện `published`; ẩn/gỡ thì xoá doc.
- Khách / chưa bật `showMature`: server luôn thêm `is_mature = false`, không lấy filter từ client.
- Master key chỉ ở server.
- `updateSettings` idempotent lúc worker boot; task async, phải chờ/kiểm `task.status` (lỗi task không throw).
- Sync: queue `search-sync`, job `{type, id, op}`, `jobId = type:id`; processor đọc row hiện tại từ Postgres rồi upsert/delete (idempotent, không phụ thuộc thứ tự). Enqueue sau commit. Reindex: batch ~1000 vào index tạm rồi `swapIndexes`.

## 5. Rate limit Redis (không thêm dep)
- **Fixed window** bằng 1 Lua script (`INCR` + `PEXPIRE` + `PTTL`). Sliding: YAGNI.
- Key `rl:{action}:{u|ip}:{id}`; kiểm cả user và IP, một bên từ chối là từ chối. Trả `{ allowed, remaining, retryAfterSec }`.
- Tài khoản mới: chọn tier theo tuổi tài khoản (vd. < 3 ngày = chặt); bảng hằng ở `packages/shared`. Đăng ký/đăng nhập chỉ theo IP.
- IP: tin `CF-Connecting-IP` chỉ khi origin chỉ nhận từ Cloudflare → env `TRUST_CF_IP` (chỉ production). `getConnInfo` của Hono không có adapter cho Nitro/srvx → không dựa vào. IPv6 gom về /64.
- Better Auth 1.7.7 có limiter sẵn: `customRules` theo path, `customStorage.consume(key, rule)` → dùng chung Lua limiter (DRY); `advanced.ipAddress.ipAddressHeaders`. Cần kiểm shape `consume` trong type 1.7.7 đã cài. Fallback: Hono middleware trước `auth.handler`.

## 6. Hẹn giờ đăng (BullMQ 6)
- Khuyến nghị **sweeper**, DB là nguồn chuẩn: `queue.upsertJobScheduler('publish-scheduled', { every: 60_000 }, { name: 'sweep-scheduled-chapters' })` gọi lúc worker boot (idempotent, tự hồi khi mất Redis).
- Processor: chọn chương `status='scheduled' AND scheduled_at<=now()` `FOR UPDATE SKIP LOCKED LIMIT 100`, đi qua cùng pipeline `publishChapter` của core; side effect fan-out với `jobId` theo chapter.
- Sửa/huỷ hẹn giờ chỉ đổi row DB. Trễ tối đa ~1 phút.
- Job scheduler cũng dùng cho flush counter 5 phút, xếp hạng, v.v.

## 7. Cloudflare purge
- `POST /client/v4/zones/{zone_id}/purge_cache` body `{ files: [...] }`; token chỉ quyền Zone → Cache Purge.
- Free: ≤100 URL/request; purge theo file 800 URL/s; không có wildcard/prefix → liệt kê URL tường minh.
- Queue job `cache-purge` có retry/backoff, chunk 100, dedupe; đổi tên truyện purge cả slug cũ và mới.
- Thiếu `CF_ZONE_ID`/`CF_API_TOKEN` → no-op (log debug); Zod bắt cặp thiếu một nửa.

## 8. Backup Postgres ra R2
- Host cron, không sidecar. `docker compose exec -T postgres pg_dump -Fc` → `rclone copyto` lên bucket R2 riêng → giữ 14 bản local → ping healthcheck (dead-man).
- rclone cài trên host, không phải dep của repo. Token R2 riêng, scope theo bucket.
- Retention remote: lifecycle R2 30–60 ngày hoặc `rclone delete --min-age`.
- Restore test hằng tháng trong container `postgres:18` tạm, so số dòng bảng chính. Lần đầu thành công là gate trước khi mở public.
- Dump chứa email + hash mật khẩu → cân nhắc `rclone crypt`/`age`.

## Câu hỏi chưa giải quyết
1. MinIO với `aws4fetch` (`service: 's3'`, region `us-east-1`) — cần thử nhanh.
2. Nitro/srvx có lộ IP peer không khi không có Cloudflare (dev)?
3. Rate limit khi Redis chết: fail-open hay fail-closed cho đăng nhập/đăng ký?
4. Mã hoá backup R2?
5. Hẹn giờ trễ ~1 phút có chấp nhận được?
6. Search dùng master key phía server hay tạo search-only key?

Nguồn: https://www.npmjs.com/package/aws4fetch, https://sharp.pixelplumbing.com/install, https://hono.dev/docs/middleware/builtin/body-limit, https://www.meilisearch.com/docs/learn/engine/language, https://github.com/meilisearch/charabia, https://better-auth.com/docs/concepts/rate-limit, https://docs.bullmq.io/guide/job-schedulers, https://developers.cloudflare.com/cache/how-to/purge-cache/
