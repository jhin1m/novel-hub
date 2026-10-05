---
phase: 2
title: "Component dùng chung"
status: completed
priority: P1
effort: "0.75d"
dependencies: [1]
---

# Phase 2: Component dùng chung

## Overview

<!-- Updated: Red Team 2026-10-06 - phase 2 chỉ còn component dùng chung, bỏ quét font-serif/badge toàn site -->
Đổi các component `ui/*` sang hình khối B+ (pill, bo góc mới, `bg-card`, không bóng thừa), focus ring đặc, bìa chữ có gáy sách + chữ cái lớn mờ, thẻ truyện hai dạng (lưới, hàng), tiêu đề mục có icon, chip thể loại, badge trạng thái dùng chung. **Chỉ** sửa file component dùng chung; không quét `font-serif`/badge ở file trang (mỗi phase trang 4, 5, 6, 8, 10, 11 tự đổi trong file nó sửa, phase 11 quét nốt). Không đổi bố cục trang.

Nguồn: brainstorm §2.5, §4, §8; scout-01 mục P2; scout-03 mục P7.5 (trùng lặp label/badge); red team #3, #6, #12, #13.

## Requirements

- **Button** (`ui/button.tsx`): `rounded-full`; size `default` h-11 (44px), `sm` h-9, `lg` h-12, `icon` size-11, `icon-sm` size-9; variant `default` (nền `--primary`), `secondary`, `ghost`, `outline` (viền 1.5px `--foreground`, nền trong suốt), `destructive` = viền + chữ `--destructive` (bỏ `bg-destructive text-white`: dark `#F2877C` + trắng rớt AA), `link`; disabled `opacity-60`; focus `ring-[3px] ring-ring` (không alpha).
- **Badge** (nhãn trạng thái): cao 24 (`h-6`), `rounded-xs` (6px), `text-[11px] font-bold`. Variant: `default` = `bg-primary-soft text-primary`; `secondary` = `bg-secondary text-foreground`; `muted` (mới) = `bg-secondary text-muted-foreground`; `warning` (mới) = `bg-warning-soft text-warning-foreground`; `outline` = viền `--input`, chữ muted; `destructive` = viền + chữ `--destructive`, nền trong suốt.
- **Input/Textarea/Select trigger**: cao 46, `rounded-md` (12), `bg-card`, viền 1px `--input`; `aria-invalid` viền 2px `--destructive`. **Label**: `text-[13px] font-bold`. **Checkbox**: giữ cấu trúc Radix, chỉ đổi màu/ring.
- **Dialog**: `bg-card`, `rounded-xl` (24), bóng `shadow-[0_24px_60px_rgba(0,0,0,0.25)]`, overlay giữ `bg-black/50`.
<!-- Updated: Red Team 2026-10-06 - class sheet adaptive tách theo cạnh, một breakpoint lg -->
- **Sheet**: `bg-card`; thêm side `adaptive-right`, `adaptive-left` = sheet đáy (`rounded-t-[28px]`, `max-h-[90dvh]`, tay nắm `aria-hidden`) **dưới `lg`**, sheet phải/trái **từ `lg`** (một mốc `lg` cho mọi panel khu đọc và editor). Class **tách theo cạnh**: `adaptive-right` có `lg:right-0 lg:left-auto lg:border-l` + animation trượt từ phải; `adaptive-left` có `lg:left-0 lg:right-auto lg:border-r` + trượt từ trái (không dùng `lg:inset-x-auto` một mình: hai inset `auto` ghim panel về mép trái). Thêm prop `overlayClassName` truyền vào `SheetOverlay`. Một node `role=dialog`, chỉ class CSS (không matchMedia).
- **Dropdown menu**: content `rounded-lg bg-popover`, item `min-h-10 rounded-md`; tên menuitem không đổi.
- Focus: `ring-ring/70` → `ring-ring`, `outline-ring/70` → `outline-ring` ở 7 file phase này sở hữu: `app.css:57`, `ui/{button,badge,checkbox,input,select,textarea}.tsx`. File thứ 8 (`reader/reader-settings-sheet.tsx`) do phase 7 đổi.
- **StoryCover**: tiêu đề sans 800 (bỏ `font-serif` ở `story-cover.tsx:85`; vẫn là `<p>`, test so chuỗi `'Kiếm Đạo Độc Tôn</p>'`), giữ thang `coverTitleClass`; gáy sách: dải trái `w-[5cqw]` đen 20% + vạch phải 1px trắng 15%, padding trái tăng tương ứng; chữ cái đầu lớn `<span aria-hidden>` 800, cỡ ≈ `105cqw`, trắng ~11%, tràn góc dưới phải, `overflow-hidden`; `rounded-md` (12; ≤ 60px dùng class `rounded-sm` do nơi gọi truyền); bìa ảnh thật có cùng gáy.
<!-- Updated: Red Team 2026-10-06 - mỗi thẻ đúng một <a>, bìa không phải link -->
- **StoryCard** (`layout: 'grid' | 'row'`, mặc định `grid`): lưới = bìa + tên + 1 dòng "Thể loại · N ch · N chữ" + `StoryStatusBadge`; hàng = bìa 60px + tên 15/700 + meta "● Thể loại · N chữ · cập nhật {formatDate}" (chấm `var(--cover-N)` `aria-hidden`) + `StoryFlagBadges`. **Mỗi thẻ đúng một `<a>`** (cả hai layout): link tên truyện kéo phủ cả thẻ (`after:absolute after:inset-0`, như `story-card.tsx:23-39` hiện tại); bìa luôn là `role=img` "Bìa truyện {tên}", **không bao giờ** bọc trong link. Lý do: Playwright `name` khớp chuỗi con không phân biệt hoa thường, link bìa "Bìa truyện {tên}" cũng khớp `{ name: tên }` → vỡ strict ở `search.spec.ts:63,68-69,82-83,108`. Tiêu đề thẻ (`h3`) bỏ `font-serif` (`story-card.tsx:33`) → `font-bold`.
- **StoryGrid**: lưới `grid-cols-[repeat(auto-fill,minmax(160px,1fr))]`; prop `scroll` (mobile cuộn ngang thẻ 140px trong `overflow-x-auto`, không `100vw`). Không prop `layout` (lưới luôn `grid`).
- **StoryRowList** (mới): `ul` trong thẻ `--card` bo 22 (`rounded-[22px]`), lưới `repeat(auto-fill,minmax(min(330px,100%),1fr))`, mỗi `li` một `StoryCard layout="row"`.
<!-- Updated: Red Team 2026-10-06 - bỏ prop không có caller (SectionHeading.action, TagChip.current) -->
- **SectionHeading** (mới): icon lucide 18px trong ô 34×34 `rounded-[11px] bg-primary-soft text-primary` (`onBand` → `bg-card`), `<h2 id>` 22/800, dòng phụ 13 muted ngoài h2; nơi gọi đặt `aria-labelledby={id}` → tên region chỉ là h2. Không prop `action` (không có nút "Xem tất cả").
- **TagChip** (mới): link pill 32–36px nền `--card` viền `--border`, chấm 8px `var(--cover-N)` `aria-hidden`; tên link = tên tag. Không prop `current` (chip "Tất cả" ở trang chủ tự render `<a aria-current>`).
- **Status badges** (mới, `components/status-badges.tsx`): `StoryStatusBadge` (ongoing → default, completed → secondary, hiatus → warning), `StoryVisibilityBadge` (published → default, draft → muted, hidden_by_mod → destructive), `ChapterStatusBadge` (published → default, draft → muted, scheduled → warning, hidden_by_mod → destructive), `StoryFlagBadges` (AI → outline, 18+ → destructive). Phase này chỉ dùng trong `story-card.tsx` (thay badge AI/18+ ở `story-card.tsx:56`); các chỗ khác do phase sở hữu file thay (bảng dưới).
- **Gom label** (cần để `status-badges.tsx` không import từ route): `VISIBILITY_LABELS` (đang export ở `routes/write/index.tsx:19`) và `CHAPTER_STATUS_LABELS` (`components/chapter-list.tsx:26`) chuyển vào `components/story/story-labels.ts`; ba file đang dùng (`routes/write/index.tsx`, `components/chapter-list.tsx`, `components/editor/chapter-editor.tsx:10`) **chỉ đổi import**, không đổi JSX. `STATUS_LABELS` trùng ở `story-form.tsx:37` để phase 11 xoá (đang được `routes/write/index.tsx:8` import; phase 8 đổi import trước).

### Phân công đổi `font-serif` tiêu đề UI và badge cho các phase sau

<!-- Updated: Red Team 2026-10-06 - bảng phân công thay cho quét hàng loạt ở phase 2 -->
Grep lại khi cook (`rg -n 'font-serif' apps/web/src --glob '*.tsx'`, 36 dòng `.tsx` lúc lập plan). Tiêu đề UI đổi sang sans: h1/h2 `font-extrabold tracking-tight`, h3/tên thẻ `font-bold`. Serif chỉ còn ở nội dung truyện.

| Phase | `font-serif` tiêu đề UI phải đổi | Badge phải đổi sang `status-badges` | Giữ serif (nội dung) |
| --- | --- | --- | --- |
| 2 | `story-cover.tsx:85`, `story/story-card.tsx:33` | `story/story-card.tsx:56` | — |
| 3 | `site-layout.tsx:49` (chữ "Novel Hub" → sans 800; ô chữ "N" `aria-hidden` giữ serif là dấu hiệu thương hiệu) | — | — |
| 4 | `routes/index.tsx:78` (`HomeSection` bị xoá) | — | — |
| 5 | `stories.$storyKey.index.tsx:80,120,145`, `reader/mature-gate.tsx:52` | `stories.$storyKey.index.tsx:95` (thành chip trên hero, kiểu "trên màu bìa") | giới thiệu `:123` |
| 6 | — | — | h1 chương (`chapter-{$number}.tsx:118` → `chapter-header.tsx`), thân lời nhắn tác giả |
| 7 | — | — | ô "Aa" (`reader-settings-sheet.tsx:87`) |
| 8 | `routes/write/index.tsx:32,74` | `routes/write/index.tsx:79` | — |
| 9 | — (chỉ di chuyển code) | — | — |
| 10 | — | `editor-header.tsx` (badge chương, từ `chapter-editor.tsx:390`), `revision-history-sheet.tsx:160` | nội dung editor (`chapter-editor.tsx:465`), ô tên chương (`:528` → `chapter-meta-field.tsx`), xem trước revision (`revision-history-sheet.tsx:131`) |
| 11 | phần còn lại: `chapter-list.tsx:54`, `not-found.tsx:19`, `cover-upload.tsx:53`, `auth-ui.tsx:14`, `search/search-results.tsx:51,74`, `static-page.tsx:15,23`, `library/library-item.tsx:32`, `routes/{moderation:60,library:44,authors.$username:57,69,search:40,tags.$tagSlug:68,settings:38,90,150}`, `routes/write/stories/$publicId/index.tsx:32`, `routes/write/stories/new.tsx:23` | `chapter-list.tsx:87`, `library/library-item.tsx:50` | thân bài `static-page.tsx` (mới) |

## Architecture

```
lib/cover-palette.ts ── coverColorVar(slug) = `var(--cover-${coverPaletteIndex(slug)})`
   ├─ StoryCover (nền), TagChip (chấm), StoryCard row (chấm), P4/P5 hero (nền)
components/story/story-labels.ts ── STORY_STATUS_LABELS, VISIBILITY_LABELS, CHAPTER_STATUS_LABELS
   └─ components/status-badges.tsx ── Badge variants
StoryGrid / StoryRowList ── StoryCard(layout) ── StoryCover + StoryStatusBadge/StoryFlagBadges   (1 <a> mỗi thẻ)
```

## Related Code Files

- **Modify:** `apps/web/src/components/ui/{button,badge,input,textarea,select,checkbox,dialog,sheet,dropdown-menu,label}.tsx`, `styles/app.css` (dòng 57), `components/story-cover.tsx`, `components/story-cover.test.tsx`, `lib/cover-palette.ts`, `lib/cover-palette.test.ts`, `components/story/{story-card.tsx,story-grid.tsx,story-labels.ts}`; **chỉ đổi import label**: `components/chapter-list.tsx`, `routes/write/index.tsx`, `components/editor/chapter-editor.tsx`.
- **Create:** `components/section-heading.tsx`, `components/tag-chip.tsx`, `components/status-badges.tsx`, `components/status-badges.test.tsx`, `components/story/story-row-list.tsx`, `components/story/story-card.test.tsx`, `components/section-heading.test.tsx`.
- **Delete:** không.

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `components/ui/button.tsx` | 61 | variant/size/ring như Requirements |
| `components/ui/badge.tsx` | 45 | thêm `muted`, `warning`; restyle |
| `components/ui/input.tsx` / `textarea.tsx` | 20 / 17 | 46px, `rounded-md`, `bg-card` |
| `components/ui/select.tsx` | 172 | trigger `data-[size=default]:h-[46px]`, content `rounded-lg` |
| `components/ui/checkbox.tsx` / `label.tsx` | 26 / 18 | ring; label 13/700 |
| `components/ui/dialog.tsx` | 144 | `bg-background` → `bg-card` (dòng 56), bo 24, bóng |
| `components/ui/sheet.tsx` | 132 | `bg-card` (dòng 55), side `adaptive-*` tách theo cạnh, `overlayClassName` |
| `components/ui/dropdown-menu.tsx` | 225 | chỉ class (vendor, không tách) |
| `components/story-cover.tsx` | 99 | gáy, chữ cái mờ, sans 800 |
| `components/story/story-card.tsx` | 63 | 2 layout, 1 `<a>`, `StoryFlagBadges` |
| `components/story/story-grid.tsx` | 22 | auto-fill, `scroll` |
| `components/story/story-labels.ts` | 14 | +2 map label |
| `lib/cover-palette.ts` | 47 | `coverColorVar` |
| `components/chapter-list.tsx` | 171 | chỉ import `CHAPTER_STATUS_LABELS` (badge, `font-serif` → phase 11) |
| `routes/write/index.tsx` | 96 | chỉ bỏ export `VISIBILITY_LABELS`, import từ `story-labels` (badge, `font-serif` → phase 8) |
| `components/editor/chapter-editor.tsx` | 553 | chỉ dòng 10 import (tách ở phase 9, badge ở phase 10) |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| Bìa chữ: `role=img`, tên "Bìa truyện …", chuỗi `…</p>`, `var(--cover-N)`, escape HTML | unit | `story-cover.test.tsx` | giữ |
| Bìa chữ có gáy (`data-slot="cover-spine"`) và chữ cái đầu `aria-hidden` | unit | `story-cover.test.tsx` | mới |
| Bìa ảnh: `srcset` 300w/600w, `width/height`, có gáy | unit | `story-cover.test.tsx` | sửa |
| `coverColorVar('tien-hiep')` = `var(--cover-2)` | unit | `lib/cover-palette.test.ts` | mới |
| Map status/visibility/chapter → variant + nhãn đúng | unit | `status-badges.test.tsx` | mới |
| StoryCard grid/row: HTML có **đúng một** `<a ` (tên chứa tiêu đề), bìa không nằm trong `<a>`, nhãn AI/18+, chấm `aria-hidden` | unit | `story/story-card.test.tsx` | mới |
| SectionHeading: `h2` có `id`, dòng phụ ngoài h2, icon `aria-hidden` | unit | `section-heading.test.tsx` | mới |
| `img "Bìa truyện …"` chứa tên | e2e | `stories.spec.ts:25,34` | giữ |
| Link "Tiên hiệp" `.first()` → `/tags/tien-hiep` | e2e | `catalog.spec.ts:103` | giữ |
| region "Truyện"/"Tác giả"; link tên truyện strict | e2e | `search.spec.ts` | giữ |
| Header 360/390 không tràn ngang sau nút 44px | e2e | `header-mobile.spec.ts` | giữ |
| Toàn bộ e2e (tên dialog/menu không đổi) | e2e | `e2e/*.spec.ts` | giữ |

## Function/interface checklist

- [x] `buttonVariants` (variant/size mới), `badgeVariants` (+`muted`, `warning`)
- [x] `SheetContent` props: `side?: 'top' | 'right' | 'bottom' | 'left' | 'adaptive-right' | 'adaptive-left'`, `overlayClassName?: string`
- [x] `coverColorVar(tagSlug: string): string`
- [x] `StoryCard({ story, layout?, priority? })`, `StoryGrid({ stories, priorityCount?, scroll? })`, `StoryRowList({ stories, priorityCount? })`
- [x] `SectionHeading({ id, icon, title, subtitle?, onBand? })`
- [x] `TagChip({ slug, name })`
- [x] `StoryStatusBadge`, `StoryVisibilityBadge`, `ChapterStatusBadge`, `StoryFlagBadges`
- [x] `VISIBILITY_LABELS`, `CHAPTER_STATUS_LABELS` trong `story-labels.ts`

## Dependency map

- **Cần từ P1:** token `--card`, `--primary-soft`, `--warning-*`, radius `xs..2xl`, `--cover-fg`, font sans/serif mới.
- **Phase sau dùng:** P3 (Button/Dropdown cho header), P4 (StoryGrid `scroll`, StoryRowList, SectionHeading, TagChip, `coverColorVar`), P5 (TagChip, `coverColorVar`), P6 (Button pill), P7 (Sheet `adaptive-*` + `overlayClassName`), P8 (StoryVisibilityBadge, StoryCover), P10 (ChapterStatusBadge, Sheet `adaptive-right`/Dialog), P11 (StoryRowList cho search, SectionHeading, StoryFlagBadges/ChapterStatusBadge).

## Implementation Steps

1. `ui/button.tsx`, `ui/badge.tsx` theo Requirements; grep `variant="destructive"` (2 nơi: `chapter-list.tsx`, `moderation/confirm-dialog.tsx`) kiểm nhìn vẫn rõ là nút nguy hiểm.
2. `ui/input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, `label.tsx`, `dropdown-menu.tsx`; `app.css:57` `outline-ring`.
3. `ui/dialog.tsx`, `ui/sheet.tsx`: side adaptive dùng chung phần đáy `inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[28px] border-t lg:inset-y-0 lg:bottom-auto lg:h-full lg:max-h-none lg:w-full lg:max-w-sm lg:rounded-none lg:border-t-0`, rồi **thêm theo cạnh**: `adaptive-right` + `lg:right-0 lg:left-auto lg:border-l` + slide-in-from-right ở `lg`; `adaptive-left` + `lg:left-0 lg:right-auto lg:border-r` + slide-in-from-left ở `lg`. Tay nắm `<div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" />`.
4. `lib/cover-palette.ts` `coverColorVar` + test; `story-cover.tsx` gáy + chữ cái + sans; cập nhật `story-cover.test.tsx`.
5. `story-labels.ts` nhận 2 map; đổi **chỉ import** ở `chapter-list.tsx`, `chapter-editor.tsx:10`, `routes/write/index.tsx` (bỏ export trong route).
6. `components/status-badges.tsx` + test.
7. `section-heading.tsx`, `tag-chip.tsx`, `story/story-row-list.tsx`, `story-card.tsx` (layout, 1 `<a>`, `StoryFlagBadges`, sans), `story-grid.tsx` + test.
8. `pnpm typecheck && pnpm test`, rồi `pnpm test:e2e`. Nếu `header-mobile.spec.ts` tràn ngang do nút 44px: truyền `size="sm"` cho nút header trong `site-layout.tsx` (phase 3 làm lại header) — không đổi logic.
9. Gate đầy đủ.

## Accessible name phải giữ

Mọi tên nút/dialog/menu hiện có (component chỉ đổi class): menuitem "Viết truyện", "Tủ truyện", "Cài đặt", "Kiểm duyệt", "Đăng xuất"; `img` "Bìa truyện {tên}"; link tên truyện (một link mỗi thẻ); link "Tiên hiệp"; region "Truyện", "Tác giả"; chữ "Nháp", "Đã đăng", "Hẹn giờ", "Đang đăng", "Có dùng AI", "18+" (mỗi thẻ một node); `role=checkbox` ở tag picker; combobox "Thể loại chính", label "Tình trạng" + option "Hoàn thành".

## i18n

Không key mới (dùng lại `story_status_*`, `story_visibility_*`, `chapter_status_*`, `story_card_*`, `revision_*`).

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] `rg -l 'ring-ring/70|outline-ring/70' apps/web/src` chỉ còn `components/reader/reader-settings-sheet.tsx` (phase 7 đổi)
- [x] `rg -n 'font-serif' apps/web/src/components/story-cover.tsx apps/web/src/components/story` rỗng
- [x] Không còn `bg-background` trong `ui/dialog.tsx`, `ui/sheet.tsx`; không còn `text-white` trong `ui/`; `ui/sheet.tsx` có `lg:right-0` và `lg:left-0` cho hai side adaptive
- [x] Không route file nào export hằng label (`rg -n 'export const .*LABELS' apps/web/src/routes` rỗng)
- [x] File mới/sửa ≤ 200 dòng (trừ `chapter-editor.tsx` 553 chỉ đổi import, tách ở phase 9; `dropdown-menu.tsx` 225 vendor)

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Nút 44px làm header 360px tràn ngang trước phase 3 | M × M | bước 8 tạm `size="sm"` ở header |
| `getByText('Nháp')` vỡ nếu badge render 2 node | L × M | badge một node, không thêm sr-only trùng |
| Thẻ có 2 link (bìa + tên) vỡ strict `search.spec` | M × H | yêu cầu 1 `<a>`; unit test đếm `<a ` |
| Sheet adaptive ghim nhầm cạnh ở `lg` | M × M | class tách theo cạnh; phase 7 có e2e vị trí ở 1280 |
| Chữ cái lớn mờ tràn khung → tràn ngang | L × M | `overflow-hidden` trên khung bìa |
| Tiêu đề trang còn serif tới phase sở hữu | H × L | chấp nhận (bảng phân công trên) |

**Rollback:** revert theo file; không có thay đổi dữ liệu.

## Ghi chú khi cook (2026-10-06)

- [auto] Thẻ lưới thêm bút danh, dòng "Cập nhật {ngày}" và `StoryFlagBadges` ngoài mô tả "1 dòng meta + nhãn trạng thái". Lý do: spec §8 bắt buộc thẻ có lần cập nhật gần nhất và nhãn AI; spec thắng plan; bút danh vốn có, bìa chữ `aria-hidden` nên không thì trình đọc màn hình mất bút danh.
- [auto] `StoryGrid` dưới `sm` giữ `grid-cols-2` (chỉ từ `sm` mới `auto-fill minmax(160px,1fr)`). Lý do: 360px còn 328px nội dung, auto-fill 160 ra 1 cột.
- [auto] Gáy sách `w-[5%] min-w-[3px]` thay `w-[5cqw]`. Lý do: tương đương (phần trăm theo bề rộng bìa), chạy cả ở khung ảnh không phải `@container`.
- [auto] Sheet `adaptive-*`: animation trượt đáy chỉ `max-lg:`, trượt ngang `lg:`, để hai biến `--tw-enter-translate-*` không cộng thành trượt chéo. Chưa thêm `overflow-y-auto`/`gap-0` (phase 7, 10 tự đặt ở nơi gọi).
- [auto] Bước 8 đã áp: nút header trong `site-layout.tsx` dùng `size="sm"`/`icon-sm` (header 360px tràn 372 > 360). Phase 3 làm lại header.
- File được unit test import (`ui/badge.tsx`, `status-badges`, `section-heading`, `tag-chip`, `story-card`, `story-grid`) dùng import tương đối: vitest gốc không resolve alias `@/`.
- Gate: typecheck, lint, format:check, test (640), test:int (301), test:e2e (72) xanh.

## Ngoài phạm vi phase

Không quét `font-serif`/badge ở file trang (bảng phân công), không làm tab group/segmented (phase 11 restyle tại chỗ), thanh tiến độ, bố cục trang, header/footer (phase 3), tách `chapter-editor.tsx` (phase 9), xoá `STATUS_LABELS` ở `story-form.tsx` (phase 11).
