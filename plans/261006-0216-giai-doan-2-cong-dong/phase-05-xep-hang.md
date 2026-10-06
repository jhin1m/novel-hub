---
phase: 5
title: "Xếp hạng"
status: pending
priority: P1
effort: "2d"
dependencies: [4]
---

# Phase 5: Xếp hạng

<!-- Red Team: điểm theo người đọc duy nhất của TRUYỆN (không cộng qua chương), RankingReader port qua ApiDeps, purge trang xếp hạng, ghi bảng rỗng, queue maintenance, bỏ khu trang chủ -->

## Context Links

- Spec: §5 Gđ2 checkbox 4, §6 "Lượt đọc và xếp hạng" (Redis sorted set tính lại định kỳ; chống bơm view: giới hạn theo user/IP), §7 (18+ không xuất hiện ở bảng xếp hạng với khách/người chưa bật; HTML SSR luôn không có 18+)
- Phase 3: queue `maintenance` (concurrency 1)
- Scout: backend §2 (đếm lượt đọc, `chapter_daily_stats`, `VIEW_RULES`), §9 (`publicStoryWhere`, `listStories`, `catalogUrls`); frontend §5 (`useMatureAwareList`)
- Research: `research/researcher-02-rankings-author-dashboard.md` §1–4

## Overview

Bảng xếp hạng ngày, tuần, tháng và "Đang lên" (tốc độ tăng trưởng), xếp theo **số người đọc duy nhất của truyện mỗi ngày** (mới, đếm ở Redis cạnh bộ đếm chương). Worker tính lại mỗi 15 phút, ghi Redis sorted set. Trang `/rankings/{day|week|month|rising}` SSR cache công khai 10 phút, được purge khi truyện bị ẩn/ban. Xong phase đánh `[x]` checkbox 4.

## Key Insights

- Giới hạn chống bơm hiện có là **theo chương** mỗi ngày (`packages/shared/src/views.ts:8-11`: 3/viewer, 10/IP; HLL `uv` theo chương ở `packages/core/src/views/view-counter.ts:29-47`). Cộng `unique_readers` qua mọi chương làm trần bơm tăng theo số chương (1 IP xoay cookie × 200 chương ≈ 2.000 điểm/ngày) → phải đếm người đọc **theo truyện**, có giới hạn theo IP **theo truyện**.
- `recordChapterView` đã có `storyId` từ `findReadableChapterRef` (`packages/core/src/reader/readable-chapter-ref.ts:17`) → mở rộng Lua cùng một round trip.
- Flush hiện có (`packages/core/src/views/flush.ts:24`, job `flushViewCounters` 300 s) là mẫu cho flush theo truyện.
- `storyListQuery` (`shared/src/schemas/catalog.ts:48-53`) → `listStories(db, query, o)` (`core/src/catalog/lists.ts:20-24`) chỉ nhận `db`; `createStoryRoutes` chỉ lấy `auth|db|storage|rateLimit|clientIp` (`packages/api/src/routes/stories.ts:28-40`); `ApiDeps` dựng ở `apps/web/src/server/api-app.ts:26-56`; Redis web là `producerRedis` (`apps/web/src/server/infra.ts:66,119`), không có field `redis`.
- `catalogUrls` (`core/src/catalog/urls.ts:15`) là nơi duy nhất liệt kê trang danh sách cần purge khi truyện/chương/user đổi; `LIST_CACHE` có `stale-while-revalidate=3600` (`apps/web/src/lib/cache-headers.ts:16-18`) → không purge thì truyện bị ẩn còn trên bảng tới ~70 phút.

## Requirements

**Functional**
- **Đếm người đọc theo truyện** (mở rộng Gđ1): khi một lượt đọc chương được tính (Lua trả 1), thêm viewer vào HLL `v:suv:{date}:{storyId}` nếu bộ đếm `v:sip:{date}:{storyId}:{ip}` < `VIEW_RULES.perIpPerStoryPerDay` (10) (tăng bộ đếm khi thêm; không IP → bỏ kiểm IP như hiện tại), đánh dấu `storyId` vào set `v:sdirty:{date}`; cùng TTL. Flush ghi `story_daily_stats(story_id, date, unique_readers)` (giữ giá trị lớn hơn, như flush chương).
- Kỳ (ngày theo `Asia/Ho_Chi_Minh`, `today` = `statsDate()`): `day` = hôm nay + hôm qua; `week` = 7 ngày gần nhất; `month` = 30 ngày gần nhất; `rising`: `cur` = 7 ngày gần nhất, `prev` = 7 ngày trước đó, chỉ truyện `cur ≥ RANKING_RULES.minRisingReaders` (20), điểm = `(cur − prev) / max(prev, 20)`, chỉ giữ điểm > 0.
- Điểm = tổng `story_daily_stats.unique_readers` trong cửa sổ. Lọc `publicStoryWhere({includeMature:true})`; mỗi kỳ hai bản `general` (không 18+) và `all`; giữ top 100.
- Trang `/rankings/{period}`: tab pill 4 kỳ (`segmented-link-classes.ts`), 50 hạng (số hạng lớn bên trái + thẻ dạng hàng như "Mới cập nhật"), không hiện con số điểm, trạng thái trống có giải thích. `/rankings` → 301 `/rankings/week`; kỳ lạ → 404.
- Người đã bật 18+: `useMatureAwareList` gọi `GET /api/v1/stories?list=ranking&period=…` lấy bản `all`.
- Purge: `catalogUrls` thêm 4 path `/rankings/{period}` cho mọi change story/chapter/user (rẻ, cùng request purge). <!-- Red Team: purge rankings -->
- Sitemap pages thêm 4 URL xếp hạng.
- Lối vào: link "Bảng xếp hạng" ở footer và ở nav header desktop cạnh ô tìm kiếm (không thêm khu trên trang chủ). [auto, Red Team: bỏ khu trang chủ]

**Non-functional**
- Ghi Redis nguyên tử theo key: `MULTI` → `DEL tmp` → `ZADD tmp …` → `EXPIRE tmp 2d` → `RENAME tmp live` → `EXEC`; **kết quả rỗng → `DEL live`** (không để bảng cũ sống tiếp). <!-- Red Team: empty recompute -->
- Đọc qua port `RankingReader` có timeout (theo mẫu `RATE_LIMIT_TIMEOUT_MS` của rate limit): Redis lỗi/treo → `[]` + log có nhịp; trang vẫn 200 với trạng thái trống và header cache ngắn (`s-maxage=60`, biến thể mới trong `cache-headers.ts`) để không giữ trang trống 10 phút.
- Job `recompute-rankings` chạy trên queue `maintenance` (phase 3), 15 phút.

## Architecture

```
Đếm (web, mỗi lượt đọc tính được):
  RECORD_VIEW_LUA (mở rộng): … như cũ … + nếu (không IP hoặc sip < cap): INCR sip, PFADD suv viewer; SADD sdirty storyId
Flush (publishing, 300 s, job hiện có): flushViewCounters + flushStoryReaders → story_daily_stats
maintenance queue: recompute-rankings (15 phút)
  → computeRankings(db, period, today): SELECT s.id, s.is_mature, sum(d.unique_readers) FROM story_daily_stats d
        JOIN stories s … JOIN users u … WHERE d.date BETWEEN … AND publicStoryWhere({includeMature:true})
        GROUP BY … ORDER BY score DESC, s.last_chapter_at DESC, s.id LIMIT 200
  → writeRankings(redis, prefix, period, rows) → `${prefix}:rank:{period}:{general|all}`
Đọc:
  infra.ts: rankingReader = createRankingReader(producerRedis, prefix, timeoutMs)
  api-app.ts: ApiDeps.rankings = rankingReader → stories route → listStories(db, query, {…, rankings})
  server-fn getRankingPage(period) → readRanking(db, rankingReader, period, {includeMature:false, limit:50})
     ZREVRANGE → selectStoryCards where id in (...) + publicStoryWhere → giữ thứ tự Redis
```

- Migration (gợi ý `story_daily_readers`): bảng `story_daily_stats (story_id uuid FK stories cascade, date date, unique_readers int not null default 0, PK (story_id, date))` + index `(date)` cho truy vấn theo cửa sổ.
- `RANKING_PERIODS = ['day','week','month','rising']`, `RANKING_RULES = { refreshMinutes: 15, keep: 100, pageSize: 50, minRisingReaders: 20 }`; `VIEW_RULES.perIpPerStoryPerDay = 10`.
- `canonicalPath({kind:'ranking', period})` → `/rankings/${period}`.

## Related Code Files

| Hành động | File |
|---|---|
| Create | `packages/db/src/schema/engagement.ts` thêm `storyDailyStats` + migration mới |
| Modify | `packages/db/src/schema.int.test.ts` (đếm cố định 25 bảng `:75-80`): 25 → 26 |
| Modify | `packages/shared/src/views.ts` (`perIpPerStoryPerDay`), `queues.ts` (`MAINTENANCE_JOBS.recomputeRankings`) |
| Create | `packages/shared/src/rankings.ts` (+ test): `RANKING_PERIODS`, `RANKING_RULES`, `rankingWindow(period, today)` |
| Modify | `packages/shared/src/canonical-path.ts` (+ test) kind `ranking`; `schemas/catalog.ts` (+ test) `{list:'ranking', period}` |
| Modify | `packages/core/src/views/view-counter.ts`, `view-keys.ts`, `record-chapter-view.ts` (truyền `storyId`), `flush.ts` (+ flush theo truyện) và các test view hiện có (unit + int) |
| Create | `packages/core/src/rankings/compute-rankings.ts`, `write-rankings.ts`, `ranking-reader.ts` (`createRankingReader`, `readRanking`), `ranking-keys.ts`, `rankings.int.test.ts` |
| Modify | `packages/core/src/catalog/lists.ts` (case `ranking`, nhận `rankings` qua options), `catalog/urls.ts` (+ int test: 4 path xếp hạng), `seo/sitemap.ts` (+ int test), `core/src/index.ts` |
| Create | `apps/worker/src/processors/recompute-rankings.ts`; Modify `maintenance-worker.ts` (scheduler 15 phút) + `maintenance-worker.int.test.ts` |
| Modify | `packages/api/src/deps.ts` (`rankings: RankingReader \| null`), `testing.ts` (default `null`), `routes/stories.ts` (Pick thêm `rankings`), `apps/web/src/server/infra.ts` (tạo reader), `apps/web/src/server/api-app.ts` (truyền vào ApiDeps) |
| Modify | `apps/web/src/lib/cache-headers.ts` (+ test): biến thể list ngắn 60 s khi dữ liệu xếp hạng lỗi |
| Create | `apps/web/src/server-fns/rankings.ts`, `routes/rankings.index.tsx` (301), `routes/rankings.$period.tsx` |
| Create | `apps/web/src/components/rankings/ranking-tabs.tsx`, `ranking-list.tsx` (+ test render) |
| Modify | `apps/web/src/components/site-footer.tsx`, `site-header.tsx` (link desktop) |
| Modify | `packages/auth/src/scripts/seed-demo.ts`: sinh `story_daily_stats` mẫu 30 ngày (chỉ seed-demo) |
| Modify | `packages/shared/messages/vi.json` (`ranking_*`) |
| Create | `apps/web/e2e/rankings.spec.ts`; helper `e2e/helpers/rankings.ts` (ghi `story_daily_stats` + gọi `recomputeAllRankings` với Redis test) |
| Modify | `docs/code-standards.md` (URL `/rankings/{period}`), `docs/project-spec.md` (`[x]` checkbox 4) |

## Function / Interface Checklist

- [ ] `rankingWindow(period, today) → { from, to, prevFrom?, prevTo? }` (thuần)
- [ ] `ViewRecord` thêm `storyId`; Lua mở rộng; `flushStoryReaders(redis, db, prefix, date)`
- [ ] `computeRankings(db, period, today)`, `writeRankings(redis, prefix, period, rows)`, `recomputeAllRankings(db, redis, prefix, now)`
- [ ] `interface RankingReader { top(period, variant, limit): Promise<string[]> }` + `createRankingReader(redis, prefix, timeoutMs)`
- [ ] `readRanking(db, reader|null, period, {includeMature, limit}) → StoryCardDto[]`
- [ ] `canonicalPath({kind:'ranking', period})`

## Implementation Steps

1. Shared: hằng, `rankingWindow`, canonical, catalog query, queue name, `perIpPerStoryPerDay`; unit test.
2. DB: bảng `story_daily_stats` + migration, sửa test đếm bảng.
3. Core đếm: mở rộng Lua + keys + `recordChapterView` + flush theo truyện; cập nhật test hiện có, thêm test: 1 IP xoay 30 viewer qua 30 chương → `suv` ≤ 10; người thật đọc 5 chương → 1.
4. Core xếp hạng: compute/write/reader/read; int test (thứ tự, 18+ chỉ ở `all`, ban bị loại khi đọc, rising bỏ < 20, kết quả rỗng xoá key live, Redis lỗi → `[]`).
5. `catalogUrls` + sitemap.
6. Worker: processor + scheduler trên `maintenance`.
7. API wiring: `ApiDeps.rankings`, `makeTestApiDeps`, `api-app.ts`, `infra.ts`; int test `GET /stories?list=ranking&period=week` qua `createApp` (khách không có 18+, người đã bật có).
8. Web: route + server-fn + component + link footer/header; cache ngắn khi lỗi.
9. Seed-demo, i18n, docs, e2e: helper tạo 3 truyện + stats → recompute → `/rankings/week` đúng thứ tự, đổi tab, `/rankings` 301, `/rankings/abc` 404, `Cache-Control: public`.
10. Gate xanh → `[x]` checkbox 4.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `rankingWindow` 4 kỳ + đổi tháng/năm; canonical; schema `storyListQuery` ranking; cache header biến thể |
| Int (core) | bước 3, 4; `catalogUrls` có 4 path xếp hạng |
| Int (api) | bước 7 |
| Unit (web) | `RankingList` số hạng 1..n, trạng thái trống |
| E2E | bước 9 |

## Dependency Map

- Cần: phase 3 (queue `maintenance`), bộ đếm lượt đọc Gđ1, `publicStoryWhere`, `selectStoryCards`, `useMatureAwareList`.
- Cung cấp: `story_daily_stats` (phase 6 có thể dùng cho tổng người đọc truyện).

## Todo List

- [ ] Shared + migration
- [ ] Đếm người đọc theo truyện + flush
- [ ] Compute/write/read + purge + sitemap
- [ ] Worker + API wiring
- [ ] Route + component + link
- [ ] Seed-demo, i18n, docs, e2e, gate, `[x]` checkbox 4

## Success Criteria

- [ ] Gate xanh
- [ ] 4 bảng có dữ liệu sau một lần recompute; HTML SSR không có 18+
- [ ] Một IP không đẩy được quá 10 người đọc/truyện/ngày
- [ ] Redis chập: trang xếp hạng vẫn 200; truyện bị ẩn biến khỏi trang xếp hạng ngay khi purge
- [ ] Checkbox 4 spec `[x]`

## Risk Assessment

- Sửa Lua đếm lượt đọc (code Gđ1): giữ nguyên hành vi cũ khi chương bị chặn cap (không đụng HLL truyện); test hiện có phải xanh không nới.
- Dữ liệu lịch sử: `story_daily_stats` bắt đầu rỗng; bảng xếp hạng đầy dần trong 30 ngày (production chưa mở, chấp nhận).
- Bot nhiều IP vẫn bơm được; ngoài phạm vi (theo dõi sau khi mở public).

## Security Considerations

- Chỉ dữ liệu tổng hợp; bản `all` chỉ trả qua API khi tài khoản đã bật 18+.

## Next Steps

Phase 6: dashboard tác giả.
