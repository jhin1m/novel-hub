---
phase: 4
title: "Trang chủ"
status: pending
priority: P1
effort: "0.75d"
dependencies: [3]
---

# Phase 4: Trang chủ

## Overview

Viết lại thân trang `/`: chip thể loại → hàng hero "Mới đáng chú ý" + "Đọc tiếp" (client) → "Mới cập nhật" dạng hàng trong thẻ → "Truyện mới đáng chú ý" trên dải `--band`. Giữ loader, `headers`, `head`, cache công khai, không đổi `getHomePage`.

Nguồn: brainstorm §6.1, §8 (trang chủ); scout-02 mục P4; quyết định [auto] hero, "Đọc tiếp", `formatDate`, "Xem tất cả" trong `plan.md`; red team #4, #6, #10, #13, #15.

## Requirements

- **Chip thể loại:** `nav aria-label="Thể loại"` (`home_genres`), chip "Tất cả" (`<a href="/" aria-current="page">`, trạng thái chọn nền `--primary` chữ `--primary-foreground`, render trực tiếp trong `home-genre-chips.tsx`) + mỗi tag trong loader `genres` một `TagChip` (link `/tags/{slug}`, tên = tên tag, chấm `coverColorVar`). Desktop `flex-wrap`; mobile một hàng `overflow-x-auto` trong container (không `100vw`).
<!-- Updated: Red Team 2026-10-06 - hero nhãn "Mới đáng chú ý", truyện đầu có chapterCount > 0 -->
- **Hero "Mới đáng chú ý"** (`section aria-labelledby`, flex `999 1 560px`): truyện = **truyện đầu tiên có `chapterCount > 0`** trong `notable` của **SSR** (luôn không 18+); không có truyện nào → **không render hero**. Lý do: chưa có `featured_slots`, không ai chọn tay nên không dùng nhãn "Biên tập chọn"; `listNotable` lấp chỗ bằng truyện công khai mới nhất mà không lọc số chương (`packages/core/src/catalog/home.ts:70-75`) nên có thể là truyện 0 chương. Nền `coverColorVar(mainTag.slug)`, `rounded-[28px]` (mobile `rounded-3xl`), padding 32 (mobile 20), mọi chữ `text-[var(--cover-fg)]` phân cấp bằng cỡ/độ đậm (không giảm opacity). Trái: nhãn viền "Mới đáng chú ý" (icon sao `aria-hidden`, viền `--cover-fg` mờ trang trí, nền trong suốt) + meta "Thể loại · N chương · Tình trạng"; `h2` tên truyện 38/800 (mobile 24/800) là link trang truyện; bút danh; nút đặc **"Xem truyện"** nền `--cover-fg`, chữ `var(--cover-N)` (≥ 5.02:1; **không** dùng `--foreground` vì dark là chữ sáng). Phải: `StoryCover` 196px (mobile ~96px) có bóng `shadow-[0_20px_44px_rgba(0,0,0,0.26)]`, **không** bọc link. Không giới thiệu, không "Đọc chương 1", không carousel.
- Không có hero → hàng chỉ còn "Đọc tiếp" (nếu có); khách → hero chiếm cả hàng.
<!-- Updated: Red Team 2026-10-06 - "Đọc tiếp" chỉ "Chương X · tên chương", bỏ mẫu số/"Còn N"/thanh tiến độ -->
- **Đọc tiếp** (`aside aria-labelledby` tiêu đề khối, flex `1 1 340px`, thẻ `--card` bo 28): chỉ render khi `useMe().data` có; dữ liệu `useHistory(true)` trang 1, lọc `!item.story.isMature || showMature` với `showMature = me.data.preferences.showMature === true` (**không** dùng hint `nh:mature`/`data-mature-ok`, chỉ để hiển thị, `lib/boot-script.ts:11-15`), tối đa 3 hàng. Mỗi hàng: bìa 54px (không link), tên truyện (chữ thường, không link), dòng "Chương X" (`m.chapter_number`) + " · {chapterTitle}" khi `chapterTitle` khác null (`HistoryItemDto.chapterTitle`, `packages/core/src/reading/history.ts:16`), `ResumeLink` cỡ `sm` (link duy nhất của hàng). **Không** mẫu số "/ Y", **không** "Còn N chương", **không** thanh tiến độ. Lý do: `chapterNumber` có khoảng trống do xoá mềm/nháp (`packages/core/src/chapters/create-chapter.ts:12,29-36`), `chapterCount` chỉ đếm chương đã đăng (`packages/core/src/publishing/counters.ts:10-15`) → "Chương 9 / 7"; nhất quán với quyết định bỏ thanh tiến độ `/library`. Hàng đầu nền `--primary-soft`. Link "Tủ truyện" `/library` ở góc. Danh sách rỗng sau lọc → không render. HTML SSR không chứa khối này.
- **Mới cập nhật:** `section` + `SectionHeading` (icon `ClockIcon`, dòng phụ), `StoryRowList` (24 truyện từ `useMatureAwareList` như hiện tại). Rỗng → `home_empty`.
- **Truyện mới đáng chú ý:** dải `bg-band` full-width (`py-11`), bên trong container 1240; `SectionHeading onBand` (icon `SparklesIcon`); `StoryGrid scroll` (mobile cuộn ngang thẻ 140px). Danh sách = `notableList` **bỏ truyện hero theo `publicId`** (không `slice(1)`), áp cho cả list SSR và list API khi `showMature` bật.
- Không nút "Xem tất cả"; không bảng xếp hạng; container `max-w-[1240px] px-4 md:px-8`, các khu cách nhau 52 (`gap-[52px]`); giữ `<h1 className="sr-only">`. Bỏ `HomeSection` (kéo theo `font-serif` ở `routes/index.tsx:78`); tiêu đề mới đều sans.
- Thời gian: `formatDate()` (đã nằm trong `StoryCard` row từ phase 2).

## Architecture

```
loader getHomePage() → { recent, notable, genres }   (SSR, không 18+, cache công khai)
HomePage
 ├─ HomeGenreChips(genres)
 ├─ row: HomeFeaturedHero(hero = pickHero(notable))   ← SSR; null → không render
 │       HomeContinueReading()                          ← client: useMe + useHistory → continueRows()
 ├─ section Mới cập nhật: StoryRowList(useMatureAwareList(recent))
 └─ band Truyện mới đáng chú ý: StoryGrid(withoutStory(useMatureAwareList(notable).stories, hero?.publicId))
```

## Related Code Files

- **Modify:** `apps/web/src/routes/index.tsx`, `apps/web/src/components/library/continue-reading-button.tsx` (prop `className` của `ResumeLink`), `packages/shared/messages/vi.json`, `apps/web/e2e/catalog.spec.ts`
- **Create:** `components/home/home-genre-chips.tsx`, `components/home/home-featured-hero.tsx`, `components/home/home-continue-reading.tsx`, `lib/home.ts`, `lib/home.test.ts`
- **Delete:** không

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `routes/index.tsx` | 84 | thân trang mới; xoá `HomeSection`, badge genre; giữ `loader`/`headers`/`head` |
| `components/home/home-genre-chips.tsx` | mới | nav chip |
| `components/home/home-featured-hero.tsx` | mới | hero |
| `components/home/home-continue-reading.tsx` | mới | aside client-only |
| `lib/home.ts` (+ test) | mới | `pickHero`, `withoutStory`, `continueRows` |
| `components/library/continue-reading-button.tsx` | 81 | `ResumeLink` nhận `className?` (truyền vào `Button`) |
| `e2e/catalog.spec.ts` | — | thêm test 18+ trong "Đọc tiếp" |
| `server-fns/catalog.ts`, `packages/core/src/catalog/home.ts` | 50 / 106 | **không sửa** |
| `lib/use-mature-aware-list.ts`, `lib/library.ts` | 28 / 125 | không sửa |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `pickHero([])` → null; mọi truyện `chapterCount` 0 → null; bỏ qua truyện 0 chương đầu danh sách, trả truyện đầu có `chapterCount > 0` | unit | `lib/home.test.ts` | mới |
| `withoutStory(list, id)` bỏ đúng truyện, giữ thứ tự; id null → nguyên list | unit | `lib/home.test.ts` | mới |
| `continueRows(items, showMature=false)` bỏ 18+, cắt 3; `true` giữ 18+ | unit | `lib/home.test.ts` | mới |
| HTML `/` chứa `normal.title`, `other.title`, "Mới cập nhật"; không chứa 18+/nháp; không chứa "Biên tập chọn"; cache list; không set-cookie; hydrate sạch | e2e | `catalog.spec.ts` | giữ (+ assert không "Biên tập chọn") |
| `link {name: normal.title}.first()` trên `/` dẫn tới trang truyện | e2e | `catalog.spec.ts` | giữ |
| Bật 18+: `link {name: mature.title}.first()` hiện trên `/`; tắt: count 0 | e2e | `catalog.spec.ts` | giữ |
| <!-- Updated: Red Team 2026-10-06 - e2e lọc 18+ ở "Đọc tiếp" --> User bật 18+ (`allowMatureContent`), PUT tiến độ cho truyện thường và truyện 18+ qua `PUT /api/v1/reading/progress` (như `reader-progress.spec.ts:6`), tắt 18+ (checkbox "Hiện nội dung 18+" ở `/settings`); vào `/`: `complementary 'Đọc tiếp'` hiện, chứa `normal.title`, không chứa `mature.title`; `link {name: mature.title}` count 0 | e2e | `catalog.spec.ts` | mới |
| `/` 360/390/640/768 không tràn ngang | e2e | `header-mobile.spec.ts`, `mobile-navigation.spec.ts` | giữ |
| Preload font + `/` không tải Literata/Noto | e2e | `layout.spec.ts` | giữ |

Bỏ e2e "khách: không có `complementary` Đọc tiếp" (pass cả khi khối không tồn tại, red team #13); test 18+ ở trên kiểm khối hiện thật.

## Function/interface checklist

- [ ] `pickHero<T extends { chapterCount: number }>(stories: readonly T[]): T | null` (truyện đầu có `chapterCount > 0`; giữ hàm riêng + test vì red team #10 thêm điều kiện lọc — #13 chỉ bỏ helper một dòng)
- [ ] `withoutStory<T extends { publicId: string }>(stories: readonly T[], publicId: string | null): T[]`
- [ ] `continueRows<T extends { story: { isMature: boolean } }>(items: T[], showMature: boolean, max = 3): T[]`
- [ ] `HomeGenreChips({ genres })`, `HomeFeaturedHero({ story })`, `HomeContinueReading()`
- [ ] `ResumeLink({ story, number, scrollPct, size?, className? })` (không thêm `variant`)

## Dependency map

- **Cần từ trước:** P1 `--band`, `--primary-soft`, `--cover-fg`; P2 `TagChip`, `SectionHeading`, `StoryRowList`, `StoryGrid scroll`, `StoryCover`, `coverColorVar`; P3 `SiteLayout` mới + thanh tab.
- **Phase sau dùng:** P5 dùng `ResumeLink` mới (`className`); P11 dùng `StoryRowList` ở search.

## Implementation Steps

1. `lib/home.ts` + test. `HistoryItemDto`/`HistoryPage.items` có ở `packages/core/src/reading/history.ts:13,21-22`; qua JSON các field ngày thành chuỗi, nên hàm thuần nhận kiểu tối thiểu (generic) thay vì ép type core.
2. `ResumeLink`: thêm `className?` truyền xuống `Button`; không đổi logic handoff.
3. `home-genre-chips.tsx`: `<nav aria-label={m.home_genres()}><ul className="flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">`; chip "Tất cả" + `TagChip`.
4. `home-featured-hero.tsx`: style inline `{ backgroundColor: coverColorVar(slug), color: 'var(--cover-fg)' }`; nhãn `m.home_featured_label()`; nút "Xem truyện" `<a href={canonicalPath({ kind: 'story', ... })}>` class `rounded-full h-12 px-6 font-bold bg-[var(--cover-fg)]` + style `color: coverColorVar(slug)`. Meta dùng `STORY_STATUS_LABELS`, `m.story_card_chapters`.
5. `home-continue-reading.tsx`: `const me = useMe(); const history = useHistory(!!me.data);` → `continueRows(history.data?.pages[0]?.items ?? [], me.data?.preferences.showMature === true)`; không render khi rỗng/đang tải; mỗi hàng chỉ một link (`ResumeLink`).
6. `routes/index.tsx`: bố cục như Architecture; hero `pickHero(notable)` từ loader data (không từ list API); `withoutStory(notableList.stories, hero?.publicId ?? null)`.
7. `vi.json` + `pnpm i18n:compile`.
8. Thêm e2e 18+ "Đọc tiếp" vào `catalog.spec.ts` (fixture truyện thường + 18+ đã có trong file).
9. Gate.

## Accessible name phải giữ

Link tên truyện (dùng `.first()`); link "Tiên hiệp" (chip là link, tên = tên tag); `img` "Bìa truyện {tên}"; chữ "Mới cập nhật" trong HTML; truyện 18+ không xuất hiện khi tắt tuỳ chọn (cả trong "Đọc tiếp"); `nav "Thể loại"`; banner/contentinfo; searchbox "Tìm kiếm"; link "Đọc tiếp chương N" (`ResumeLink`).

## i18n

| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| `home_genres_all` | Tất cả | mới |
| `home_featured_label` | Mới đáng chú ý | mới (`vi.json` không có chuỗi đúng như vậy; `home_notable` là "Truyện mới đáng chú ý", dùng cho dải) |
| `home_featured_view` | Xem truyện | mới |
| `home_continue_title` | Đọc tiếp | mới |
| `home_recent_subtitle` | Chương mới nhất từ các tác giả | mới |
| `home_notable_subtitle` | Truyện mới ra, đủ dày để bắt đầu | mới |
| `chapter_number` ("Chương {number}"), `home_genres`, `home_recent`, `home_notable`, `home_empty`, `library_title`, `continue_reading` | — | đã có |

## Success Criteria

- [ ] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] `git diff --stat` không có file trong `packages/core`, `packages/api`, `server-fns/`
- [ ] HTML `/` (curl) không chứa khối aside "Đọc tiếp", không chứa truyện 18+, không chứa "Biên tập chọn"; hero (nếu có) là truyện notable đầu có `chapterCount > 0`
- [ ] `rg -n 'font-serif' apps/web/src/routes/index.tsx apps/web/src/components/home` rỗng
- [ ] `routes/index.tsx` và file mới ≤ 200 dòng

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Lộ 18+ qua "Đọc tiếp" | M × H | `continueRows` lọc theo `me.data.preferences.showMature`, unit test + e2e mới |
| Hero xuất hiện hai lần khi list API thay SSR | M × M | `withoutStory` theo `publicId`, áp sau `useMatureAwareList` |
| Hero là truyện 0 chương | M × M | `pickHero` lọc `chapterCount > 0`; không có thì không render |
| `minmax(330px)` tràn ở 360px | M × M | `minmax(min(330px,100%),1fr)` (đã ở `StoryRowList`); e2e không tràn ngang |
| Layout shift khi aside xuất hiện | H × L | chấp nhận; hero flex co giãn |

**Rollback:** revert `routes/index.tsx` + xoá `components/home/*`, `lib/home.*`; revert test mới trong `catalog.spec.ts`.

## Ngoài phạm vi phase

Không synopsis hero, không "Đọc chương 1", không carousel, không "Đã hoàn thành", không xếp hạng, không "Xem tất cả", không dòng "chương mới nhất" trong thẻ hàng (cần truy vấn mới), không thanh tiến độ/mẫu số ở "Đọc tiếp", không nhãn "Biên tập chọn" (chờ `featured_slots`).
