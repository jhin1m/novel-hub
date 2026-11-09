---
phase: 5
title: "Kệ truyện, xếp hạng, khối mời viết"
status: pending
priority: P1
effort: "4h"
dependencies: [3, 4]
---

# Phase 5: Kệ truyện, xếp hạng, khối mời viết

**Status:** pending

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- HTML của danh sách không có truyện 18+; người đã bật 18+ tải thêm ở client qua `useMatureAwareList`. `CONTESTS_ENABLED` giữ false. Không gradient, không nền tím.
- Brief mục 5. Board: `design-boards/Main.dc.html` dòng 100-166, `design-boards/Mobile.dc.html` dòng 70-96.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Phần còn lại của trang chủ theo board: kệ "Vừa có chương mới", thẻ "Đang được đọc nhiều", kệ "Trọn bộ, đọc một mạch", dải "Có truyện muốn kể?".

## Requirements

**Thứ tự trang:** hero, thanh Đọc tiếp, "Hôm nay đọc gì?", hàng 2 cột [Vừa có chương mới | Đang được đọc nhiều], Truyện nổi bật (ẩn khi rỗng), Trọn bộ, Truyện mới cần độc giả (ẩn khi rỗng), dải mời viết. Khoảng cách khu 68px, khung 1240.

**`StoryShelfCard`:** ô đệm ngang 12px, bìa 2:3 bo `6px 6px 2px 2px`, bóng `0 8px 14px -6px rgba(43,39,34,.45)`; vạch kệ cao 5px tràn `-mx-3`, cách chữ 12px, màu `--shelf-line`; tên 15px/1.3 700; meta 13px `--muted-foreground` một dòng. Lưới `repeat(auto-fill,minmax(165px,1fr))`, `row-gap: 34px`, không gap ngang để vạch kệ liền.

Meta "Chương N · thể loại" (kệ mới) hoặc "N chương · thể loại" (kệ trọn bộ); nhãn "AI" và "18+" giữ trên cùng dòng, không bị cắt. Một thẻ đúng một `<a>` phủ cả thẻ.

**Biến thể `compact`** (trang truyện dùng): chỉ tên, đệm ngang 7px, bìa bo `5px 5px 2px 2px`, bóng `0 6px 10px -5px rgba(43,39,34,.45)`, vạch 4px tràn `-mx-[7px]`, cách chữ 8px, tên 13px/1.3 700.

**Mobile kệ:** cuộn ngang, ô 136px, tối đa 5 truyện ở kệ mới, cắt bằng CSS (`max-sm:[&>li:nth-child(n+6)]:hidden`), không dựa vào viewport trong render.

**Vừa có chương mới:** h2 36px (mobile 29px) 700, "Xem thêm" 700 màu nhấn tới `/search?sort=updated`. Đúng 10 bìa kể cả khi danh sách được thay bằng bản có 18+, bỏ các dòng rút gọn.

**Đang được đọc nhiều:** `aside`-kiểu thẻ nền `--card`, viền, bo 24, padding 24, cột `flex: 1 1 320px`; tiêu đề 28px 700. Tab Ngày/Tuần/Tháng/Đang lên nền `--band`, pill chọn nền `--card`. Dòng: số 34px 700 (1-3 `--primary`, còn lại `--muted-foreground`), bìa 50px, tên 15px 700, meta "thể loại · trạng thái". Link "Xem đủ bảng tuần". Mobile: top 3, không tab.

**Trọn bộ:** cùng kiểu kệ, "Xem thêm" tới `/search?status=completed`.

**Có truyện muốn kể?:** dải `--band`, khung 760 căn giữa, padding 64, h2 `clamp(34px,4vw,48px)`, từ "kể" màu nhấn, body 16px, pill "Bắt đầu viết" cao 52.

## Key Insights

- `m.home_completed_title` còn được `search/explore-entry-rows.tsx:27` dùng và `e2e/explore.spec.ts:70` kiểm "Vừa hoàn thành": thêm khóa mới, không sửa khóa cũ.
- `m.home_recent`, `m.home_rankings_title` chỉ trang chủ dùng: đổi giá trị trực tiếp.
- Dải "Truyện mới đáng chú ý" bị bỏ theo board; `listNotable` chỉ còn phục vụ hero nên gọi `limit: 1`, và bỏ `notable` khỏi `HomePageData`. Bỏ `useMatureAwareList` của notable và mục notable trong `claimSections`. API `?list=notable` giữ nguyên vì là contract `/api/v1`.
- Giữ link tới `/rankings/nominations` trong tab của trang xếp hạng; board bỏ link này khỏi trang chủ.
- `CATALOG_PAGE_SIZE` là 24: SSR lấy đúng 10 qua hằng mới `HOME_RECENT_LIMIT`, tránh nối chương mới nhất cho 14 truyện thừa.
- Khối mời viết vẫn có nhánh cuộc thi cho khi bật lại `CONTESTS_ENABLED`; thêm khóa tiêu đề riêng cho dải mới, không đổi `home_invite_title` đang dùng ở nhánh cuộc thi.
- Sau khi viết lại, các prop chỉ phục vụ giao diện cũ mất nơi gọi: `showLatestChapter` (`StoryGrid`, `StoryCard`), `compactOnMobile` (`StoryRowList`), `priority` (`RankingList`). Grep rồi xóa cùng test của chúng nếu không còn nơi gọi.

## Related Code Files

| File | Việc | Test bị ảnh hưởng |
|------|------|--------------------|
| `apps/web/src/components/story/story-shelf-card.tsx` | Tạo, có biến thể chỉ tên (phase 6 dùng) | test mới |
| `apps/web/src/components/story/story-shelf.tsx` | Tạo: lưới và cuộn ngang | test mới |
| `apps/web/src/components/home/home-recent-updates.tsx` | Viết lại | `.test.tsx` (3) |
| `apps/web/src/components/home/home-recently-completed.tsx` | Dùng kệ | |
| `apps/web/src/components/home/home-featured-picks.tsx`, `home-new-spotlight.tsx` | Dùng kệ | `e2e/featured.spec.ts`, `e2e/catalog.spec.ts:84` |
| `apps/web/src/components/home/home-rankings.tsx` | Thẻ mới, danh sách riêng | `.test.tsx` (4), `e2e/rankings.spec.ts:79-92` |
| `apps/web/src/components/home/home-write-band.tsx` | Nhánh không cuộc thi | `.test.tsx` (2), `e2e/home-contests.spec.ts` |
| `apps/web/src/routes/index.tsx` | Thứ tự mới, bỏ notable | `lib/home-sections.test.ts:64-97` sửa theo các khu thật (bỏ notable) |
| `packages/core/src/catalog/home-page.ts` | `notable` thành `limit: 1` và bỏ khỏi `HomePageData`; `recent` lấy `HOME_RECENT_LIMIT` | `catalog.int.test.ts:261` |
| `packages/shared/src/` (cùng chỗ `HOME_COMPLETED_LIMIT`), `index.ts` | `HOME_RECENT_LIMIT = 10` | |
| `story-grid.tsx`, `story-card.tsx`, `story-row-list.tsx`, `ranking-list.tsx` | Xóa prop mồ côi | `story-card.test.tsx`, `story-row-list.test.tsx`, `ranking-list.test.tsx` |
| `apps/web/src/styles/tokens.css`, `token-values.ts` | `--shelf-line` Ngà `#d8ceb9`, Tối `#3a413d` (cả 2 khối Tối) | `tokens.test.ts` |
| `packages/shared/messages/vi.json` | Xem dưới | |
| `apps/web/e2e/featured.spec.ts:69` | Tiêu đề mới | |
| `apps/web/e2e/catalog.spec.ts` | `:72` tiêu đề mới; `:85,117` bỏ assert dòng phụ; `:98` đổi kỳ vọng thành "Chương 3 · {tag}", giữ ý chứng minh chương mới nhất đọc được; `:101,112` kiểm link theo `aria-label` và `href`; `:116` region tên mới; `:125,137` bỏ `notable-title`, đổi tên test | |

Message: `home_recent` "Vừa có chương mới"; `home_rankings_title` "Đang được đọc nhiều"; `home_completed_shelf_title` "Trọn bộ, đọc một mạch"; `home_invite_band_before` "Có truyện muốn ", `home_invite_band_accent` "kể", `home_invite_band_after` "?"; `home_section_more` "Xem thêm" (`aria-label` dùng `home_recent_more`, `home_completed_more`); `story_shelf_ai` "AI". Dùng lại `chapter_number` cho "Chương N". Xóa `home_notable`, `home_notable_subtitle`, `home_recent_subtitle`, `home_rankings_subtitle`, `home_rankings_nominations`, `home_completed_subtitle` nếu hết dùng.

## Implementation Steps

1. Token `--shelf-line`, giữ nguyên văn trong cả 2 khối Tối (`tokens.test.ts` so 2 khối).
2. `StoryShelfCard({ story, meta, compact })`, `StoryShelf({ stories, limit, renderMeta, mobileLimit })`: `limit` cắt bằng `slice` (như nhau ở server và client), `mobileLimit` chỉ bằng CSS. Dùng `StoryCover` với `sizes` phù hợp, lazy.
3. Viết lại `HomeRecentUpdates`: meta `m.chapter_number`, thiếu `latestChapter` thì "N chương", `limit={HOME_RECENT_LIMIT}`. Danh sách khi bật 18+ vẫn đến từ `recentList`.
4. `HomeRankings`: giữ `useState`, `pickDefaultPeriod`, `hasAnyRanking`. Danh sách là `<ol>`; tiêu đề h3 để `e2e/rankings.spec.ts` lấy được. Top 3 ở mobile bằng `max-md:[&>li:nth-child(n+4)]:hidden`. Tab `hidden md:flex`.
5. Hàng 2 cột trong `routes/index.tsx`: `flex flex-wrap items-start gap-12`, kệ `flex-[999_1_560px]`, thẻ `flex-[1_1_320px]`.
6. Các khu khác, dải mời viết, bỏ khu notable, dọn import, message, prop mồ côi.
7. Sửa test.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | HTML `/` không có truyện 18+ ở mọi kệ và bảng xếp hạng | `e2e/catalog.spec.ts` |
| Critical | Tài khoản bật 18+ thấy truyện 18+ ở kệ mới, có nhãn 18+ | `e2e/catalog.spec.ts` |
| High | Thẻ kệ có đúng một link, meta đúng, nhãn AI và 18+ còn | test component |
| High | Tab xếp hạng đổi danh sách không gửi request; link `/rankings/week` | `e2e/rankings.spec.ts` |
| High | Không lặp truyện giữa hero, nổi bật, trọn bộ, cần độc giả | `lib/home-sections.test.ts`, `e2e/catalog.spec.ts:128` |
| High | Kệ mới đúng 10 thẻ trong HTML, kể cả khi danh sách 18+ dài hơn | component |
| Medium | Không truyện nổi bật hoặc cần độc giả: khu ẩn | component |
| Medium | Xếp hạng không đọc được: thẻ ẩn, cột kệ chiếm hết hàng | `home-rankings.test.tsx` |

## Interface Checklist

- [ ] `StoryShelfCard`, `StoryShelf`
- [ ] `HomeRankings` (danh sách mới, không dùng `RankingList`)
- [ ] `HomeWriteBand` nhánh không cuộc thi, tiêu đề 3 phần viết thẳng trong JSX
- [ ] `HOME_RECENT_LIMIT`, `HomePageData` (bỏ `notable`)

## Dependency Map

Cần phase 3 (hero, thanh), phase 4 (khu thể loại đã vào trang). `StoryShelfCard` dùng ở phase 6.

## Success Criteria

- [ ] Thứ tự, tiêu đề, cỡ chữ khớp board ở 1440 và 390
- [ ] Vạch kệ liền nhau, đổi màu đúng ở theme Tối
- [ ] Hai khu nổi bật và cần độc giả vẫn hiển thị khi có dữ liệu
- [ ] Gate xanh

## Risk Assessment

- Vạch kệ tràn gây cuộn ngang trên mobile: `overflow-x-auto` đặt trên hàng cuộn, kiểm `scrollWidth`.
- Nhãn trong meta bị `truncate` cắt: phần chữ `truncate`, nhãn `shrink-0`.
- Kệ mới giảm từ 18 xuống 10 truyện: e2e chạy song song có thể đẩy truyện của test ra khỏi kệ. Test cần truyện trên kệ thì `update last_chapter_at` ngay trước khi tải trang.
