# Cook phase 9: tiến độ đọc, purge CDN, đếm lượt đọc

Ngày 2026-10-05. Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-09-tien-do-purge-luot-doc.md`. Spec checkbox 6 Giai đoạn 1 → `[x]`.

## Đã làm

- **Shared:** `readingProgressInput`, `chapterViewInput` (`schemas/reader.ts`); `views.ts` (`VIEW_RULES`, `STATS_TIMEZONE`, `statsDate`); `CONTENT_JOBS.purgeUrls`, `PUBLISHING_JOBS.flushViewCounters`; `cdnEnvSchema` (`CF_ZONE_ID` 32 hex, `CF_API_TOKEN`).
- **Core:**
  - `reader/readable-chapter-ref.ts` (`findReadableChapterRef`, qua `canReadChapter`);
  - `reading/progress.ts` (`saveReadingProgress`, upsert theo (user, story));
  - `cdn/purge.ts` (chunk 100, timeout 10s, no-op khi thiếu cấu hình);
  - `cdn/urls-for.ts` (`urlsFor`, `storyUrlsEverPublished`, `storyUrlsByPublicId`);
  - `views/{view-keys,view-counter,record-chapter-view,flush}.ts`;
  - `jobsForChange` sinh một `purge-urls` cho mọi change, có `opts` retry 11 lần.
- **API:** `routes/reading.ts`:
  - `PUT /progress` (hc), `POST /progress` (beacon, parse text);
  - `POST /view` (cookie `nh_vid`, `Path=/api/v1/reading`, chỉ đặt khi 204);
  - `bodyLimit` 4 KB;
  - `lib/peer-ip.ts`;
  - `ApiDeps.viewCounter`.
- **Auth:** `createUserUpdateAfter` → event `user.updated` khi `/update-user` có `name`.
- **Worker:**
  - processor `purge-urls` và `flush-view-counters` (scheduler 5 phút);
  - `statsRedis` riêng;
  - `index.ts` đọc `CF_*` bằng `loadOptionalEnv` (production thiếu → không khởi động);
  - script `cdn:purge`.
- **Web:**
  - `infra.ts` lộ `producerRedis` và `viewCounter`;
  - hook `useReadingProgress` (debounce 3s + `sendBeacon`/`keepalive`) và `useViewBeacon` (30s tab hiển thị);
  - `scroll.ts`;
  - gắn vào route chương; tắt khi màn 18+ đang che.
- **Docs:** `.env.example` (`CF_*`), `CLAUDE.md` (lệnh `cdn:purge`), `docs/deployment-cloudflare.md` (token purge, purge tay, cảnh báo IP edge trước phase 13).

## Test

- Unit:
  - schema, `statsDate`, cdn env;
  - purger (chunk, no-op, lỗi, timeout);
  - `jobsForChange`, `peerIp`, `scroll`;
  - reading API (401, 400, 413, CSRF);
  - router worker.
- Int:
  - `findReadableChapterRef`/progress;
  - `urlsFor` (chương + lân cận, truyện ẩn/xoá mềm, đổi slug, tác giả bị ban, không tồn tại);
  - views (cap người xem/IP, vượt cap không tạo key, flush, DB lỗi trả lại, chương đã xoá);
  - API reading;
  - hook auth;
  - processor purge;
  - scheduler thứ 3.
- E2E `reader-progress.spec.ts`:
  - debounce lưu DB;
  - đóng tab ghi 100 qua beacon;
  - khách không gửi progress;
  - 30s hiển thị → 1 request `/view`, thời gian tab ẩn không tính;
  - HTML chương không `set-cookie`.
- Gate `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`: xanh. Unit 380, int 191 (1 skip là S3), e2e 38.
- Thủ công: `pnpm cdn:purge -- --story <id>` thiếu `CF_*` → exit 1 kèm thông báo.

## Review

`code-reviewer-261005-1400-phase-09-progress-purge-views-review-report.md` (8/10). Đã sửa H1, M1, M2, L3, L7. Để lại:

- M3: `/view` chưa rate limit, xem lại ở phase 13.
- L1: flush chỉ quét hôm nay và hôm qua.
- L2: `urlsFor` user N+1.
- L4, L5: lưu tiến độ khi điều hướng trong app; thứ tự PUT và beacon.
- L6: IP thô trong key Redis 48 giờ.
- L8: kiểu `ContentJobDeps`.
- L9: cap IP với mạng di động dùng chung IP (ngưỡng user chốt).

## Câu hỏi mở

1. Smoke `pnpm cdn:purge` với Cloudflare thật: chưa chạy vì `.env` không có `CF_*` (chỉ thị không điền giá trị thật). User cần chạy khi có token.
2. `request.ip` có trong bản build production không: chưa kiểm, để phase 13.
3. `TRUST_CF_IP` chưa thêm vào `.env.example`, vì phase 9 không dùng (thuộc phase 13).
