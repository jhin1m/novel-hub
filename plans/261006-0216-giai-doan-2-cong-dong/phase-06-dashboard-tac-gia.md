---
phase: 6
title: "Dashboard tác giả"
status: completed
priority: P1
effort: "1d"
dependencies: [5]
---

# Phase 6: Dashboard tác giả

<!-- Red Team: cửa sổ cố định 30 ngày, bảng + thanh CSS thay biểu đồ SVG, không migration -->

## Context Links

- Spec: §5 Gđ2 checkbox 5 ("lượt đọc theo chương, tỷ lệ bỏ dở theo chương, lượt theo dõi mới"), §8 "Khu viết" (dashboard là nơi duy nhất được dày số liệu; `/write` có dải số liệu nhỏ), §4 (`reading_progress` "cũng là nguồn cho thống kê bỏ dở")
- Phase 3: `follows`; phase 5: `story_daily_stats`
- Scout: backend §1 (`reading_progress` chỉ giữ chương mới nhất mỗi user/truyện; `completions` không được ghi), frontend §7 (`/write`, `WriterGate`)
- Research: `research/researcher-02-rankings-author-dashboard.md` §5 (định nghĩa bỏ dở)

## Overview

Trang số liệu theo truyện `/write/stories/{publicId}/stats` cho chủ truyện, cửa sổ cố định 30 ngày: 4 ô tổng quan (lượt đọc, người đọc, theo dõi truyện mới, theo dõi tác giả mới), bảng theo chương (lượt đọc 30 ngày có thanh %, số người đã tới chương, tỷ lệ bỏ dở). Link từ thẻ truyện ở `/write` và trang quản lý truyện. Xong phase đánh `[x]` checkbox 5.

## Key Insights

- `chapter_daily_stats` PK (chapter_id, date) — truy vấn theo truyện join `chapters` lọc `story_id` + 30 ngày; `story_daily_stats` (phase 5) cho tổng người đọc truyện không cộng trùng qua chương. Không cần cache, không cần index mới (`follows_target_idx (target_type, target_id)` đã thu hẹp về một target, `packages/db/src/schema/community.ts:20-34`).
- `reading_progress` (PK user_id, story_id; index `story_id`) chỉ có cho người đã đăng nhập và là chương **mới nhất** người đó mở → bỏ dở là xấp xỉ: `reached(N)` = số người có chương hiện tại số ≥ N; `dropOff(N) = 1 − reached(N+1) / reached(N)` (chương cuối: không tính). Trừ chính tác giả. Ghi rõ trên trang.
- `canEditStory` chỉ cho chủ truyện (`packages/core/src/policies/story.ts:10-12`).
- `/write/*` không đặt `headers`; trang mới là dữ liệu cá nhân → tải ở client qua API, route `NO_STORE` như `/library`. Bọc `WriterGate`.
- Thanh % bằng `div` (track `--secondary`, fill `--primary`) như phân bố đánh giá phase 4 — không biểu đồ SVG, không thư viện.

## Requirements

**Functional**
- Quyền: `canEditStory(user, story)`; không phải chủ → `NOT_FOUND` (không lộ tồn tại).
- `GET /author-stats/:publicId` trả:
  - `totals` (30 ngày gần nhất theo `statsDate()`): `views` (tổng `chapter_daily_stats.views`), `readers` (tổng `story_daily_stats.unique_readers`), `newStoryFollows`, `newAuthorFollows`, `storyFollowersTotal`.
  - `chapters`: mọi chương đã đăng (không xoá) theo `number`: `{number, title, views30d, reached, dropOffPct|null}`; `reached`/`dropOff` trên toàn bộ thời gian.
- Trang: tiêu đề + tên truyện, dòng "30 ngày gần nhất", 4 ô số (nền `--band`), bảng chương (cột: Chương, Lượt đọc 30 ngày + thanh % so với chương cao nhất, Đã tới, Bỏ dở %), chú thích một dòng về cách tính bỏ dở. Bảng > 100 chương: phân trang client 100/trang. Trạng thái trống khi chưa có chương đăng.
- Link "Số liệu" trên `my-story-card.tsx` và trang quản lý truyện.

**Non-functional**
- Một request API, 4–5 query SQL, không N+1.
- Bảng là `<table>` thật (đọc được bằng trình đọc màn hình); thanh % `aria-hidden`.

## Architecture

```
/write/stories/$publicId/stats (NO_STORE, WriterGate) → useStoryStats(publicId) ── GET /api/v1/author-stats/:publicId
  core/author-stats/get-story-stats.ts
    q1: chapter_daily_stats ⋈ chapters (story, 30 ngày) GROUP BY chapter → views30d + tổng views
    q2: story_daily_stats (story, 30 ngày) → readers
    q3: reading_progress ⋈ chapters → count GROUP BY chapter number (user_id <> author)
    q4: follows count (story, 30 ngày + tổng), follows count (user = author, 30 ngày)
  computeDropOff(reached) (thuần)
```

## Related Code Files

| Hành động | File |
|---|---|
| Create | `packages/shared/src/schemas/author-stats.ts` (+ test): DTO, `STATS_WINDOW_DAYS = 30` |
| Create | `packages/core/src/author-stats/get-story-stats.ts`, `drop-off.ts` (+ `drop-off.test.ts`), `author-stats.int.test.ts`; Modify `core/src/index.ts` |
| Create | `packages/api/src/routes/author-stats.ts` (+ int test); Modify `app.ts` |
| Create | `apps/web/src/lib/author-stats.ts` |
| Create | `apps/web/src/components/stats/stats-totals.tsx`, `chapter-stats-table.tsx` (+ test render) |
| Create | `apps/web/src/routes/write/stories/$publicId/stats.tsx` |
| Modify | `apps/web/src/components/write/my-story-card.tsx`, `routes/write/stories/$publicId/index.tsx` (link "Số liệu") |
| Modify | `packages/shared/messages/vi.json` (`dashboard_*`) |
| Create | `apps/web/e2e/author-stats.spec.ts` (ghi `chapter_daily_stats`, `story_daily_stats`, `reading_progress`, `follows` bằng helper SQL) |
| Modify | `docs/code-standards.md` (URL), `docs/project-spec.md` (`[x]` checkbox 5) |

## Function / Interface Checklist

- [x] `getStoryStats(db, actor, publicId, today) → Result<StoryStatsDto, 'NOT_FOUND'>`
- [x] `computeDropOff(reached: Array<{number, reached}>) → Array<{number, reached, dropOffPct: number|null}>` (thuần; chia 0 → null)
- [x] Route `GET /author-stats/:publicId` (`requireAuth`)

## Implementation Steps

1. Shared schema/DTO.
2. Core: `computeDropOff` + unit test; `getStoryStats` + int test (3 chương, 5 người đọc ở các chương khác nhau, tác giả có progress → bị trừ, follow trong/ngoài 30 ngày, stats ngoài cửa sổ không tính, người khác gọi → `NOT_FOUND`).
3. API sub-app + int test (401 khách, 404 không phải chủ).
4. Web: route, component, link.
5. i18n, docs, e2e: tác giả mở trang số liệu, tổng lượt đọc khớp dữ liệu seed, bảng có cột bỏ dở; người khác mở URL → trạng thái không tìm thấy.
6. Gate xanh → `[x]` checkbox 5.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `computeDropOff` (giảm dần, bằng 0, chương cuối null) |
| Int (core) | bước 2 |
| Int (api) | bước 3 |
| Unit (web) | `ChapterStatsTable` render `—` khi `dropOffPct` null, độ rộng thanh theo % |
| E2E | bước 5 |

## Dependency Map

- Cần: phase 3 (`follows`), phase 5 (`story_daily_stats`), `chapter_daily_stats`, `reading_progress`, `canEditStory`, `WriterGate`, `statsDate()`.
- Cung cấp: không phase sau phụ thuộc.

## Todo List

- [x] Shared + core + API
- [x] Trang số liệu + link
- [x] i18n, docs, e2e, gate, `[x]` checkbox 5

## Success Criteria

- [x] Gate xanh
- [x] Chủ truyện xem được lượt đọc theo chương, tỷ lệ bỏ dở, theo dõi mới (30 ngày); người khác không xem được
- [x] Checkbox 5 spec `[x]`

## Risk Assessment

- Bỏ dở xấp xỉ có thể gây hiểu nhầm → chú thích ngay dưới bảng.
- Khoảng 7/90 ngày, biểu đồ theo ngày: ngoài phạm vi năm đầu, thêm khi tác giả cần. [auto]

## Security Considerations

- Chỉ trả số tổng hợp, không danh sách người đọc/người theo dõi. Kiểm quyền ở core bằng `canEditStory`.

## Next Steps

Phase 7: huy hiệu và cột mốc.

## Implementation Notes (2026-10-06)

- [auto] Bảng chỉ liệt kê chương `published` chưa xoá; `totals.views` vẫn cộng lượt đọc của chương đã xoá/bị ẩn trong 30 ngày. Lý do: tổng phản ánh đúng lượt đọc thật, comment ghi trong `get-story-stats.ts`.
- [auto] Người dừng ở chương đã xoá/ẩn vẫn tính "đã tới" cho mọi chương liệt kê trước nó (`reachedByChapter`). Lý do: họ đã đọc qua các chương đó.
- [auto] Ô "người đọc" = tổng người đọc khác nhau mỗi ngày, cộng dồn 30 ngày; ghi chú một dòng trên trang. Lý do: `story_daily_stats` không cho số người khác nhau cả kỳ.
- `addDays` trong `packages/shared/src/rankings.ts` được export để dùng lại cho `authorStatsWindow`.
- E2E: spec xoá `story_daily_stats` đã seed khi kết thúc, vì xếp hạng tính từ mọi truyện có số liệu (đã làm vỡ `rankings.spec` ở lượt gate đầu).
- Review: sửa vùng chạm link "Số liệu" trên card và `role="group"` cho `<dl>`; [auto] bỏ qua 3 ghi chú thấp còn lại (mất focus nút "Sau" ở trang cuối khi >100 chương, tổng ≠ tổng bảng, tên link lặp). Lý do: hiếm/có chủ đích, YAGNI.
