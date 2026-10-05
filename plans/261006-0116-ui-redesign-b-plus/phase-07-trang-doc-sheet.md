---
phase: 7
title: "Trang đọc: sheet cài đặt và mục lục"
status: completed
priority: P1
effort: "0.5d"
dependencies: [6]
---

# Phase 7: Trang đọc: sheet cài đặt và mục lục

## Overview

<!-- Updated: Red Team 2026-10-06 - phase mới tách từ trang đọc cũ: hai sheet -->
Restyle hai sheet của trang đọc (đã controlled từ phase 6): sheet "Cài đặt hiển thị" (modal Radix mặc định, overlay trong suốt, đáy < lg / phải ≥ lg, cột chữ dời trái khi mở ở ≥ lg) và sheet mục lục (đáy < lg / trái ≥ lg). Tách `reader-settings-sheet.tsx` (244 dòng) xuống < 200. Không đổi logic cài đặt (`useReaderSettings`, localStorage, đồng bộ prefs).

Nguồn: brainstorm §6.3 (panel cài đặt, mục lục), §2.3; scout-02 mục P6; quyết định [auto] sheet cài đặt trong `plan.md`; red team #2, #8, #9, #12. Research-02 Q1 **sai** (Radix `modal={false}` không trap focus, không khoá cuộn, không render Overlay) — không dùng.

## Requirements

- **Sheet cài đặt** (`ReaderSettingsSheet({ open, onOpenChange })`): Radix `modal` mặc định (bỏ `modal={false}` ở `reader-settings-sheet.tsx:63`): trap focus, khoá cuộn, Esc, click ngoài đóng; `side="adaptive-right"`, `overlayClassName="bg-transparent"`. Một instance, responsive bằng class CSS (route SSR, không matchMedia).
- Khi mở ở ≥ lg, `main` của route thêm `lg:pr-96` để cột chữ dời sang trái, không bị panel che (panel `lg:max-w-sm` = 384px).
- Nội dung: tiêu đề "Cài đặt hiển thị", nút "Đóng"; 6 ô màu tròn 44–48px "Aa" `font-serif` tô màu preset (`data-reader-theme` trên ô; mẫu chữ nội dung, giữ serif) + nhãn dưới, chọn = viền 2px `--primary`; phông chữ lưới 2×2 (lg 4 cột) nút bo 12, chọn = viền 2px + `bg-primary-soft`; slider "Cỡ chữ", "Giãn dòng", "Cách đoạn" giữ `input type=range` (track pill, `accent-[var(--primary)]`, giá trị bên phải); "Độ rộng cột chữ" (`hidden lg:flex`) và "Căn lề" dạng tab group pill (`bg-secondary p-1`, chọn `bg-card`), vẫn radio ẩn bọc trong `label`; nút viền "Khôi phục mặc định".
<!-- Updated: Red Team 2026-10-06 - nhãn font hiển thị bằng font giao diện -->
- **Nhãn nút font hiển thị bằng font giao diện** (không `style.fontFamily` của từng font). Lý do: spec §8 "Font khác mặc định chỉ tải khi người đọc chọn" (`docs/project-spec.md:263`); render nhãn bằng chính font sẽ tải Literata/Noto Serif ngay khi mở panel. Hiện tại nhãn đã là chữ thường (`reader-settings-sheet.tsx:96-101`): giữ như vậy.
- Focus ring trong sheet: `ring-ring/70` → `ring-ring` (file thứ 8 còn lại sau phase 2). Sheet portal ra ngoài `.reader-page` nên dùng token site (`bg-card`, `--primary`, `--ring`).
- **Sheet mục lục** (`ChapterTocSheet`): `side="adaptive-left"`, controlled (từ phase 6); hàng chương hiện tại `bg-primary-soft` + `aria-current="page"`; link `/^Chương \d/`; TOC query `enabled: open` giữ.
<!-- Updated: Red Team 2026-10-06 - sheet không mở khi màn 18+ đang chặn -->
- **Khi màn 18+ đang chặn**: giữ `openPanel = gated ? null : panel` của route (phase 6), trigger nằm trong vùng `inert`; sheet (`z-50`) không bao giờ mở trên gate (`z-40`).
- Tách: `ChoiceGroup`, `RangeField`, `ThemeSwatches`, `FontChoices` sang `components/reader/reader-settings-controls.tsx`; `reader-settings-sheet.tsx` còn khung sheet + nối `useReaderSettings` (< 200, mục tiêu < 120).

## Architecture

```
ReaderPage (phase 6: panel, openPanel, triggerRef)
 ├─ main  className={cn(..., openPanel === 'settings' && 'lg:pr-96')}
 ├─ ChapterTocSheet(open = openPanel==='toc')             SheetContent side="adaptive-left"
 └─ ReaderSettingsSheet(open = openPanel==='settings')    SheetContent side="adaptive-right" overlayClassName="bg-transparent" (modal mặc định)
      └─ reader-settings-controls.tsx: ThemeSwatches · FontChoices (font UI) · RangeField ×3 · ChoiceGroup (độ rộng lg, căn lề) · nút Khôi phục
useReaderSettings / applyReaderSettings / localStorage nh:reader / PATCH prefs: không đổi
```

## Related Code Files

- **Modify:** `components/reader/reader-settings-sheet.tsx`, `components/reader/chapter-toc-sheet.tsx`, `routes/stories.$storyKey.chapter-{$number}.tsx` (chỉ `lg:pr-96` cho `main`), `apps/web/e2e/reader-settings.spec.ts`, `apps/web/e2e/mobile-navigation.spec.ts`
- **Create:** `components/reader/reader-settings-controls.tsx`
- **Delete:** không

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `components/reader/reader-settings-sheet.tsx` | 244 | modal mặc định, `adaptive-right`, overlay trong suốt, ring đặc; tách control → < 200 |
| `components/reader/reader-settings-controls.tsx` | mới | `ThemeSwatches`, `FontChoices`, `RangeField`, `ChoiceGroup` |
| `components/reader/chapter-toc-sheet.tsx` | 90 | `adaptive-left`, hàng hiện tại `bg-primary-soft` |
| `routes/stories.$storyKey.chapter-{$number}.tsx` | ~150 (sau phase 6) | `lg:pr-96` khi panel cài đặt mở |
| `lib/reader/use-reader-settings.ts`, `lib/reader/settings.ts` | — | **không sửa** |
| `e2e/reader-settings.spec.ts` | — | +test không tải font khi mở panel |
| `e2e/mobile-navigation.spec.ts` | — | +test vị trí panel ở 1280 |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `button 'Cài đặt hiển thị'` strict 1280/375; dialog cùng tên; radio trong `label`; slider "Cỡ chữ" + phím mũi tên không đổi chương; reset 19px; 60ch/68ch; "Độ rộng cột chữ" ẩn 375; đồng bộ thiết bị khác | e2e | `reader-settings.spec.ts` | giữ |
| `button 'Mục lục'` strict (1280) → dialog có đúng 3 link `/^Chương \d/`, `aria-current=page`; ←/→ không chạy khi TOC mở | e2e | `reader.spec.ts:120-129` | giữ |
| Ẩn trước khi vẽ (`data-mature-ok`), h1 focus sau bật 18+ | e2e | `reader-settings.spec.ts:134,141-144` | giữ |
| <!-- Updated: Red Team 2026-10-06 - e2e không tải font khi mở panel --> Trang chương (1280, khách, chưa chọn font): mở "Cài đặt hiển thị", chờ dialog hiện; không request nào khớp `/literata\|noto-serif/` (bắt bằng `page.on('request')` như `layout.spec.ts:45-57`) | e2e | `reader-settings.spec.ts` | mới |
| <!-- Updated: Red Team 2026-10-06 - e2e vị trí panel ở 1280 --> 1280: mở cài đặt → `dialog 'Cài đặt hiển thị'` `boundingBox().x > 640`; mép phải đoạn đầu `.reader-content p` ≤ `x` của dialog (cột chữ không bị che); mở mục lục → dialog `x` = 0 (`< 640`) | e2e | `mobile-navigation.spec.ts` (describe 1280) | mới |
| 360: mở cài đặt → dialog nằm đáy (`boundingBox().y > 0`, `y + height` ≈ 800) | e2e | `mobile-navigation.spec.ts` | mới |
| Khách ở chương 18+: không dialog nào mở (từ phase 6) | e2e | `mobile-navigation.spec.ts` | giữ |

Không có hàm thuần mới (chỉ JSX + class); không thêm unit test.

## Function/interface checklist

- [x] `ReaderSettingsSheet({ open, onOpenChange })` (modal mặc định, `side="adaptive-right"`, `overlayClassName="bg-transparent"`)
- [x] `ChapterTocSheet({ story, current, open, onOpenChange })` (`side="adaptive-left"`)
- [x] `ThemeSwatches({ value, onChange })`, `FontChoices({ value, onChange })`, `RangeField(props hiện có)`, `ChoiceGroup(props hiện có)` trong `reader-settings-controls.tsx`

## Dependency map

- **Cần từ trước:** P1 enum font mới + `FONT_LABELS`; P2 Sheet `adaptive-right`/`adaptive-left` (tách theo cạnh, `lg`) + `overlayClassName`; P6 sheet controlled, `openPanel`, `inert`, trigger ref.
- **Phase sau dùng:** P10 dùng cùng `adaptive-right` cho lịch sử phiên bản; P12 ghi mô tả panel vào spec §8 và `design-guidelines.md`.

## Implementation Steps

1. Tách `reader-settings-sheet.tsx`: chuyển nguyên `ChoiceGroup`, `RangeField` (+ JSX ô màu, ô font thành `ThemeSwatches`, `FontChoices`; ô màu hiện là callback `renderOption` của `ChoiceGroup` ở `reader-settings-sheet.tsx:81-93` nên đây là gói lại thành component, giữ nguyên markup/tên radio) <!-- Updated: Validation Session 2 - ThemeSwatches gói từ renderOption --> sang `reader-settings-controls.tsx`, chưa đổi giao diện; chạy `pnpm typecheck` + `pnpm test:e2e -- reader-settings`.
2. Bỏ `modal={false}`; `side="adaptive-right"`, `overlayClassName="bg-transparent"`; sửa docblock (panel modal, nền không tối, cột dời sang trái ở màn rộng). Chạy `reader-settings.spec` ngay (modal khoá con trỏ ngoài dialog).
3. Route: `main` thêm `lg:pr-96` khi `openPanel === 'settings'`.
4. Restyle control: ô màu, font (nhãn font giao diện), slider, tab group pill, nút reset; `ring-ring/70` → `ring-ring`.
5. `chapter-toc-sheet.tsx`: `adaptive-left`, hàng hiện tại.
6. e2e mới: `reader-settings.spec.ts` (không tải font), `mobile-navigation.spec.ts` (vị trí panel 1280/360).
7. Gate.

## Accessible name phải giữ

Nút + dialog "Cài đặt hiển thị"; nút "Đóng"; radio theo tên preset ("Sáng", "Ngà", "Sepia", "Xanh dịu", "Xám tối", "Đen OLED") và độ rộng ("Hẹp"…) bọc trong `label`; slider "Cỡ chữ"; nút "Khôi phục mặc định"; chữ "Độ rộng cột chữ" ẩn ở mobile; nút "Mục lục"; link `/^Chương \d/` trong TOC + `aria-current="page"`; `data-reader-theme`, `data-reader-width`, `--reader-font-size` (19px khi reset), `--reader-column` (60ch hẹp desktop, 68ch mobile); script inline áp trước khi vẽ.

## i18n

Không key mới (dùng lại `reader_settings_*`, `reader_toc`, `reader_toc_current`, font labels đã đổi ở phase 1).

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] `reader-settings-sheet.tsx` < 200 dòng, `reader-settings-controls.tsx` ≤ 200; `rg -n 'modal=\{false\}' apps/web/src/components/reader` rỗng
- [x] `rg -l 'ring-ring/70|outline-ring/70' apps/web/src` rỗng
- [x] `rg -n 'fontFamily' apps/web/src/components/reader/reader-settings-controls.tsx` rỗng (nhãn font không render bằng font đó)
- [x] Chỉ một dialog cài đặt trong DOM khi mở; ở 1280 cột chữ không bị panel che (e2e)

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Modal khoá cuộn/con trỏ làm vỡ e2e settings | L × M | e2e chỉ thao tác trong dialog; chạy `reader-settings.spec` sau bước 2 |
| Panel ghim nhầm cạnh ở ≥ lg | M × M | class tách theo cạnh từ phase 2; e2e `boundingBox` |
| `lg:pr-96` làm cột chữ nhảy khi mở/đóng | M × L | chủ ý (xem trước trên chữ). Ở 1024–1279px (và cỡ chữ lớn ở 1280) cột bị co dưới `--reader-column` khi panel mở → chọn "Vừa"/"Rộng" chỉ thấy khác sau khi đóng; chấp nhận, ghi trong docblock `ReaderSettingsSheet` |
| Bỏ trap focus khi tách control | L × M | chỉ di chuyển JSX; Radix modal giữ focus |

**Rollback:** revert 3 file reader + route (`lg:pr-96`); xoá `reader-settings-controls.tsx`; e2e mới xoá cùng.

## Ngoài phạm vi phase

Không nút −/+ cỡ chữ, không modal giữa màn hình, không bảng chọn màu tự do, không xem trước font bằng chính font, không đổi logic/lưu cài đặt, không đổi khung đọc (phase 6).

## Kết quả cook (2026-10-06)

- `reader-settings-sheet.tsx` 244 → 115 dòng; `reader-settings-controls.tsx` 196 dòng (`ChoiceGroup` thêm `variant` tile/segment/bare, `renderOption` nhận `checked`).
- Sheet cài đặt: modal mặc định, `adaptive-right`, overlay trong suốt, `usePanelTrigger(trigger, true)` (đóng bằng click ngoài → focus về nút).
- e2e: thay test cũ "click chữ đóng panel, focus không về nút" (hành vi non-modal) bằng test modal (click ngoài đóng, focus về nút); thêm vị trí panel 1280/360, không tải Literata/Noto Serif (kèm khẳng định có tải source-serif-4).
- Gate (tester): typecheck, lint, format:check, test 672/672, test:int 301 (+1 skip), e2e 89/89. Sau sửa review: chạy lại reader-settings + mobile-navigation + reader 30/30.
- Review: `reports/code-reviewer-261006-phase-07-reader-sheets.md`, `reports/tester-261006-phase-07-reader-sheets-gate.md`.
- [auto] Review M1 (cột co ở 1024–1279px khi panel mở): chấp nhận, sửa docblock + dòng rủi ro, không đổi sang `xl:pr-96`. Lý do: yêu cầu cứng là chữ không bị che; phương án Recommended của reviewer.
- [auto] Review L1/L3: pill chọn thêm `ring-1 ring-border`, cao `h-10`. Lý do: tương phản bg-card/bg-secondary ~1.2:1, sửa nhỏ không đổi thiết kế.
- [auto] Review L5 (viền ô "Sáng" mờ): không sửa. Lý do: nhãn và "Aa" đã nhận diện; đổi màu viền là quyết định thiết kế.
