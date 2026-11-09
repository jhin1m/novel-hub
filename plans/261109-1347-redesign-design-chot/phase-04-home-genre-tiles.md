---
phase: 4
title: "Bốn ô thể loại"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Bốn ô thể loại

**Status:** pending

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- Logic trong `packages/core`, route không truy vấn DB. Không đổi schema. Không gradient, không nền tím.
- **Không bao giờ dùng truyện 18+ trong HTML.** Trang chủ cache công khai.
- Brief mục 4. Board: `design-boards/Main.dc.html` dòng 85-98 và 199-211, `design-boards/Mobile.dc.html` dòng 58-68.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Thay hàng chip thể loại bằng khu "Hôm nay đọc gì?" với 4 ô trỏ tới tag thật, nền là bìa làm mờ của truyện thuộc thể loại đó.

## Requirements

- Ô và slug: Ngôn tình `ngon-tinh`, Tiên hiệp `tien-hiep`, Kinh dị `kinh-di`, Huyền huyễn `huyen-huyen`. Link `canonicalPath({ kind: 'tag', slug })`. Tên lấy từ DB.
- Dòng phụ: "Thương từ cái nhìn đầu"; "Kiếm hiệp, tu tiên, một đường tới đỉnh"; "Trinh thám, rùng rợn, đừng đọc một mình"; "Khoa huyễn, phép thuật, thế giới khác".
- Có truyện có bìa: nền dùng `CoverBackdrop` (cùng cách xử lý với hero, lớp phủ .64: chữ `--cover-fg` đạt tối thiểu 4,99:1 kể cả ảnh trắng). Cụm 3 bìa nhỏ từ `md`.
- Thiếu bìa: màu trơn dự phòng: Ngôn tình `#a8431f` (`--cover-7`), Tiên hiệp `#2f5d50` (`--cover-4`), Kinh dị `#3a3632` (`--cover-9`), Huyền huyễn `#2e5266` (`--cover-5`). Dùng lại các token bìa, không thêm token.
- Bố cục: tiêu đề h2 "Hôm nay **đọc** gì?" 36px (mobile 29px) 700 tracking -0.02em, từ "đọc" màu `--primary`. Lưới `repeat(auto-fit,minmax(260px,1fr))`, gap 16. Ô cao 232, bo 24, padding 24; tên ô 36px 700, dòng phụ 14px `max-w-[200px]`. Mobile: 2 cột, gap 10, `min-h-[124px]`, bo 20, padding 16, tên 27px, dòng phụ 13px, bỏ cụm bìa.
- Cụm bìa: 3 ảnh rộng 88px, 2:3, bo 6, `bottom:-26px`, `right` = 14 + (2 - i) × 54 px, `rotate(i × 7 - 7 deg)`, `z-index: i`, bóng `0 10px 20px` đen 40%. Nằm trong `overflow-hidden`, `alt=""`.

## Key Insights

- Một truy vấn với `row_number() over (partition by …)` lấy tối đa 3 bìa cho cả 4 thể loại, không N+1.
- Thể loại của truyện dùng tag chuẩn: `coalesce(main_tag.canonical_id, main_tag.id)`, vì fixtures có `tu-tien` gộp vào `tien-hiep`.
- Lọc bằng `publicStoryWhere({ includeMature: false })`, `cover_url is not null`. Không tham số nào cho phép 18+. Không áp ngưỡng 3 chương vì brief chỉ cho màu dự phòng khi thể loại chưa có truyện có bìa.
- Hàm `listGenres` vẫn được `/search` dùng; chỉ bỏ khỏi `getHomePage`.
- Chữ luôn đạt AA ngay cả trước khi ảnh tải vì nền ô đặt sẵn màu dự phòng (thấp nhất 5,35:1).
- `isolate` trên ô để bo góc cắt đúng ảnh `filter` trên Safari.

## Related Code Files

| File | Việc | Test bị ảnh hưởng |
|------|------|--------------------|
| `packages/shared/src/` (cùng chỗ `HOME_LISTING_RULES`) | `HOME_GENRE_TILE_SLUGS`, `HOME_GENRE_TILE_COVERS = 3`, export ở `index.ts` | |
| `packages/core/src/catalog/home-genre-tiles.ts` | Tạo `listHomeGenreTiles(db)` | `home-genre-tiles.int.test.ts` mới |
| `packages/core/src/catalog/home-page.ts` | Thêm `genreTiles`, bỏ `genres` | `catalog.int.test.ts` |
| `packages/core/src/index.ts` | Export | |
| `apps/web/src/components/home/home-genre-tiles.tsx` | Tạo | test mới |
| `apps/web/src/components/home/home-genre-chips.tsx` | Xóa | |
| `apps/web/src/routes/index.tsx` | Thay chip bằng ô, đặt ngay sau thanh Đọc tiếp | |
| `apps/web/e2e/catalog.spec.ts` | Cập nhật `update cover_url` cho truyện 18+ (URL duy nhất), assert HTML không chứa URL | |
| `packages/shared/messages/vi.json` | `home_mood_title_before` "Hôm nay ", `home_mood_title_accent` "đọc", `home_mood_title_after` " gì?", 4 dòng phụ; xóa `home_genres`, `home_genres_all` | |

## Architecture

```ts
export interface HomeGenreTile {
  slug: string;
  name: string;
  coverUrls: string[]; // newest first, at most 3; the first is the backdrop
}
export async function listHomeGenreTiles(db: Db): Promise<HomeGenreTile[]>;
```

Bước 1: `select id, slug, name from tags where slug in (…) and kind = 'genre' and canonical_id is null`. Tag thiếu thì không có ô đó. Bước 2: một truy vấn xếp hạng, join `users` (để `publicStoryWhere` lọc tác giả bị ban) và `tags` (alias) lấy tag chuẩn, `order by last_chapter_at desc nulls last, id desc` trong partition, lấy `rn <= 3`. Giữ đúng thứ tự `HOME_GENRE_TILE_SLUGS`.

Màu dự phòng trong web: `Record<slug, 'var(--cover-N)'>`. Chỉ giá trị từ bảng hằng đi vào `style`.

Tiêu đề viết thẳng trong JSX: `{before}<span className="text-primary">{accent}</span>{after}`.

## Implementation Steps

1. Viết int test trước: truyện 18+ mới nhất không vào; tác giả bị ban không vào; truyện `hidden_by_mod` không vào; không bìa không vào; truyện dưới ngưỡng trang chủ vẫn vào; tag gộp tính vào tag chuẩn; tối đa 3 bìa, mới nhất trước; số truy vấn không tăng theo số thể loại.
2. Viết `listHomeGenreTiles`, nối vào `getHomePage`.
3. `HomeGenreTiles` và tiêu đề. Ảnh nền `eager={false}` vì dưới màn đầu. Thẻ `<a>` phủ cả ô, tên tiếng Việt qua tên ô.
4. `routes/index.tsx`, xóa chip, dọn message.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | Truyện 18+ có bìa, mới nhất trong thể loại: URL bìa không có trong dữ liệu và HTML (ô không in tên truyện nên phải assert theo URL) | int test, `e2e/catalog.spec.ts` |
| Critical | Tác giả bị ban, truyện bị ẩn: không dùng bìa | int test |
| High | Thể loại không có bìa: `coverUrls` rỗng, ô màu trơn, không có `<img>` | int, component |
| High | Link trỏ `/tags/{slug}` tag thật | component, e2e |
| High | 4 màu dự phòng đạt AA với `--cover-fg` | `tokens.test.ts` (đã có) |
| Medium | Mobile không render hình cụm bìa (`hidden md:block`) | component |

## Interface Checklist

- [ ] `HOME_GENRE_TILE_SLUGS`, `HOME_GENRE_TILE_COVERS`
- [ ] `HomeGenreTile`, `listHomeGenreTiles`, `HomePageData.genreTiles`
- [ ] `HomeGenreTiles`

## Dependency Map

Cần `CoverBackdrop` của phase 3.

## Success Criteria

- [ ] 4 ô khớp board ở 1440 và 390, trừ nền bìa mờ theo brief
- [ ] `getHomePage` không truy vấn theo từng thể loại
- [ ] Loader trang chủ vẫn gọn, route không truy vấn DB
- [ ] Gate xanh

## Risk Assessment

- Production thiếu tag: ô đó biến mất thay vì link hỏng; `pnpm db:seed-tags` đã có 4 slug này.
- Bìa thay đổi nhưng HTML cache: cùng tuổi cache như mọi danh sách trang chủ.
