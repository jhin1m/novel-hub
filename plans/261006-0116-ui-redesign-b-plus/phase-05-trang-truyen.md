---
phase: 5
title: "Trang truyện"
status: completed
priority: P1
effort: "0.75d"
dependencies: [4]
---

# Phase 5: Trang truyện

## Overview

Làm lại `/stories/{slug}-{publicId}`: hero màu tag chính (bìa, breadcrumb, chip, h1, pill tác giả, hàng số liệu có vạch ngăn, CTA), tấm nội dung chồng lên hero (giới thiệu, tag, mục lục lưới có hàng "Mới nhất" và "Đang đọc"), cột phụ (thẻ tác giả, "Báo cáo"), thanh CTA dính đáy mobile. Restyle màn 18+ (`mature-gate.tsx`, dùng chung với trang đọc) giữ bất biến che kín. Không đổi loader/DTO/`head`.

Nguồn: brainstorm §6.2, §8 (trang truyện); scout-02 mục P5; quyết định [auto] tab bar, trang truyện trong `plan.md`; red team #3, #8, #11, #14.

## Requirements

- **Header site giữ nguyên** phía trên hero (không trong suốt). Ẩn thanh tab mobile (từ phase 3, `bottomInset="cta"` đã chừa đáy).
- **Hero** (`section`, full-width, nền `coverColorVar(mainTag.slug)` đặt qua biến `--story-tint` trên `section`, mọi chữ `var(--cover-fg)`, không giảm opacity chữ):
  - Desktop: container 1240, padding `pt-5 pb-24 px-8`; bìa `StoryCover` 232px (`rounded-2xl`, viền `--cover-fg` mờ, bóng `0 22px 48px rgba(0,0,0,.27)`, không bọc link) | cột phải.
  - Breadcrumb `nav aria-label="Đường dẫn"`: "Trang chủ" `/` / tag chính `/tags/{slug}`.
  - Hàng chip: tag chính (link, nền đặc `--cover-fg`, chữ `var(--story-tint)`) + tình trạng (viền) + "Có dùng AI", "18+" (viền, chữ `--cover-fg`; thay badge `stories.$storyKey.index.tsx:95`, không dùng `status-badges` vì nằm trên màu bìa). Chip có chữ trên hero **không** dùng nền trắng trong suốt.
  - `h1` tên truyện sans 48/800 (mobile 24/800; bỏ `font-serif` ở `stories.$storyKey.index.tsx:80`), giữ `tabIndex={-1}` (đích focus sau màn 18+).
  - Pill tác giả: link `/authors/{username}`, chữ cái đầu `aria-hidden` + tên hiển thị.
  - Hàng số liệu `dl` có vạch ngăn: chương, chữ (`formatWordCount`), ra chương (`~N/tuần`, ẩn khi `chaptersPerWeek` null), cập nhật (`formatDate(lastChapterAt)`, ẩn khi null). Mobile: lưới 4 cột dưới hàng bìa.
<!-- Updated: Red Team 2026-10-06 - kiểu nút "trên màu bìa" cho mọi nhánh LibraryButton và nút đọc -->
  - Nút (desktop, khối `hidden md:flex`): `ContinueReadingButton tone="on-cover"` (SSR luôn "Đọc từ đầu"; có tiến độ → "Đọc tiếp chương N" + nút phụ "Đọc từ đầu"); `LibraryButton tone="on-cover"` hiển thị ở **mọi** viewport (một lần duy nhất).
  - **Kiểu "trên màu bìa"** (`components/story/on-cover-classes.ts`, 2 hằng class): `ON_COVER_SOLID` = nền `bg-[var(--cover-fg)]` + chữ `text-[var(--story-tint)]` + ring `ring-[var(--cover-fg)]`; `ON_COVER_OUTLINE` = viền 1.5px `border-[var(--cover-fg)]` + chữ `text-[var(--cover-fg)]` + nền trong suốt + hover `bg-[var(--cover-fg)]/10` + ring `ring-[var(--cover-fg)]`. Áp cho **mọi nhánh**: `LibraryButton` có 4 nhánh return dùng 3 phần tử `Button` (`addButton` khi đang tải/chưa có kệ, link `/sign-in` cho khách, trigger `ShelfMenu` "Trong tủ: …"; `components/library/library-button.tsx:20-56`) → cả 3 nhận `ON_COVER_OUTLINE`; `ContinueReadingButton`: nhánh SSR/không tiến độ `<Button asChild>` (`continue-reading-button.tsx:69-76`) → `ON_COVER_SOLID`, nhánh `ResumeLink` → `ON_COVER_SOLID`, nút phụ "Đọc từ đầu" (`showRestart`) → `ON_COVER_OUTLINE`. Lý do: `outline` mặc định là chữ `--foreground` (≈ 1.6:1 trên `--cover-6 #2C3E66`), `default` là nền `--primary` lẫn vào `--cover-4`. Prop `tone` mặc định `'default'` (giữ nguyên ở `/library` và nơi khác).
  - Mobile: padding `px-4 pb-[52px]`, bìa 132px + cột chip/h1/pill.
- **Tấm nội dung:** desktop `-mt-14`, flex wrap; mobile `-mt-7 rounded-t-[28px] bg-background`.
  - Cột chính (thẻ `--card` bo 28, padding 32; mobile thẻ bo 18): giới thiệu `font-serif` 19/1.75 (nội dung, giữ serif; mobile 17/1.7, `max-md:line-clamp-5` + nút "Xem thêm"/"Thu gọn" `md:hidden` `aria-expanded`, chỉ khi giới thiệu > 300 ký tự; HTML luôn đủ chữ); h2 "Giới thiệu", "Mục lục" sans 800 (bỏ `font-serif` ở `:120`, `:145`); nhóm tag (genre/theme/warning) bằng `TagChip`; **Mục lục**: `h2` "Mục lục" + đếm "N chương"; hàng ghim "Mới nhất" (`bg-primary-soft`, nhãn đặc "Mới nhất", "Chương N · tên") nếu ≥ 2 chương; lưới `repeat(auto-fill,minmax(min(300px,100%),1fr))`: số chương muted + tên cắt dòng; hàng đang đọc `bg-primary-soft` + chữ "Đang đọc" (client, từ `useContinueReading`). Không cột ngày, không phân trang, render đủ.
  - Cột phụ (flex `1 1 300px`): thẻ tác giả (chữ cái đầu 52px, tên, `@username`, link `/authors/{username}`), `ReportButton` "Báo cáo" (một lần).
<!-- Updated: Red Team 2026-10-06 - khung chừa đáy cho CTA dính để footer không bị che -->
- **CTA dính đáy mobile** (`story-sticky-cta.tsx`): `fixed inset-x-0 bottom-0 z-30 md:hidden`, nền `--card`, viền trên, padding đáy safe-area; một `ContinueReadingButton` full-width cỡ `lg` (tone mặc định, nền `--card`). Không render khi truyện chưa có chương. Khoảng chừa đáy do **khung `SiteLayout`** mang (không phải `main`), vì `SiteFooter` nằm sau `main` (`site-layout.tsx:32-36`): prop `bottomInset` đã có từ phase 3 (trang truyện đã truyền `"cta"`), phase này không sửa `site-layout.tsx`. <!-- Updated: Validation 2026-10-06 - định nghĩa bottomInset ngay phase 3, bỏ đổi tên prop ở phase 5 -->
<!-- Updated: Red Team 2026-10-06 - bất biến màn 18+: lớp ngoài đục toàn màn, token site, ngoài .reader-page -->
- **Màn 18+** (`mature-gate.tsx`, dùng ở trang truyện và trang chương). Bất biến phải giữ:
  - Lớp ngoài **giữ nguyên** `mature-gate fixed inset-0 z-40` (class `.mature-gate` cho CSS ẩn trước khi vẽ, `styles/reader.css:110-112`) + nền **đục** `bg-background` (không alpha, không overlay kiểu Dialog `bg-black/50`), chữ `text-foreground`. Thẻ `bg-card rounded-3xl` (24) chỉ là khối **bên trong**.
  - Màn 18+ dùng **token site** (`--primary`, `--ring`, `--card`): ở route chương, chuyển `<MatureGate>` ra **ngoài** `div.reader-page` (phần tử anh em trong fragment; `routes/stories.$storyKey.chapter-{$number}.tsx:91,142`), để remap nhấn `.reader-page` (phase 1) không áp vào. Lý do: thẻ `--card` (theo OS) + ring `--reader-primary` (theo preset) → ring ≈ 2.18:1 (OS sáng + "Xám tối"). Site card/ring ≥ 5.8 (`[auto]` focus ring).
  - Giữ `alertdialog`, nội dung, hành vi, focus h1 sau khi qua (`mature-gate.tsx:112`), `inert={gated}` ở route; mọi thanh cố định của trang truyện/khu đọc `z < 40`. Tên truyện trong màn 18+ (`:52`) đổi sans.
- Không "Theo dõi", số người theo dõi, tab đánh giá/bình luận, chia sẻ, "Cùng tác giả", bio, nút đảo thứ tự, "Đến chương…".

## Architecture

```
loader getStoryPage() (không đổi) → StoryPage
 ├─ <div inert={gated}><SiteLayout bottomInset="cta">
 │    StoryHero(story, chaptersPerWeek, firstChapterNumber)   style --story-tint
 │      ├─ StoryMeta (dl số liệu)  ├─ ContinueReadingButton(tone on-cover, showRestart)  └─ LibraryButton(tone on-cover)
 │    main: StorySynopsis · tags · StoryChapterList(chapters, currentNumber)   | aside: StoryAuthorCard · ReportButton
 │    StoryStickyCta (md:hidden) ─ ContinueReadingButton
 └─ MatureGate (nếu isMature; token site, lớp ngoài đục)
route chương: <><div.reader-page>…</div><MatureGate/></>     (gate ra ngoài vùng remap nhấn)
currentNumber = useContinueReading(publicId, !!me.data).data?.chapterNumber ?? null  (client; SSR = null)
```

## Related Code Files

- **Modify:** `routes/stories.$storyKey.index.tsx`, `routes/stories.$storyKey.chapter-{$number}.tsx` (chỉ chuyển `<MatureGate>` ra ngoài `div.reader-page`), `components/story/story-meta.tsx`, `components/story/story-chapter-list.tsx`, `components/library/continue-reading-button.tsx`, `components/library/library-button.tsx` (prop `tone`), `components/reader/mature-gate.tsx`, `packages/shared/messages/vi.json`, `apps/web/e2e/mobile-navigation.spec.ts`, `apps/web/e2e/catalog.spec.ts`
- **Create:** `components/story/story-hero.tsx`, `components/story/story-synopsis.tsx`, `components/story/story-author-card.tsx`, `components/story/story-sticky-cta.tsx`, `components/story/on-cover-classes.ts`, `components/story/story-meta.test.tsx`, `components/story/story-chapter-list.test.tsx`
- **Delete:** `TagLink` cục bộ trong route (thay `TagChip`)

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `routes/stories.$storyKey.index.tsx` | 169 | ghép component, < 200; giữ loader/headers/head/`inert`/MatureGate; `bottomInset="cta"` |
| `routes/stories.$storyKey.chapter-{$number}.tsx` | 146 | chỉ vị trí `<MatureGate>` |
| `components/story/story-hero.tsx` | mới | hero |
| `components/story/on-cover-classes.ts` | mới | `ON_COVER_SOLID`, `ON_COVER_OUTLINE` |
| `components/story/story-meta.tsx` | 42 | viết lại thành hàng số liệu (bỏ dòng tình trạng → chip) |
| `components/story/story-chapter-list.tsx` | 32 | lưới + "Mới nhất" + `currentNumber` prop (thuần, không hook) |
| `components/story/story-synopsis.tsx` | mới | giới thiệu + nút mở rộng (client state) |
| `components/story/story-author-card.tsx` | mới | thẻ tác giả |
| `components/story/story-sticky-cta.tsx` | mới | CTA dính đáy |
| `components/library/continue-reading-button.tsx` | 81 | props `className?`, `size?`, `showRestart?`, `tone?` |
| `components/library/library-button.tsx` | 57 | prop `tone?` áp cho cả 3 `Button` |
| `components/reader/mature-gate.tsx` | 136 | class lớp ngoài/thẻ/nút; giữ bất biến |
| `components/report/report-button.tsx` | 53 | giữ (đã có `className`) |
| `packages/core/src/catalog/story-page.ts` | 125 | **không sửa** |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| StoryMeta: ô "ra chương" ẩn khi `chaptersPerWeek` null; "cập nhật" ẩn khi `lastChapterAt` null; số chữ `formatWordCount` | unit | `story/story-meta.test.tsx` | mới |
| StoryChapterList: rỗng → "Truyện chưa có chương nào để đọc."; ≥ 2 chương có hàng "Mới nhất" trỏ chương cuối; `currentNumber` → hàng có "Đang đọc"; mọi `href` qua `canonicalPath` | unit | `story/story-chapter-list.test.tsx` | mới |
| HTML có tên truyện, "Đọc từ đầu", `href=chapterPath(2)`, `href=/authors/{username}`; h1 = tên; cache PAGE; không gọi `/_serverFn/`; hydrate sạch | e2e | `catalog.spec.ts` | giữ |
| `link 'Tiên hiệp'.first()` → `/tags/tien-hiep` | e2e | `catalog.spec.ts:103` | giữ |
| 18+: `alertdialog` "Truyện có nội dung 18+", nút "Hiện nội dung 18+", "Đăng nhập để đọc"; noindex | e2e | `catalog.spec.ts`, `reader.spec.ts:168` | giữ |
| <!-- Updated: Red Team 2026-10-06 - e2e màn 18+ che kín --> Khách mở trang truyện 18+ và trang chương 18+: `document.elementFromPoint(innerWidth/2, innerHeight/2)` nằm trong `[role=alertdialog]`; nền lớp ngoài có alpha = 1 (`getComputedStyle(...).backgroundColor` không `rgba(…, <1)`) | e2e | `catalog.spec.ts` | mới |
| <!-- Updated: Red Team 2026-10-06 - library.spec chạy 390×600 nên kiểm CTA dính --> `link 'Đọc tiếp chương 2'` strict → handoff; `button 'Thêm vào tủ'` → `'Trong tủ: Đang đọc'` strict. Describe chạy **390×600** (`library.spec.ts:35-38`): link đọc là bản **CTA dính đáy**, nút tủ là bản trong hero | e2e | `library.spec.ts:64` (link đọc), `:93-94` (nút tủ) | giữ |
| Meta/canonical/og/title | e2e | `seo.spec.ts` | giữ |
| 360: CTA dính đáy hiện link "Đọc từ đầu" đúng 1 lần; thanh tab ẩn; không tràn ngang với tên truyện dài | e2e | `mobile-navigation.spec.ts` | mới/sửa |
| 360: cuộn xuống đáy, `contentinfo` link "Điều khoản" `click()` (không `force`) → `/terms` | e2e | `mobile-navigation.spec.ts` | mới |
| 1280: hero dùng `--cover-fg` cho nút tủ: user đã đăng nhập có truyện trong tủ, `getComputedStyle` color của button "Trong tủ: Đang đọc" bằng color của `h1` hero; khách: link "Thêm vào tủ" cũng vậy | e2e | `mobile-navigation.spec.ts` (describe 1280) | mới |

## Function/interface checklist

- [x] `StoryHero({ story, chaptersPerWeek, firstChapterNumber })`
- [x] `StoryMeta({ chapterCount, wordCount, chaptersPerWeek, lastChapterAt, tone?: 'hero' })` (bỏ prop `status`)
- [x] `StoryChapterList({ story, chapters, currentNumber })`
- [x] `StorySynopsis({ text })`, `StoryAuthorCard({ author })`, `StoryStickyCta({ story, firstChapterNumber })`
- [x] `ContinueReadingButton({ story, firstChapterNumber, className?, size?, showRestart?, tone?: 'default' | 'on-cover' })`
- [x] `LibraryButton({ publicId, tone?: 'default' | 'on-cover' })`
- [x] `ON_COVER_SOLID`, `ON_COVER_OUTLINE`
- [x] `SiteLayout` dùng `bottomInset="cta"` (có từ phase 3)

## Dependency map

- **Cần từ trước:** P1 `--cover-fg`, `--primary-soft`; P2 `coverColorVar`, `TagChip`, `StoryCover`; P3 `SiteLayout` + `MobileTabBar`; P4 `ResumeLink` có `className`.
- **Phase sau dùng:** P6 dùng `mature-gate.tsx` đã restyle, đặt ngoài `.reader-page`, `inert`; P11 dùng pattern chữ cái đầu cho trang tác giả (copy pattern, không phụ thuộc file).

## Implementation Steps

1. `story-meta.tsx` viết lại + test (env node, `renderToStaticMarkup` như `story-cover.test.tsx`). Chỗ gọi cũ duy nhất là route (grep `StoryMeta`).
2. `story-chapter-list.tsx` viết lại thành component thuần nhận `currentNumber`; test.
3. `on-cover-classes.ts`; `continue-reading-button.tsx`: thêm `className`, `size`, `showRestart`, `tone`; khi có tiến độ và `showRestart` → render thêm nút "Đọc từ đầu" (`m.story_page_start()`) trỏ chương đầu. SSR không đổi ("Đọc từ đầu").
4. `library-button.tsx`: `tone` → class cho cả 3 `Button` (không đổi tên/logic).
5. Xác nhận trang truyện vẫn truyền `bottomInset="cta"` (không sửa `site-layout.tsx`).
6. `story-hero.tsx`, `story-synopsis.tsx`, `story-author-card.tsx`, `story-sticky-cta.tsx`.
7. Route trang truyện: ghép theo Architecture; xoá `TagLink`; tính `currentNumber` bằng `useMe` + `useContinueReading` (cùng query key với `ContinueReadingButton`, không gọi thêm request).
8. `mature-gate.tsx`: lớp ngoài `mature-gate fixed inset-0 z-40 … bg-background text-foreground`, thẻ trong `bg-card rounded-3xl`, nút pill; route chương: chuyển `<MatureGate>` ra ngoài `div.reader-page`.
9. `vi.json` + `pnpm i18n:compile`.
10. e2e: `mobile-navigation.spec.ts` (CTA 360, footer, nút on-cover 1280), `catalog.spec.ts` (màn 18+ che kín). Test không tràn ngang trang truyện đã có từ phase 3 — dùng truyện tên dài.
11. Gate.

## Accessible name phải giữ

<!-- Updated: Red Team 2026-10-06 - bỏ "Tuỳ chọn cho {tên}" (thuộc /library, không thuộc trang truyện) -->
h1 = tên truyện; link "Đọc tiếp chương N" (strict); chữ "Đọc từ đầu" trong HTML SSR; nút "Thêm vào tủ", "Trong tủ: …" (một lần); nút "Báo cáo", dialog "Báo cáo chương"/"Báo cáo truyện"; heading "Truyện có nội dung 18+", nút "Hiện nội dung 18+", link "Đăng nhập để đọc"; link "Tiên hiệp" → `/tags/tien-hiep`; `href` chương 2 và `/authors/{username}` trong HTML; `img` "Bìa truyện {tên}"; meta robots/canonical/og; footer link "Điều khoản".

## i18n

| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| `story_page_breadcrumb` | Đường dẫn | mới |
| `story_page_stat_chapters` | chương | mới |
| `story_page_stat_words` | chữ | mới |
| `story_page_stat_pace` | ra chương | mới |
| `story_page_stat_updated` | cập nhật | mới |
| `story_page_pace_short` | ~{count}/tuần | mới |
| `story_page_toc_count` | {count} chương | mới |
| `story_page_toc_latest` | Mới nhất | mới |
| `story_page_synopsis_more` / `story_page_synopsis_less` | Xem thêm / Thu gọn | mới |
| `story_page_start`, `continue_reading`, `story_page_toc`, `story_page_by`, `reader_toc_current`, `nav_home`, `report_button`, `library_*`, `mature_*` | — | đã có |

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] Không file nào trong `packages/` đổi (trừ `messages/vi.json`)
- [x] Ở 1280 chỉ một link "Đọc tiếp chương N"/"Đọc từ đầu" chính hiển thị (hero); ở 360/390 chỉ CTA dính đáy
- [x] Mọi nút trên hero dùng `ON_COVER_*` (`rg -n 'tone="on-cover"' apps/web/src/components/story/story-hero.tsx` có cả `LibraryButton` và `ContinueReadingButton`); không chip nào nền trắng trong suốt có chữ
- [x] `mature-gate.tsx` lớp ngoài vẫn có `mature-gate fixed inset-0 z-40`, không có `/50`, `bg-black`; ở route chương `<MatureGate>` không nằm trong `div.reader-page`
- [x] `rg -n 'font-serif' apps/web/src/routes/stories.\$storyKey.index.tsx apps/web/src/components/story apps/web/src/components/reader/mature-gate.tsx` chỉ còn giới thiệu (`story-synopsis.tsx`)
- [x] Route và file mới ≤ 200 dòng

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Strict mode: CTA hero + CTA dính đáy cùng hiện | M × H | hero CTA `hidden md:flex`, sticky `md:hidden` (display:none) |
| `LibraryButton` render 2 lần | L × H | chỉ đặt trong hero, hiện mọi viewport |
| Hero full-width tràn ngang (`w-screen`) | M × M | hero là con trực tiếp của `main` full-width, không `100vw` |
| Tương phản chip/nút trên 10 màu bìa | M × M | chỉ `--cover-fg` (≥ 5.02) hoặc nền `--cover-fg` + chữ màu tag; tone áp mọi nhánh; e2e 1280 |
| Màn 18+ thành trong suốt/chỉ còn thẻ → lộ nội dung chương cache công khai | L × H | bất biến lớp ngoài; e2e `elementFromPoint` |
| Ring thấp trên màn 18+ ở trang đọc | M × M | gate ra ngoài `.reader-page`, dùng token site |
| `inert` mất khi tách component | L × H | giữ wrapper `<div inert={gated}>` ở route; phase 6 thêm e2e Tab |
| Sticky CTA che footer/nút cuối trang ở mobile | M × L | khung `bottomInset="cta"` chừa đáy; e2e bấm "Điều khoản" |

**Rollback:** revert route + component story/library + mature-gate + `site-layout.tsx`; revert vị trí gate ở route chương.

## Ngoài phạm vi phase

Không đổi `StoryPageData` (không ngày đăng chương, bio, số truyện, "Cùng tác giả"); không theo dõi/chia sẻ/đánh giá; không phân trang mục lục; không đổi phần khác của route chương (phase 6).
