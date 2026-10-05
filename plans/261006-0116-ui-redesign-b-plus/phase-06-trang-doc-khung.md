---
phase: 6
title: "Trang đọc: khung"
status: pending
priority: P1
effort: "0.75d"
dependencies: [5]
---

# Phase 6: Trang đọc: khung

## Overview

<!-- Updated: Red Team 2026-10-06 - tách trang đọc: phase 6 khung, phase 7 hai sheet -->
Làm lại khung `/stories/…/chapter-{n}`: thanh trên (back + tên truyện + "Ch. N · tên" + tiến độ đọc 2px), thanh dưới (< lg: Mục lục/Trước/Sau/Cài đặt), rail dọc (≥ lg), đầu chương (pill + h1 + meta), cuối chương (lời nhắn → "Chương tiếp" → "Chương trước"), ẩn/hiện theo cuộn, phần tử trùng viewport ẩn bằng `display:none`. Hai sheet (cài đặt, mục lục) chỉ chuyển sang **controlled** để nút mới mở được, giữ nguyên giao diện/`modal`/`side` hiện tại; restyle và tách file ở phase 7. Giữ toàn bộ hook đọc (tiến độ, beacon, resume, prefetch, phím mũi tên) và HTML cache công khai.

Nguồn: brainstorm §6.3, §2.3, §8 (trang đọc); scout-02 mục P6; quyết định [auto] trang đọc, phần tử trùng viewport trong `plan.md`; red team #2, #8, #12, #15.

## Requirements

- Nền `--reader-bg`, chữ `--reader-fg` toàn trang; trong `.reader-page`, `--primary`/`--ring`/`--primary-soft` đã trỏ `--reader-primary*` (phase 1) → nút đặc và focus ring đúng theo preset. `MatureGate` nằm ngoài `div.reader-page` (phase 5), giữ nguyên.
<!-- Updated: Red Team 2026-10-06 - một breakpoint lg cho rail và thanh dưới -->
- **Một mốc breakpoint `lg` (1024px)** cho toàn khu đọc: < `lg` thanh dưới + (phase 7) sheet đáy; ≥ `lg` rail + (phase 7) panel phải/trái. Khớp `reader.css` (độ rộng cột chỉ áp `min-width: 1024px`) và Sheet `adaptive-*` (phase 2). Không dùng `md:` cho rail/thanh dưới/padding khung đọc.
- **Thanh trên** (mọi cỡ): `<header>` fixed đầu trang, nền `--reader-bg`, viền dưới `border-reader-fg/10`, cao 56 (< lg) / 60 (≥ lg): link icon 44px "Về trang truyện" (`aria-label`, `href` trang truyện) | 2 dòng cắt dòng: tên truyện 12 muted, "Ch. {N} · {tên chương}" (không tên → "Ch. N") 15/700. Đáy là thanh tiến độ 2px `aria-hidden` (phần đọc màu `--reader-primary`), cập nhật qua ref (`transform: scaleX`), không `setState` mỗi frame. Ẩn khi cuộn xuống (`data-hidden`, `translateY(-100%)`), `:focus-within` hiện lại.
- **Thanh dưới** (< lg): `nav aria-label="Điều hướng chương"`, `fixed bottom-0 lg:hidden`, cao 72 + safe-area, 4 ô icon + chữ 11/600: nút "Mục lục"; link "Chương trước" (hiển thị "Trước"); link "Chương sau" (hiển thị "Sau"); nút "Cài đặt hiển thị" (hiển thị "Cài đặt"). Không có chương trước/sau → `Button disabled` cùng `aria-label`. Ẩn bằng `translateY(100%)`.
- **Rail** (≥ lg): `nav aria-label="Điều hướng chương"`, `hidden lg:flex` dọc, `fixed right-6 top-[180px]`, nền `--reader-card` bo 20 padding 6, 4 ô 64×60 bo 14 (Mục lục, Cài đặt, Trước, Sau); ô có panel đang mở nền `--primary-soft` chữ `--primary`; `opacity-60`, hover/focus-within `opacity-100`; khi `hidden` ẩn bằng opacity 0 + translateX (giữ trong a11y tree như thanh trên hiện tại).
- Rail và thanh dưới là cùng component `ReaderControls` (`variant`), hiển thị loại trừ nhau bằng `display:none` theo `lg`. Mọi thanh cố định khu đọc `z-30` (< z-40 của màn 18+).
- **Panel:** state `panel: 'toc' | 'settings' | null` ở route; trigger là button thường `aria-haspopup="dialog"` `aria-expanded`; khi đóng trả focus về nút đã mở (`onCloseAutoFocus` + ref, vì không còn `SheetTrigger`).
<!-- Updated: Red Team 2026-10-06 - inert bắt buộc, không mở panel khi đang chặn 18+ -->
- **Khi màn 18+ đang chặn (`gated`)**: `inert={gated}` là prop **bắt buộc** trên `ReaderTopBar`, cả 2 `ReaderControls` và `main` (hiện đặt trên `ReaderNav` + `main`, `chapter-{$number}.tsx:94-103`); `panel` bị ép `null` (`const openPanel = gated ? null : panel`), nên không sheet nào mở được (sheet `z-50` cao hơn gate `z-40`). Lý do: gate chỉ `focus()` một lần lúc mount, không bẫy focus (`mature-gate.tsx:35-38`).
- **Sheet controlled (tối thiểu, chưa restyle):** `ReaderSettingsSheet({ open, onOpenChange })`, `ChapterTocSheet({ story, current, open, onOpenChange })`; bỏ `SheetTrigger` nội bộ; giữ `modal={false}`, `side`, class, nội dung hiện tại (phase 7 đổi). TOC query `enabled: open` giữ.
- **Đầu chương** (`chapter-header.tsx`): có tên → pill "Chương N" (`bg-reader-card`, 12/700 muted, **ngoài h1**) + `h1` = tên chương; không tên → không pill, `h1` = "Chương N". `h1` `font-serif` 700 (nội dung, giữ serif), 30 (< lg) / 40 (≥ lg), `tabIndex={-1}`. Dòng meta 13 muted "{formatDecimal(wordCount)} chữ · đăng {formatDate(publishedAt)}". Bỏ dòng tên truyện/tác giả cũ ở đầu cột (đã có ở thanh trên).
<!-- Updated: Red Team 2026-10-06 - giữ ngắt cảnh * * * ở trang đọc -->
- **Nội dung:** `ChapterContent` không đổi; cột `--reader-column`; **giữ** kiểu `hr` hiện tại (`* * *`, `styles/reader.css:82-91`). Lý do: đổi hiển thị nội dung đã đăng nằm ngoài "Scope HOLD"; brainstorm chỉ nói vạch ngắn cho editor (BS:236), editor sẽ theo trang đọc (phase 10).
- **Cuối chương** (`chapter-end.tsx`, giữ `<footer>`): lời nhắn tác giả (khối `--reader-card` bo 20, chữ cái đầu tên tác giả `aria-hidden` + "Lời nhắn của {tên}", thân `font-serif` 16–17 plain text `whitespace-pre-line`) → link pill đặc cao 64 "Chương tiếp" (hoặc chữ "Đã hết chương mới") → link "Chương trước" nền `--reader-card` (bỏ khi không có chương trước) → dòng mẹo `hidden lg:block` "Dùng phím ← → để chuyển chương" → nút "Báo cáo".
- Main: `pt-[76px] lg:pt-[84px] pb-28 lg:pb-16`.

## Architecture

```
ReaderPage (route, SSR) ─ state panel ; openPanel = gated ? null : panel ; useNavVisibility().hidden ; contentRef ; triggerRef
 <>
 <div.reader-page>
 ├─ ReaderTopBar(story, chapter, hidden, contentRef, inert=gated)  ── useScrollProgress(contentRef, barRef)
 ├─ ReaderControls variant="bar"  (lg:hidden)       ┐ onOpen(panel, button), prevHref, nextHref, hidden, activePanel, inert=gated
 ├─ ReaderControls variant="rail" (hidden lg:flex)  ┘
 ├─ main(inert=gated, .reader-column): ChapterHeader · ChapterContent · ChapterEnd(prevHref, nextHref, authorNote, authorName)
 ├─ ChapterTocSheet(open = openPanel==='toc')            (giao diện cũ, phase 7 restyle)
 └─ ReaderSettingsSheet(open = openPanel==='settings')   (giao diện cũ, phase 7 restyle + tách)
 </div>
 MatureGate (ngoài .reader-page, phase 5)
 </>
```

## Related Code Files

- **Modify:** `routes/stories.$storyKey.chapter-{$number}.tsx`, `components/reader/{chapter-toc-sheet.tsx,reader-settings-sheet.tsx}` (chỉ controlled), `components/reader/chapter-end.tsx`, `styles/reader.css` (thanh, không `hr`), `packages/shared/messages/vi.json`, `apps/web/e2e/mobile-navigation.spec.ts`
- **Create:** `components/reader/reader-top-bar.tsx`, `components/reader/reader-controls.tsx`, `components/reader/chapter-header.tsx`, `lib/reader/use-scroll-progress.ts`, `lib/reader/chapter-heading.ts`, `lib/reader/chapter-heading.test.ts`
- **Delete:** `components/reader/reader-nav.tsx` (thay bằng `reader-top-bar.tsx` + `reader-controls.tsx`)

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `routes/stories.$storyKey.chapter-{$number}.tsx` | 146 | state panel, `inert`, ghép component mới; giữ loader/hook |
| `components/reader/reader-nav.tsx` | 79 | xoá |
| `components/reader/reader-top-bar.tsx` | mới | thanh trên |
| `components/reader/reader-controls.tsx` | mới | thanh dưới + rail |
| `components/reader/chapter-header.tsx` | mới | pill + h1 + meta |
| `components/reader/chapter-toc-sheet.tsx` | 90 | chỉ controlled |
| `components/reader/reader-settings-sheet.tsx` | 244 | chỉ controlled (vẫn > 200, tách ở phase 7) |
| `components/reader/chapter-end.tsx` | 40 | thứ tự mới, `prevHref`, `authorName` |
| `components/reader/chapter-content.tsx` | 34 | không đổi |
| `lib/reader/use-scroll-progress.ts` | mới | rAF + `scrollPctOf` |
| `lib/reader/chapter-heading.ts` (+ test) | mới | hàm thuần |
| `lib/reader/use-nav-visibility.ts`, `use-arrow-keys.ts`, `use-reading-progress.ts`, `use-resume-scroll.ts`, `use-view-beacon.ts`, `use-prefetch-next.ts` | 51/35/81/52/62/45 | không đổi |
| `styles/reader.css` | 117 | `.reader-top-bar`, `.reader-bottom-bar`, `.reader-rail` (ẩn/hiện, reduced-motion, focus-within); `hr` giữ nguyên |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `chapterHeading({number:2,title:null})` → h1 "Chương 2", không pill; có tên → h1 = tên, pill "Chương N" | unit | `lib/reader/chapter-heading.test.ts` | mới |
| `.reader-content p[data-pid]`; h1 level 1 = "Chương 2" (cả khi tắt JS); 1 h1 | e2e | `reader.spec.ts:27` | giữ |
| `link 'Chương tiếp'` strict → chương sau; "Đã hết chương mới" | e2e | `reader.spec.ts:101` | giữ |
| `button 'Mục lục'` strict (1280) → dialog có đúng 3 link `/^Chương \d/`, `aria-current=page`; ←/→ không chạy khi TOC mở | e2e | `reader.spec.ts:120-129` | giữ |
| `link[rel=prefetch]` chương sau; lời nhắn plain text (`footer b` count 0) | e2e | `reader.spec.ts` | giữ |
| `button 'Cài đặt hiển thị'` strict 1280/375 mở dialog cùng tên (giao diện cũ) | e2e | `reader-settings.spec.ts` | giữ |
| h1 `toBeFocused` sau bật 18+ | e2e | `reader-settings.spec.ts:134` | giữ |
| Tiến độ PUT, beacon 30s, không cookie | e2e | `reader-progress.spec.ts` | giữ |
| `button 'Báo cáo'` → dialog "Báo cáo chương" | e2e | `moderation.spec.ts:29` | giữ |
| 360/390 không tràn ngang trang chương | e2e | `header-mobile.spec.ts` | giữ |
| 360: nav "Điều hướng chương" hiện 4 ô; chương 1 "Chương trước" `disabled` | e2e | `mobile-navigation.spec.ts` | mới |
| 1280: đúng một nav "Điều hướng chương" hiển thị (rail) | e2e | `mobile-navigation.spec.ts` (describe 1280) | mới |
| <!-- Updated: Red Team 2026-10-06 - e2e inert khi chặn 18+ --> Khách mở chương 18+: nhấn Tab 6 lần, `button 'Mục lục'` và `button 'Cài đặt hiển thị'` không bao giờ `toBeFocused`; `getByRole('dialog')` count 0 | e2e | `mobile-navigation.spec.ts` (360 và 1280) | mới |

## Function/interface checklist

- [ ] `type ReaderPanel = 'toc' | 'settings'`
- [ ] `ReaderTopBar({ story, chapterNumber, chapterTitle, hidden, contentRef, inert })` (`inert: boolean` bắt buộc)
- [ ] `ReaderControls({ variant: 'bar' | 'rail', prevHref, nextHref, activePanel, onOpen, hidden, inert })` (`inert: boolean` bắt buộc; `onOpen(panel: ReaderPanel, trigger: HTMLButtonElement)`)
- [ ] `ChapterHeader({ chapter: { number, title, wordCount, publishedAt } })`
- [ ] `chapterHeading(chapter): { heading: string; label: string | null }`
- [ ] `ChapterTocSheet({ story, current, open, onOpenChange })`, `ReaderSettingsSheet({ open, onOpenChange })` (controlled, không `SheetTrigger`)
- [ ] `ChapterEnd({ prevHref, nextHref, authorNote, authorName, reportTarget })`
- [ ] `useScrollProgress(contentRef, barRef): void`

## Dependency map

- **Cần từ trước:** P1 `--reader-card`, `--reader-primary*` + remap `.reader-page`; P2 Button pill; P5 `mature-gate.tsx` đã restyle, đặt ngoài `.reader-page`.
- **Phase sau dùng:** P7 restyle 2 sheet controlled + `lg:pr-96` cho `main`; P10 editor giữ cùng kiểu `hr` với trang đọc; P12 ghi mô tả trang đọc vào spec §8.

## Implementation Steps

1. `lib/reader/chapter-heading.ts` + test; `chapter-header.tsx`. `ChapterPageData.chapter.publishedAt` là `Date` (`packages/core/src/reader/get-chapter-for-reading.ts:27`); `formatDate` nhận chuỗi ISO → dùng `formatDate(new Date(publishedAt).toISOString())` (đúng dù serializer server fn trả `Date` hay chuỗi). Giờ theo `Asia/Ho_Chi_Minh` cố định nên không lệch hydrate.
2. Sheet controlled: `ReaderSettingsSheet({ open, onOpenChange })`, `ChapterTocSheet({ …, open, onOpenChange })`; bỏ `SheetTrigger`; **không** đổi `modal`, `side`, class. Chạy `pnpm typecheck`.
3. `reader-controls.tsx` (bar + rail; `NavLink` disabled → `Button disabled aria-label`), `reader-top-bar.tsx`, `use-scroll-progress.ts`.
4. Route: state panel + ref nút mở; `openPanel = gated ? null : panel`; truyền `hidden` và `inert={gated}` cho top bar, cả 2 controls và `main`; `onCloseAutoFocus` trả focus về ref; xoá `chapterLabel` cục bộ nếu không còn dùng. Chạy `reader.spec`, `reader-settings.spec`.
5. `chapter-end.tsx` theo Requirements (nhận `prevHref`, `authorName` = `story.authorDisplayName`).
6. `reader.css`: đổi `.reader-nav` → `.reader-top-bar`; thêm `.reader-bottom-bar[data-hidden] { transform: translateY(100%) }`, `.reader-rail[data-hidden] { opacity: 0; transform: translateX(calc(100% + 1.5rem)) }`; `:focus-within` + `prefers-reduced-motion` cho cả 3. Không đụng `hr`.
7. `vi.json` + `pnpm i18n:compile`.
8. e2e mới trong `mobile-navigation.spec.ts` (360, 1280, Tab khi chặn 18+).
9. Gate.

## Accessible name phải giữ

Link "Về trang truyện"; nút "Mục lục"; nút "Cài đặt hiển thị"; link "Chương tiếp" (cuối chương); link `/^Chương \d/` trong TOC + `aria-current`; dialog "Cài đặt hiển thị"; "Đã hết chương mới"; nút "Báo cáo"; `.reader-content p[data-pid]`; `<link rel="prefetch">`; `data-reader-theme`, `data-reader-width`, `--reader-font-size`, `--reader-column`; script inline áp trước khi vẽ; link "Chương trước"/"Chương sau" (chữ hiển thị "Trước"/"Sau" nằm trong tên); h1 `tabIndex=-1` trong `main`; `alertdialog` màn 18+.

## i18n

| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| `reader_toc_story` | Về trang truyện | **đã có** (`vi.json:241`), dùng lại cho aria-label thanh trên, không thêm key trùng <!-- Updated: Validation Session 2 - dùng lại reader_toc_story --> |
| `reader_bar_chapter` | Ch. {number} | mới |
| `reader_prev_short` / `reader_next_short` | Trước / Sau | mới (chữ hiển thị) |
| `reader_settings_short` | Cài đặt | mới (chữ hiển thị) |
| `reader_chapter_meta` | {words} chữ · đăng {date} | mới |
| `reader_author_note_by` | Lời nhắn của {name} | mới |
| `reader_keyboard_hint` | Dùng phím ← → để chuyển chương | mới |
| `reader_nav_label`, `reader_prev`, `reader_next`, `reader_toc`, `reader_settings`, `reader_chapter_label`, `reader_end_next`, `reader_end_latest` | — | đã có |

## Success Criteria

- [ ] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] Ở mọi viewport chỉ một trigger "Mục lục" và một "Cài đặt hiển thị" hiển thị
- [ ] `rg -n 'md:' apps/web/src/components/reader/reader-controls.tsx apps/web/src/components/reader/reader-top-bar.tsx` rỗng (một mốc `lg`)
- [ ] `inert={gated}` có ở `ReaderTopBar`, 2 `ReaderControls`, `main`; e2e Tab khi chặn 18+ xanh
- [ ] `styles/reader.css` khối `hr` không đổi (`git diff` không chạm `content: '* * *'`)
- [ ] HTML SSR trang chương không phụ thuộc cookie (catalog/reader e2e giữ xanh)
- [ ] Mọi file đụng tới ≤ 200 dòng, trừ `reader-settings-sheet.tsx` (244, chỉ đổi controlled, tách ở phase 7)

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Strict mode do trigger trùng rail/thanh dưới | M × H | `lg:hidden` / `hidden lg:flex` (display:none) |
| Focus không trả về trigger khi đóng sheet controlled | M × M | `onCloseAutoFocus` + ref nút đã mở |
| Quên `inert` khi tách → mở sheet trên màn 18+ | M × H | prop bắt buộc (typecheck bắt), ép `openPanel = null`, e2e Tab |
| `h1` đổi nội dung với chương có tên (bỏ tiền tố "Chương N:") | M × L | pill ngay trên h1; e2e chỉ kiểm chương không tên |
| Thanh dưới che nút cuối chương ở < lg | M × L | `pb-28` dưới lg |
| Tablet 768–1023 dùng thanh dưới thay rail | L × L | chủ ý: một mốc `lg` cho mọi panel |
| <!-- Updated: Validation Session 2 - trùng tên link Chương trước --> Hai link "Chương trước" cùng hiện (ô trên thanh dưới/rail + link cuối chương) → strict mode ở e2e mới | M × M | giữ cả hai tên (đúng ngữ nghĩa); e2e mới **luôn** giới hạn locator trong `getByRole('navigation', { name: 'Điều hướng chương' })` hoặc `footer` cuối chương; e2e hiện có không dùng tên này |

**Rollback:** revert route + `components/reader/*` + `reader.css`; khôi phục `reader-nav.tsx` từ git.

## Ngoài phạm vi phase

Restyle/tách sheet cài đặt và mục lục, `modal`, `adaptive-*`, `lg:pr-96`, nhãn font (phase 7); nút −/+ cỡ chữ; modal giữa màn hình; bình luận/theo dõi cuối chương; tên chương kế; tổng số chương; đổi `ChapterPageData`; đổi kiểu ngắt cảnh `hr`.
