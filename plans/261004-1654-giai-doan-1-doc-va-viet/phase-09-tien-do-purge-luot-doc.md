---
phase: 9
title: "Phase 9: Trang đọc C — tiến độ đọc, purge CDN, đếm lượt đọc"
status: completed
priority: P1
effort: "2d"
dependencies: [8]
---

# Phase 9: Trang đọc C — tiến độ đọc, purge CDN, đếm lượt đọc

Spec checkbox: `Trang đọc chương theo mục 6 và mục 8.` — **đánh `[x]` ở cuối phase này** (phase 7, 8, 9 cùng xanh gate). <!-- Red Team: tách phase trang đọc thành 3 phase -->

## Context Links

- Spec mục 6 (purge khi đăng/sửa/ẩn; tiến độ đọc debounce + `sendBeacon`; lượt đọc Redis + HyperLogLog, ghi dồn 5 phút, dwell tối thiểu, giới hạn user/IP/chương/ngày), mục 11 (mất ≤ 5 phút counter chấp nhận được)
- [plan.md](./plan.md) — "Hàng đợi", "Kiến trúc dữ liệu cho UI"; user chốt **giữ** đếm lượt đọc ở Giai đoạn 1 (HOLD SCOPE)
- `plans/reports/researcher-261004-2352-storage-search-infra-report.md` mục 7 (Cloudflare purge: ≤ 100 URL/request, không wildcard)
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 7 (`sendBeacon`, CSRF)
- Phase 5: `ContentChange` (có biến thể `user`), `jobsForChange`, `recordContentChanges`, outbox `content_events` + `drain-content-events`, `CONTENT_JOBS`, `routeContentJob`/`ContentJobDeps`, queue `publishing` + `registerPublishingSchedulers`. Phase 7: `canReadChapter`, route chương, `canonicalPath`, `docs/deployment-cloudflare.md`. Phase 2: `getInfra()`, `makeTestApiDeps` (`@novel-hub/api/testing`), `validate()`, `coreError()`, `loadOptionalEnv` (`@novel-hub/shared/env`, dùng cho env CF).
- Code: `packages/db/src/schema/engagement.ts:40-58` (`readingProgress`, PK `(user_id, story_id)`, check 0–100), `:65-76` (`chapterDailyStats`, PK `(chapter_id, date)`); `packages/auth/src/auth.ts:145-150` (`databaseHooks`), `packages/auth/src/hooks.ts:104-107` (đổi tên hiển thị); `packages/core/src/infra/redis.ts:38-40` (producer `enableOfflineQueue: false`); `apps/worker/src/env.ts:10-15`, `apps/worker/src/env.test.ts:16-17` (`toEqual` chính xác), `:26-29` (ca production)

## Overview

- **D1. Tiến độ đọc:** `PUT|POST /api/v1/reading/progress` (debounce qua `hc` + `sendBeacon` khi rời trang) → upsert `reading_progress`. Phase 12 đọc.
- **D2. Purge CDN:** core `cdn` (Cloudflare, no-op khi thiếu env ngoài production), job `purge-urls` trong `jobsForChange` cho mọi `ContentChange`; hook Better Auth `user.update.after` ghi outbox khi đổi tên hiển thị; lệnh `pnpm cdn:purge -- --story <publicId>`.
- **E. Đếm lượt đọc:** `POST /api/v1/reading/view` sau ≥ 30 giây tab hiển thị → Lua (INCR + PFADD, giới hạn theo người xem và IP mỗi chương mỗi ngày) → worker ghi dồn `chapter_daily_stats` mỗi 5 phút.

## Key Insights

- **Purge bền nhờ outbox của phase 5:** thay đổi nội dung ghi `content_events` trong cùng transaction; drain map qua `jobsForChange` → `purge-urls`. Không còn "sau commit, lỗi chỉ log". <!-- Red Team: F1/X2 purge bền -->
- **Payload job là chính `ContentChange`**, không `jobId` cố định; processor đọc trạng thái **hiện tại** trong DB rồi dựng URL → idempotent, chạy lại vô hại. <!-- Red Team: S7 một quy tắc jobId -->
- **Event truyện liệt kê mọi chương có `published_at IS NOT NULL` bất kể trạng thái hiện tại** (kể cả `hidden_by_mod`, xoá mềm). Nếu chỉ lấy chương đọc được thì truyện vừa ẩn/tác giả vừa bị ban cho ra 0 chương → cache chương còn nguyên. <!-- Red Team: F3 purge truyện ẩn/ban -->
- **Event user** (`updated`/`banned`/`unbanned`) → trang tác giả + mọi truyện của tác giả (như event truyện). Đổi tên hiển thị hiện trên trang chương nên phải purge. <!-- Red Team: F8/S6 -->
- Đổi slug: event truyện mang `previousSlug` → purge cả URL slug cũ (301 cũ) lẫn mới cho trang truyện và mọi chương.
- **Chỉ purge URL chuẩn.** Cache key Cloudflare giữ query string; biến thể chỉ chứa 301 (phase 7), không chứa nội dung. <!-- Red Team: X1 -->
- **`CF_*` bắt buộc ở production** (như S3): parse riêng bằng `loadOptionalEnv(cdnEnvSchema, process.env, 'cdn')` của phase 2 — production thiếu → worker không khởi động; dev/test trống hoặc thiếu nửa → cảnh báo, `null` → purger no-op. Không ghép vào `workerEnvSchema`. Mọi fetch Cloudflare có `AbortSignal.timeout(10_000)`. <!-- Red Team: X2, F5; consistency sweep — loadOptionalEnv thay requireCdnComplete -->
- **Better Auth `user.update.after`** chạy sau khi Better Auth ghi user, không chung transaction → ghi outbox là một INSERT riêng; lỗi thì log, phương án bù là `pnpm cdn:purge`. Rủi ro chấp nhận được (tên hiển thị hiếm khi đổi).
- **Đếm lượt đọc không chặn trang đọc:** Redis lỗi (producer `enableOfflineQueue: false` từ chối ngay) → log, trả 204; mất lượt đọc chấp nhận được (spec mục 11).
- **IP:** lấy `request.ip` của srvx qua helper `peerIp(req)`; không có (dev, adapter khác) → bỏ giới hạn IP, vẫn giới hạn theo người xem. Phase 13 thay bằng `clientIp` (tin `CF-Connecting-IP` khi `TRUST_CF_IP`). **Trước khi deploy sau Cloudflare bắt buộc đã có phase 13**, nếu không mọi người dùng chung IP edge. <!-- Red Team: brief — IP qua request.ip, phase 13 thay -->
- Rate limit riêng cho `/reading/*` không làm ở phase 13; giới hạn lượt đọc nằm trong Lua của phase này. <!-- Red Team: S5 -->
- Ghi dồn chạy ở queue `publishing` (việc nội bộ Redis + Postgres, không gọi ra ngoài), không kẹt sau job I/O của queue `content`.

## Requirements

**Functional**

- **Tiến độ:**
  - đã đăng nhập: cuộn → debounce 3s → `PUT /api/v1/reading/progress` `{ publicId, number, scrollPct }` (`hc`); `pagehide` / `visibilitychange=hidden` → `sendBeacon` `POST` cùng path (Blob `application/json`; `sendBeacon` trả `false` → `fetch keepalive`);
  - không gửi lại nếu `scrollPct` chưa đổi so với lần gửi trước; khách không gửi;
  - server: cần phiên; chương không đọc được → 404; upsert `reading_progress(user, story)` set `chapter_id`, `scroll_pct`, `updated_at = now()`; 204 `no-store`;
  - `POST` đọc `c.req.text()` rồi `JSON.parse` + Zod (nhận cả `application/json` lẫn `text/plain`); body ≤ 4 KB (`bodyLimit`).
- **Purge** — `urlsFor(db, change, appUrl)`:
  - `chapter`: chương đó + chương đọc được liền trước/liền sau (trạng thái hiện tại) + trang truyện;
  - `story`: trang truyện + mọi chương có `published_at IS NOT NULL`; có `previousSlug` thì thêm bộ URL với slug cũ;
  - `user`: `/authors/{username}` + mọi truyện của tác giả như nhánh `story`;
  - path dựng bằng `canonicalPath` (phase 7), URL tuyệt đối `new URL(path, appUrl)`, khử trùng lặp; phase 10 mở rộng (trang chủ, tag, tác giả cho event truyện).
- Purger: chunk 100 URL/request; thiếu cấu hình → no-op (log debug một lần); non-2xx hoặc `success: false` → throw (BullMQ retry theo `DEFAULT_JOB_OPTIONS`).
- `pnpm cdn:purge -- --story <publicId>`: purge đồng bộ (không qua queue) trang truyện + mọi chương `published_at IS NOT NULL`, in số URL; thiếu `CF_*` → exit 1 có thông báo.
- Hook `user.update.after`: request đổi `name` → `recordContentChanges(db, [{ entity: 'user', action: 'updated', userId }])`.
- **Lượt đọc:**
  - client: đếm thời gian tab hiển thị trên trang chương; đủ 30s → `POST /api/v1/reading/view` `{ publicId, number }` một lần mỗi lượt tải trang (khách và user);
  - server: session tuỳ chọn; người xem = `u:{userId}` hoặc `a:{nh_vid}`; chưa có cookie `nh_vid` thì đặt (ngẫu nhiên 16 byte base64url, HttpOnly, SameSite=Lax, Secure khi `APP_URL` https, `Path=/api/v1/reading`, 1 năm); chương không đọc được → 404; còn lại 204 `no-store`;
  - Lua: tính lượt khi người xem ≤ 3 lượt và IP ≤ 10 lượt cho chương đó trong ngày (`Asia/Ho_Chi_Minh`); lượt được tính → `INCR views`, `PFADD uv`, `SADD dirty`; key TTL 2 ngày;
  - worker: scheduler `flush-view-counters` mỗi 5 phút, xử lý hôm nay + hôm qua → upsert `chapter_daily_stats` (`views` cộng dồn, `unique_readers` = `PFCOUNT`). `completions` chưa tính (Giai đoạn 2).

**Non-functional**

- Endpoint ghi đi qua CSRF `/api/v1` (beacon same-origin có `Origin`/`Sec-Fetch-Site`), không trả UUID.
- Purge truyện 1.000 chương ≈ 11 request; trong giới hạn 800 URL/s của gói Free.
- Không `UPDATE ... views = views + 1` mỗi lượt đọc (spec mục 6).

## Architecture

```
Trang chương ─ useReadingProgress ─ PUT /api/v1/reading/progress (debounce 3s) | sendBeacon POST (pagehide)
             └ useViewBeacon (≥ 30s hiển thị) ─ POST /api/v1/reading/view
Hono reading.ts ─▶ core.saveReadingProgress(db, userId, input)   → findReadableChapterRef → canReadChapter → UPSERT
               └─▶ core.recordChapterView({ db, viewCounter }, input) → findReadableChapterRef → viewCounter.record (Lua)

Thay đổi nội dung (phase 5/15, hook auth) ─ recordContentChanges(tx) ─▶ content_events
worker[publishing] drain-content-events ─ jobsForChange(change) = [{ name: 'purge-urls', data: change }] ─▶ queue content
worker[content] routeContentJob 'purge-urls' ─ contentChangeSchema.parse ─ urlsFor(db, change, appUrl) ─ cdn.purge(urls)
worker[publishing] every 5 phút flush-view-counters ─ flushViewCounters(redis, db, prefix, [hôm nay, hôm qua])
   SPOP dirty 100 → GETDEL views, PFCOUNT uv → UPSERT chapter_daily_stats (lỗi DB → INCRBY + SADD trả lại)
```

```ts
// packages/shared/src/schemas/reader.ts (thêm)
export const readingProgressInput = z.object({ publicId, number: z.int().min(1), scrollPct: z.number().min(0).max(100) });
export const chapterViewInput = z.object({ publicId, number: z.int().min(1) });
// packages/shared/src/views.ts
export const VIEW_RULES = { minDwellMs: 30_000, perViewerPerDay: 3, perIpPerDay: 10, keyTtlSec: 172_800 } as const;
export const STATS_TIMEZONE = 'Asia/Ho_Chi_Minh';
export function statsDate(now: Date): string; // 'YYYY-MM-DD'
// packages/shared/src/queues.ts (thêm)
CONTENT_JOBS.purgeUrls = 'purge-urls'; PUBLISHING_JOBS.flushViewCounters = 'flush-view-counters';
// packages/shared/src/env.ts (thêm)
export const cdnEnvSchema; // CF_ZONE_ID, CF_API_TOKEN — cả hai bắt buộc trong schema; đọc bằng loadOptionalEnv (phase 2)

// packages/core/src/reader/readable-chapter-ref.ts
export function findReadableChapterRef(db: Db, publicId: string, number: number): Promise<{ storyId: string; chapterId: string } | null>;
// packages/core/src/reading/progress.ts
export function saveReadingProgress(db: Db, userId: string, input: ReadingProgressInput): Promise<Result<void, 'NOT_FOUND'>>;
// packages/core/src/cdn/{purge,urls-for}.ts
export interface CdnPurger { purge(urls: readonly string[]): Promise<void> }
export function createCdnPurger(cfg: { zoneId: string; apiToken: string } | null, fetchFn?: typeof fetch): CdnPurger;
export function urlsFor(db: Db, change: ContentChange, appUrl: string): Promise<string[]>;
export function storyUrlsEverPublished(db: Db, storyId: string, appUrl: string, slugs: string[]): Promise<string[]>;
// packages/core/src/views/*.ts
export interface ViewCounter { record(i: { chapterId: string; viewer: string; ip: string | null; date: string }): Promise<boolean> }
export function createViewCounter(redis: Redis, prefix: string): ViewCounter;
export function recordChapterView(deps: { db: Db; viewCounter: ViewCounter | null }, input: ChapterViewInput &
  { viewer: string; ip: string | null; now: Date }): Promise<Result<{ counted: boolean }, 'NOT_FOUND'>>;
export function flushViewCounters(redis: Redis, db: Db, prefix: string, dates: string[]): Promise<{ chapters: number }>;
// packages/api: ApiDeps thêm viewCounter: ViewCounter | null (mặc định null trong makeTestApiDeps); helper peerIp(req: Request): string | null (phase 13 thay bằng deps.clientIp)
// apps/worker/src/content-router.ts (file phase 5): ContentJobDeps thêm { cdn: CdnPurger; appUrl: string }
// apps/worker/src/publishing-worker.ts (file phase 5): deps thêm { statsRedis: Redis }; registerPublishingSchedulers thêm flush-view-counters
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/reader.ts` (+ test) | modify | `readingProgressInput`, `chapterViewInput` |
| `packages/shared/src/views.ts` (+ test) | create | `VIEW_RULES`, `STATS_TIMEZONE`, `statsDate` |
| `packages/shared/src/queues.ts` (+ test) | modify | `CONTENT_JOBS.purgeUrls`, `PUBLISHING_JOBS.flushViewCounters` |
| `packages/shared/src/env.ts` (+ test) | modify | `cdnEnvSchema`; test `loadOptionalEnv(cdnEnvSchema, …)`: production thiếu/thiếu nửa → throw, dev → `null` |
| `packages/core/src/reader/readable-chapter-ref.ts` (+ int test) | create | dùng chung cho tiến độ và lượt đọc |
| `packages/core/src/reading/progress.ts` (+ int test) | create | phase 12 mở rộng thư mục |
| `packages/core/src/cdn/{purge,urls-for}.ts` (+ `purge.test.ts`, `urls-for.int.test.ts`) | create | |
| `packages/core/src/views/{view-counter,record-chapter-view,flush}.ts` (+ unit, `views.int.test.ts`) | create | Lua script trong `view-counter.ts` |
| `packages/core/src/content/hooks.ts` (+ test) | modify | `jobsForChange` trả `purge-urls` cho mọi biến thể |
| `packages/core/src/index.ts` | modify | export mới |
| `packages/auth/src/hooks.ts`, `auth.ts` | modify | `createUserUpdateAfter(db)`; `databaseHooks.user.update.after` |
| `packages/api/src/routes/reading.ts` (+ test) | create | `PUT/POST /progress`, `POST /view` |
| `packages/api/src/lib/peer-ip.ts` (+ test) | create | phase 13 thay bằng `clientIp` |
| `packages/api/src/{app.ts,deps.ts}`, `makeTestApiDeps` (phase 2) | modify | mount `/reading`; `viewCounter` (mặc định test `null`) |
| `apps/web/src/server/infra.ts` | modify | lộ `producerRedis` (kết nối producer đang dùng cho queue), dựng `viewCounter`; phase 13 dùng lại kết nối này |
| `apps/web/src/lib/reader/{scroll,use-reading-progress,use-view-beacon}.ts` (+ `scroll.test.ts`) | create | `computeScrollPct`; phase 12 thêm hàm ngược |
| `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx` | modify | gắn 2 hook |
| `apps/worker/src/env.ts`, `env.test.ts` | không sửa | CF không ghép vào `workerEnvSchema` (đọc riêng ở `index.ts`), nên `toEqual` ở `env.test.ts:16-17` và ca production `:26-29` giữ nguyên |
| `apps/worker/src/{content-router,content-worker,publishing-worker,index}.ts` (file của phase 5) | modify | `content-router`: route `purge-urls`; `publishing-worker`: route `flush-view-counters`, `registerPublishingSchedulers` thêm scheduler thứ 3, deps thêm `statsRedis`; `index.ts`: `loadOptionalEnv(cdnEnvSchema, …)` → `createCdnPurger`, tạo `statsRedis` (`createWorkerConnection`), đóng khi tắt |
| `apps/worker/src/processors/{purge-urls,flush-view-counters}.ts` (+ int test) | create | |
| `apps/worker/src/scripts/cdn-purge.ts`, `apps/worker/package.json`, `package.json` (gốc) | create/modify | script `cdn:purge` |
| `.env.example` | modify | `CF_ZONE_ID`, `CF_API_TOKEN` kèm mô tả (đã duyệt) |
| `CLAUDE.md` | modify | bảng lệnh thêm `pnpm cdn:purge -- --story <publicId>` (đã duyệt) |
| `docs/deployment-cloudflare.md` | modify | mục token purge (Zone → Cache Purge), `CF_*` ở worker, lệnh purge tay |
| `apps/web/e2e/reader-progress.spec.ts` | create | |

## Implementation Steps

1. **Shared:** schema input, `views.ts` (`statsDate` bằng `Intl.DateTimeFormat('en-CA', { timeZone })`), tên job, `cdnEnvSchema` (đọc bằng `loadOptionalEnv` của phase 2). Unit test biên (23:59 giờ VN vs UTC).
2. **`findReadableChapterRef`** (join facts → `canReadChapter`) + **`saveReadingProgress`** (`INSERT ... ON CONFLICT (user_id, story_id) DO UPDATE`). Int test.
3. **API `reading.ts`** (chain): `bodyLimit(4096)`; `.put('/progress', sessionMiddleware, requireAuth, validate('json', readingProgressInput), h)`, `.post('/progress', sessionMiddleware, requireAuth, h2)` với `h2` parse text → Zod → cùng hàm xử lý; lỗi qua `coreError()`. Mount trong `app.ts`. Unit test bằng `makeTestApiDeps`.
4. **Client tiến độ:** `computeScrollPct(el)` = `clamp((scrollY + innerHeight − top(el)) / height(el) × 100, 0, 100)` làm tròn 1 chữ số; `useReadingProgress` (chỉ khi `useMe` có user).
5. **CDN core:** `createCdnPurger` (chunk 100, `AbortSignal.timeout(10_000)`, kiểm `success`); `urlsFor` theo Requirements, `storyUrlsEverPublished` dùng chung cho nhánh story/user và lệnh tay.
6. **Nối outbox:** `jobsForChange` trả `[{ name: CONTENT_JOBS.purgeUrls, data: change }]` cho cả 3 entity (switch đủ nhánh, kiểm `never`); processor `purge-urls` parse bằng `contentChangeSchema`, `UnrecoverableError` khi payload sai; `ContentJobDeps` thêm `cdn`, `appUrl`.
7. **Worker boot:** `index.ts` gọi `loadOptionalEnv(cdnEnvSchema, process.env, 'cdn')` → `createCdnPurger(cfg ? { zoneId, apiToken } : null)`; không đổi `workerEnvSchema` và `env.test.ts`.
8. **Hook auth:** `createUserUpdateAfter(db)` — chỉ ghi khi request là `/update-user` có `name` (spike signature `after(user, ctx)` của Better Auth đang ghim; ctx không có thông tin thì ghi mỗi lần `after` chạy — processor idempotent, chi phí nhỏ). Lỗi → log, không throw.
9. **Lệnh tay** `cdn-purge.ts`: `parseArgs` (bỏ `--` đứng đầu), env worker + `loadOptionalEnv(cdnEnvSchema, …)` (`null` → exit 1 kèm thông báo thiếu `CF_*`), tra truyện theo `publicId`, `storyUrlsEverPublished`, gọi purger trực tiếp; thử `pnpm cdn:purge -- --story <id>` thật.
10. **Lượt đọc core:** Lua một lần gọi (`defineCommand`): INCR người xem (+EXPIRE khi =1), INCR IP nếu có, kiểm ngưỡng, nếu đạt → INCR views, PFADD uv, SADD dirty, EXPIRE; trả 0/1. Key `{QUEUE_PREFIX}:v:{loại}:{date}:{chapterId}[:{viewer|ip}]`. `recordChapterView`: ref → `null` → `NOT_FOUND`; `viewCounter` null/lỗi → log, `counted: false`.
11. **API `/view`:** `sessionMiddleware` (không `requireAuth`), `validate('json', chapterViewInput)`, cookie `nh_vid` qua `hono/cookie`, `peerIp(c.req.raw)` (type guard thuộc tính `ip`, không `any`), 204.
12. **Client** `useViewBeacon`: cộng dồn thời gian khi `document.visibilityState === 'visible'`; đủ `VIEW_RULES.minDwellMs` → `fetch` POST `keepalive` một lần.
13. **Ghi dồn:** `flushViewCounters`: mỗi ngày `SPOP dirty 100` tới khi rỗng; mỗi lô `GETDEL views` + `PFCOUNT uv` → một câu `INSERT ... SELECT` từ `VALUES` join `chapters` (bỏ chapter id không còn) `ON CONFLICT DO UPDATE SET views = chapter_daily_stats.views + excluded.views, unique_readers = GREATEST(...)`; lỗi DB → `INCRBY` lại số đã lấy + `SADD dirty`, rồi throw. Processor + scheduler `every: 300_000` trong `registerPublishingSchedulers` (sửa file `publishing-worker.ts` của phase 5); worker tạo Redis riêng `statsRedis` (`createWorkerConnection`) cho lệnh thống kê, truyền vào deps của publishing worker.
14. **Tài liệu:** `docs/deployment-cloudflare.md` thêm token purge, biến `CF_*`, lệnh tay; ghi chú "phase 13 phải có trước khi đặt origin sau Cloudflare".
15. **E2E** `reader-progress.spec.ts` theo ma trận (e2e không chạy worker: kiểm DB/Redis qua helper).
16. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Xanh → đánh `[x]` checkbox "Trang đọc chương theo mục 6 và mục 8." trong spec.

## Function / Interface Checklist

- [x] `readingProgressInput`, `chapterViewInput`, `VIEW_RULES`, `statsDate`, `cdnEnvSchema`
- [x] `findReadableChapterRef`, `saveReadingProgress`
- [x] `createCdnPurger`, `urlsFor`, `storyUrlsEverPublished`, `jobsForChange` (nhánh purge), processor `purge-urls`
- [x] `createUserUpdateAfter`, script `cdn:purge`
- [x] `createViewCounter`, `recordChapterView`, `flushViewCounters`, processor `flush-view-counters`, `peerIp`
- [x] `computeScrollPct`, `useReadingProgress`, `useViewBeacon`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Truyện bị ẩn (`hidden_by_mod`) → `urlsFor` gồm trang truyện + mọi chương có `published_at` (kể cả chương đã ẩn/xoá mềm) | int |
| Critical | Event user `banned` → trang tác giả + mọi truyện/chương của tác giả; `updated` sau đổi tên cũng vậy | int |
| Critical | Chương 3 đổi → chương 2, 3, 4 + trang truyện; đổi slug → mọi chương với slug cũ và mới | int |
| Critical | `jobsForChange` trả đúng một `purge-urls` cho mỗi biến thể, không `jobId` | unit |
| Critical | Progress: user cuộn → dòng `reading_progress` có `scroll_pct` > 0; rời trang (đóng tab) → giá trị cuối được ghi qua beacon; khách → 401; chương không đọc được → 404 | e2e + int + unit api |
| High | Purger: 250 URL → 3 request; thiếu cấu hình → không fetch; 500 hoặc `success:false` → throw; treo → abort sau 10s (fake timer) | unit |
| High | `loadOptionalEnv(cdnEnvSchema)`: production thiếu `CF_*` hoặc chỉ một biến → throw; dev không có/thiếu nửa → `null` + cảnh báo; đủ cặp → config | unit (shared) |
| High | Processor `purge-urls` (fake purger) nhận đúng URL; payload sai → `UnrecoverableError` | int worker |
| High | Hook auth: đổi tên hiển thị qua Better Auth → có row `content_events` entity `user` | int (auth) |
| High | Lua: người xem 5 lượt/ngày → `views` +3, HLL +1; 11 người xem cùng IP → tính 10; flush ghi đúng, xoá counter, chạy lại không cộng trùng | int (Redis + Postgres thật) |
| High | Flush: DB lỗi giữa chừng → counter được trả lại, lần sau ghi đủ | int |
| High | `/view`: chương không đọc được → 404, counter không đổi; Redis down → 204; khách lần đầu nhận `Set-Cookie: nh_vid` với `Path=/api/v1/reading` | unit api |
| High | Trang chương HTML vẫn không có `set-cookie` sau khi đã có `nh_vid` | e2e |
| Medium | `statsDate`: 2026-10-05T17:30Z → `2026-10-06` | unit |
| Medium | Ở trang 30s (fake clock `page.clock`) → một request `/view`; tab ẩn không tính giờ | e2e |
| Medium | `pnpm cdn:purge -- --story <id>` thiếu env → exit 1; có env → in số URL | thủ công |

## Dependency Map

- **Cần:** phase 5 (outbox, `ContentChange` có `user`, `jobsForChange`, `routeContentJob`, queue `publishing`, worker có DB), phase 7 (`canReadChapter`, route chương, tài liệu Cloudflare), phase 8 (xong gate), phase 2 (`getInfra()`, `makeTestApiDeps`, `loadOptionalEnv`).
- **Phase sau dùng:**
  - phase 10: mở rộng `urlsFor` (trang chủ, tag, tác giả cho event truyện);
  - phase 11: thêm `search-sync` vào `jobsForChange` cạnh `purge-urls`;
  - phase 12: `reading_progress`, `routes/reading.ts`, `computeScrollPct`;
  - phase 13: thay `peerIp` bằng `clientIp`, dùng lại `producerRedis`;
  - phase 15: ban/bỏ ban/ẩn ghi outbox → purge tự động; phase 17: runbook restore dùng "Purge Everything" + `pnpm cdn:purge`;
  - Giai đoạn 2: `chapter_daily_stats` cho xếp hạng và dashboard.

## Success Criteria

- [x] Tiến độ đọc ghi bằng debounce và khi rời trang
- [x] Mọi `ContentChange` (chương, truyện, user) sinh job purge đúng URL; truyện ẩn/tác giả bị ban purge được mọi chương đã từng đăng
- [x] Production thiếu `CF_*` thì worker không khởi động; có lệnh purge tay
- [x] Lượt đọc vào `chapter_daily_stats` sau ≤ 5 phút, có giới hạn người xem/IP/chương/ngày
- [x] Gate 5 lệnh xanh; checkbox 6 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Purge thất bại → nội dung ẩn còn trên CDN tới hết TTL | Thấp × Cao | Outbox bền + BullMQ retry; `pnpm cdn:purge`; SWR chương 1 giờ |
| Hook `user.update.after` lỗi → không purge tên mới | Thấp × Thấp | Log; lệnh purge tay; tên cũ chỉ là hiển thị |
| `request.ip` là IP edge Cloudflare khi deploy trước phase 13 | Trung bình × Trung bình | Ghi chặn trong docs; deploy không thuộc Giai đoạn 1 trước phase 13 |
| `sendBeacon` với Blob `application/json` bị chặn | Thấp × Trung bình | Server nhận cả `text/plain`; fallback `fetch keepalive`; e2e kiểm DB sau khi đóng tab |
| Bot đổi cookie liên tục thổi lượt đọc | Trung bình × Thấp | Giới hạn IP 10/chương/ngày; lượt đọc chưa dùng cho xếp hạng tới Giai đoạn 2 |
| Bộ nhớ Redis do HLL | Thấp × Thấp | HLL sparse nhỏ khi ít phần tử; TTL 2 ngày |
| Truyện rất dài → purge nhiều URL mỗi lần sửa truyện | Thấp × Thấp | Chunk 100, retry/backoff; 800 URL/s đủ |

Rollback: không migration. Gỡ nhánh `purge-urls` trong `jobsForChange` (event outbox vẫn được drain, chỉ không sinh job), `removeJobScheduler('flush-view-counters')`; key Redis tự hết hạn sau 2 ngày; bỏ hook `after` không ảnh hưởng đăng nhập.

## Security Considerations

- `CF_API_TOKEN` chỉ quyền Zone → Cache Purge của đúng zone, chỉ worker đọc; không log token hay payload.
- Endpoint `progress`/`view` qua CSRF, `no-store`, giới hạn body 4 KB; không trả UUID; người xem trong Redis là id nội bộ, không ra ngoài.
- Cookie `nh_vid` không chứa thông tin cá nhân, HttpOnly, chỉ ở `Path=/api/v1/reading` → HTML công khai không bị dính cookie.
- Lượt đọc là số liệu phụ, không dùng để phân quyền.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Dwell 30 giây; tối đa 3 lượt/người xem và 10 lượt/IP mỗi chương mỗi ngày; chỉnh sau khi có dữ liệu thật. `CF_ZONE_ID`/`CF_API_TOKEN` đã có (user xác nhận), smoke purge thật được ở phase này.

## Kết quả (2026-10-05)

- Gate 5 lệnh xanh; checkbox 6 Giai đoạn 1 `[x]`. Review `../reports/code-reviewer-261005-1400-phase-09-progress-purge-views-review-report.md` (8/10): đã sửa H1 (Lua kiểm cap trước khi ghi key, request vượt cap không tạo key), M1 (Redis lỗi giữa flush → trả id về `dirty`), M2 (job purge 11 lần thử, backoff mũ 10s ≈ 2,8 giờ), L3 (log lỗi đếm lượt đọc tối đa 1 lần/phút), L7 (cookie `nh_vid` chỉ đặt khi 204). Report: `../reports/cook-261005-1408-phase-09-progress-purge-views-report.md`.
- Lệch plan: thêm `storyUrlsByPublicId` (core) cho lệnh tay để worker không cần `drizzle-orm`; `cdnConfigFromEnv`; `ContentJob.opts` (chỉ `attempts`/`backoff`, không `jobId`); fixture test `packages/core/src/testing/story-fixture.ts`; `.env.example` không thêm `TRUST_CF_IP` (thuộc phase 13).
- Chưa làm: smoke `pnpm cdn:purge` với Cloudflare thật (`.env` không có `CF_*`, theo chỉ thị không điền giá trị thật); kiểm `request.ip` có ở bản build production không (để phase 13).

## Next Steps

Phase 10: trang truyện, tác giả, tag, trang chủ (dùng `MatureGate`, `cache-headers`, `assertCanonical`, `listReadableChapters`; mở rộng `urlsFor`).
