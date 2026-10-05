---
phase: 10
title: "Editor chương: giao diện"
status: pending
priority: P1
effort: "1d"
dependencies: [9]
---

# Phase 10: Editor chương: giao diện

## Overview

<!-- Updated: Red Team 2026-10-06 - phase mới tách từ editor cũ: toàn bộ giao diện editor -->
Đổi giao diện editor chương sang B+ trên các file nhỏ đã tách ở phase 9: nền trơn, header 68px (desktop) / 64px hai dòng (mobile), toolbar viên nổi (desktop) / dính đáy (mobile), cột 680px Source Serif, chế độ tập trung, banner theo loại, chấm trạng thái lưu, hộp thoại đăng (dialog 520 / sheet đáy) có thanh đo số chữ, lịch sử phiên bản (sheet phải 560 ≥ lg / sheet đáy), ô lời nhắn cuối chương. Giữ đủ chức năng, không API mới, không đổi hook autosave/publish/restore.

Nguồn: `plans/reports/design-261006-write-editor-screens-report.md` mục "Editor chương"; brainstorm §6.5, §8 (editor); scout-03 mục P8; quyết định [auto] editor trong `plan.md`; red team #1, #3, #15.

## Requirements

- **Nền:** toàn trang `bg-background`, không thẻ, không sidebar. Cột `max-w-[680px]`; nội dung `font-serif text-[18px] md:text-[20px] leading-[1.85]` (nội dung, giữ serif); tên chương input không viền `font-serif` 26 (mobile) / 36 (desktop) 700 (`chapter-meta-field.tsx`).
- **Header** (`editor-header.tsx`; một `<header>` duy nhất ngoài `<main>` → một `banner`), lưới CSS đổi vị trí theo breakpoint, mỗi phần tử **một node**:
  - Desktop 68px: link "← Về trang truyện" | tên truyện nhỏ (`useMyStory(publicId).data?.title`, ẩn khi đang tải) + "Chương N" + `ChapterStatusBadge` (thay `Badge` cũ từ `chapter-editor.tsx:390-392`) (+ pill "Có thay đổi chưa đăng") | `SaveStatusText` (chấm + chữ, `role=status`) | số chữ | nút "Lịch sử" | nút icon "Chế độ tập trung" | nút đặc "Đăng"/"Cập nhật".
  - Mobile 64px: dòng 1 back icon (`aria-label` "Về trang truyện"), "Chương N" + badge (cắt ellipsis), icon "Lịch sử" (`aria-label`), icon "Chế độ tập trung", nút "Đăng"; dòng 2 `SaveStatusText`. Chữ nút "Lịch sử" hiển thị `hidden md:inline`, tên luôn "Lịch sử".
  - Số chữ: desktop trong header, mobile dưới tên chương (dòng meta) — render **một lần** theo `useMediaQuery('(min-width: 768px)')` (route `ssr: false`, không lệch hydrate). `getByText` không bỏ node ẩn → không render 2 bản.
- **Toolbar** (một node `role=toolbar` "Định dạng", unmount khi tập trung như hiện tại): desktop viên nổi giữa dưới header (`md:sticky md:top-[76px] md:mx-auto md:w-fit rounded-full bg-card border`), 9 nút 40px chia 3 nhóm (B I S | H2 H3 trích dẫn ngắt cảnh | hoàn tác làm lại), nút bật `aria-pressed:bg-primary-soft aria-pressed:text-primary`. Mobile `fixed inset-x-0 bottom-[var(--keyboard-offset,0px)]`, phần định dạng `overflow-x-auto`, hoàn tác/làm lại ghim phải; nội dung chừa `pb-20` dưới md.
- **Bàn phím ảo:** hook nhỏ `useKeyboardOffset()` đặt `--keyboard-offset` trên `document.documentElement` từ `window.visualViewport` (`innerHeight − visualViewport.height − visualViewport.offsetTop`, ≥ 0); không thư viện.
- **Chế độ tập trung:** chỉ còn chữ; góc phải trên `SaveStatusText` mờ 60% + nút thoát mờ 40%; Esc thoát (giữ `useFocusMode`).
- **Đăng/hẹn giờ** (`publish-dialog.tsx`): desktop dialog `max-w-[520px]`; mobile cùng node, class `max-md:` thành sheet đáy (`top-auto bottom-0 translate-y-0 rounded-t-[28px] w-full max-w-none`). Mô tả số chữ (chuỗi cũ) + thanh đo `aria-hidden` (vạch mốc 300 chữ, tỉ lệ từ `wordMeter`); 2 thẻ radio "Đăng ngay"/"Hẹn giờ" là `<input type=radio>` thật trong `label` (chữ label đúng như cũ, **không** chứa "giờ đăng"), `datetime-local` label "Giờ đăng" + hint; nút Huỷ / "Hẹn giờ đăng" | "Đăng chương" | "Cập nhật". Chương đã đăng không có phần chọn thời điểm.
- **Lịch sử phiên bản** (`revision-history-sheet.tsx`): `SheetContent side="adaptive-right"` `lg:max-w-[560px]` (sheet đáy < lg, phải ≥ lg — cùng mốc `lg` với trang đọc); danh sách `li` (mỗi `li` một nút: thời điểm, số chữ, badge "Đang đăng" `variant="default"` thay `revision-history-sheet.tsx:160`); xem trước: "← Danh sách phiên bản", meta, "Khôi phục vào bản nháp", nội dung `.chapter-preview-content` serif; xác nhận dùng dialog hiện có.
<!-- Updated: Red Team 2026-10-06 - xem trước revision chỉ nhận HTML từ response server -->
- **Nguồn HTML xem trước:** `dangerouslySetInnerHTML` của xem trước chỉ được nhận `data.html` từ `useRevisionPreview(publicId, number, key)` (`lib/chapters.ts:224`; server render + `sanitizeChapterHtml`, `packages/core/src/content/render.ts:20-22`), giữ comment nguồn sanitize (`revision-history-sheet.tsx:129-134`). Nếu tách ra `revision-preview.tsx`, component đó **tự gọi** `useRevisionPreview` và nhận `{ publicId, number, revisionKey }` — **không** có prop `html: string`. Sau phase này, chỉ 3 file có `dangerouslySetInnerHTML`: `routes/__root.tsx` (boot script), `components/reader/chapter-content.tsx`, file xem trước revision.
- **Banner** (`editor-banners.tsx` + 3 file banner) trên tên chương: hẹn giờ `bg-warning-soft text-warning-foreground` + `ClockIcon` ("Cập nhật bản hẹn giờ"/"Huỷ hẹn"); xung đột `bg-card border-destructive` + `TriangleAlertIcon` ("Tải bản mới nhất" đặc, "Giữ bản của tôi" viền); bản chưa lưu trên máy `bg-band` ("Khôi phục"/"Bỏ"); notice sau khi đăng là `<p role=status>` muted (giữ node riêng, đúng chuỗi). Giữ `role=alert`/`alertdialog` hiện có.
- **Trạng thái lưu:** chấm `aria-hidden` theo `saveStatusTone`: Đã lưu → `bg-primary`; Chưa lưu/Đang lưu… → `bg-muted-foreground`; Lỗi/Xung đột → `bg-destructive` + chữ `text-destructive`.
<!-- Updated: Red Team 2026-10-06 - ngắt cảnh editor giữ * * * như trang đọc -->
- **Ngắt cảnh:** `hr` trong `.chapter-editor-content` và `.chapter-preview-content` (`app.css:76-121`) **giữ** kiểu `* * *` như trang đọc (`reader.css:82-91`, phase 6 không đổi) để editor/xem trước khớp trang đọc. Nút "ngắt cảnh" trên toolbar giữ nguyên.
- **Cuối chương:** "Lời nhắn tác giả" là ô `bg-card rounded-[20px]` + label + textarea + hint `editor_author_note_hint` (`chapter-meta-field.tsx`).
- **Tách file khi vượt 200 dòng sau khi sửa** (đích đã định, không tự chọn khác): `publish-dialog.tsx` (185) → chuyển 2 thẻ radio + `datetime-local` sang `publish-when-fieldset.tsx`; `revision-history-sheet.tsx` (197) → chuyển khối xem trước (meta, nút khôi phục, `article`) sang `revision-preview.tsx` theo hợp đồng HTML ở trên. Thanh đo số chữ và danh sách revision ở lại file gốc.

## Architecture

```
ChapterEditor (phase 9: state + 3 hook, không đổi)
  ├─ EditorHeader ── useMyStory(publicId) (tên truyện) · ChapterStatusBadge · SaveStatusText(tone dot) · words (isDesktop = useMediaQuery('(min-width: 768px)'))
  │                  RevisionHistorySheet(side adaptive-right) · FocusToggle · PublishDialog(max-md: sheet đáy, wordMeter)
  ├─ EditorToolbar (1 node; desktop viên nổi, mobile fixed bottom var(--keyboard-offset))   useKeyboardOffset()
  ├─ main max-w-[680px]: EditorBanners · ChapterMetaField(title) · [words khi !isDesktop] · EditorContent · ChapterMetaField(authorNote, ô card)
  └─ RevisionPreview? (nếu tách) ── useRevisionPreview(publicId, number, key) → data.html → dangerouslySetInnerHTML
lib/autosave.ts, lib/draft-mirror.ts, lib/chapters.ts, use-editor-autosave.ts, use-chapter-publishing.ts, use-revision-restore.ts: không sửa
```

## Related Code Files

- **Modify:** `components/editor/{chapter-editor.tsx,editor-header.tsx,editor-banners.tsx,chapter-meta-field.tsx,editor-toolbar.tsx,focus-toggle.tsx,save-status.tsx,publish-dialog.tsx,revision-history-sheet.tsx,conflict-banner.tsx,draft-restore-banner.tsx,schedule-banner.tsx}`, `routes/write/stories/$publicId/chapters/$number.tsx` (chỉ style trạng thái thiếu/đang tải), `styles/app.css` (cỡ chữ editor; **không** đổi `hr`), `apps/web/e2e/mobile-navigation.spec.ts`
- **Create:** `lib/use-media-query.ts`, `lib/use-keyboard-offset.ts`, `components/editor/save-status.test.tsx`, `components/editor/publish-dialog.test.ts`; khi vượt 200: `components/editor/publish-when-fieldset.tsx`, `components/editor/revision-preview.tsx`
- **Delete:** không

## File inventory

| Path | Dòng (sau phase 9) | Việc |
| --- | --- | --- |
| `components/editor/editor-header.tsx` | ~95 | lưới desktop/mobile, `useMyStory`, `ChapterStatusBadge`, số chữ theo `isDesktop` |
| `components/editor/chapter-editor.tsx` | ~170 | `main` 680px, vị trí số chữ mobile, `pb-20` |
| `components/editor/editor-toolbar.tsx` | 146 | bố cục desktop/mobile, nút 40px, nhóm |
| `components/editor/publish-dialog.tsx` | 185 | 520px / sheet đáy, thẻ radio, thanh đo, `wordMeter` (tách fieldset nếu > 200) |
| `components/editor/revision-history-sheet.tsx` | 197 | `adaptive-right`, badge, list (tách preview nếu > 200) |
| `components/editor/save-status.tsx` | 37 | chấm màu, `saveStatusTone` |
| `components/editor/focus-toggle.tsx` | 61 | style |
| `components/editor/editor-banners.tsx`, `{conflict,draft-restore,schedule}-banner.tsx` | ~70, 28/32/34 | style + icon |
| `components/editor/chapter-meta-field.tsx` | ~90 | tên chương serif 26/36, ô lời nhắn `bg-card` |
| `routes/write/stories/$publicId/chapters/$number.tsx` | 69 | style trạng thái |
| `lib/use-media-query.ts`, `lib/use-keyboard-offset.ts` | mới | hook nhỏ |
| `styles/app.css` | — | cỡ chữ editor nếu cần; `hr` giữ |
| hook phase 9, `lib/autosave.ts`, `lib/draft-mirror.ts`, `lib/chapters.ts` | — | **không sửa** |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `saveStatusTone` → `ok`/`idle`/`problem` cho 5 loại status | unit | `editor/save-status.test.tsx` | mới |
| `SaveStatusText` markup: `role=status`, `data-status`, chấm `aria-hidden` | unit | `editor/save-status.test.tsx` | mới |
| `wordMeter` (0 → ratio 0; vượt max → 1; vạch mốc 300 / max) | unit | `editor/publish-dialog.test.ts` | mới |
| Autosave, mirror | unit | `lib/autosave.test.ts` (13), `lib/draft-mirror.test.ts` (6) | giữ |
| textbox "Nội dung chương"; "Chưa lưu" (không trùng "Có bản chưa lưu…"); `/^Đã lưu lúc/`; "8 chữ"; xung đột + "Tải bản mới nhất"; toolbar "Định dạng" (tập trung → 0); "Chế độ tập trung", Esc; `/Lỗi, thử lại sau 2s/`; link "Về trang truyện" | e2e | `editor.spec.ts` | giữ |
| `banner` chứa "Nháp"/"Đã đăng"/"Hẹn giờ" exact; nút "Đăng"/"Cập nhật" exact; dialog "320 chữ", "Đăng chương"; `[contenteditable=false]` khi đăng; "Có thay đổi chưa đăng"; "300 chữ"; `getByLabel('Hẹn giờ').check()`, `getByLabel('Giờ đăng')`; "Hẹn giờ đăng", `/^Hẹn đăng lúc/`, "Huỷ hẹn" | e2e | `publish.spec.ts` | giữ |
| nút "Lịch sử"; dialog "Lịch sử phiên bản"; `li` count 2/3, mỗi `li` 1 nút; "Đang đăng"; `.chapter-preview-content`; "Khôi phục vào bản nháp"; dialog "Khôi phục phiên bản này?"; "Khôi phục" exact; notice `/^Đã khôi phục bản lúc …$/`; "Giữ bản của tôi" | e2e | `revision.spec.ts` | giữ |
| 390: toolbar "Định dạng" hiện, nút "Đăng" hiện, không tràn ngang | e2e | `mobile-navigation.spec.ts` | mới |

Không viết lại test cho `wordCountInRange`/`toLocalInputValue`/`saveStatusText` (có từ trước, không đổi logic).

## Function/interface checklist

- [ ] `saveStatusTone(status: SaveStatus): 'ok' | 'idle' | 'problem'` (export từ `save-status.tsx`)
- [ ] `wordMeter(words: number, limits = LIMITS.chapterWords): { ratio: number; minMarker: number }` (export từ `publish-dialog.tsx`)
- [ ] `useMediaQuery(query: string): boolean` (`useSyncExternalStore`, server snapshot `false`)
- [ ] `useKeyboardOffset(): void`
- [ ] `EditorHeader` props như phase 9 (thêm dùng `useMyStory` bên trong, không thêm prop)
- [ ] (nếu tách) `PublishWhenFieldset({ mode, onModeChange, when, onWhenChange, min })`, `RevisionPreview({ publicId, number, revisionKey, pending, onRestoreClick, onBack })` — không prop `html`

## Dependency map

- **Cần từ trước:** P1 `--band`, `--warning-*`, `--primary-soft`; P2 `ChapterStatusBadge`, Button/Dialog, Sheet `adaptive-right` (`lg`); P6 giữ kiểu `hr` trang đọc; P9 file đã tách; `useMyStory` có sẵn (`lib/stories.ts`).
- **Phase sau dùng:** P12 ghi mô tả editor vào tài liệu.

## Implementation Steps

1. Unit test `save-status` (`saveStatusTone`, markup) và `publish-dialog` (`wordMeter`) — env node, `renderToStaticMarkup`; viết hàm.
2. `lib/use-media-query.ts`, `lib/use-keyboard-offset.ts`.
3. `editor-header.tsx`: lưới desktop/mobile; `useMyStory(publicId)` lấy tên truyện; `ChapterStatusBadge`; số chữ theo `isDesktop`. Chạy `publish.spec` (`banner` getByText exact).
4. `editor-toolbar.tsx`: nhóm, cỡ nút, vị trí desktop/mobile, `aria-pressed` style.
5. `chapter-editor.tsx` (`main` 680px, số chữ mobile) + `chapter-meta-field.tsx` (tên chương, ô lời nhắn).
6. Banner + `SaveStatusText` chấm màu.
7. `publish-dialog.tsx`: class mobile sheet đáy, thẻ radio, thanh đo; > 200 → `publish-when-fieldset.tsx`.
8. `revision-history-sheet.tsx`: `side="adaptive-right"`, badge; > 200 → `revision-preview.tsx` (tự gọi `useRevisionPreview`).
9. Chế độ tập trung style; trang thiếu/đang tải trong route.
10. e2e 390 trong `mobile-navigation.spec.ts` (`signUpVerified` + `createStory` + `createChapter`).
11. Gate.

## Accessible name phải giữ

textbox "Nội dung chương", label "Tên chương", toolbar "Định dạng", nút "Đăng" (exact), "Cập nhật" (exact), "Đăng chương", "Hẹn giờ đăng", "Huỷ hẹn", "Lịch sử", dialog "Lịch sử phiên bản", "Khôi phục vào bản nháp", dialog "Khôi phục phiên bản này?", nút "Khôi phục" (exact), "Chế độ tập trung", "Tải bản mới nhất", "Giữ bản của tôi"; label "Hẹn giờ", "Giờ đăng"; chữ "Đã lưu lúc…", "Chưa lưu", "Xung đột", "Lỗi, thử lại sau Ns", "Có thay đổi chưa đăng", "Đã đăng", "Nháp", "Hẹn giờ", "Hẹn đăng lúc…", "Có bản chưa lưu trên máy này…", "Chương đang được sửa ở nơi khác.", "N chữ"; link "Về trang truyện"; class `.chapter-editor-content`, `.chapter-preview-content`; `role=status`, `alertdialog`; một `banner`.

## i18n

Không key mới (dùng lại `editor_back`, `editor_chapter_heading`, `editor_word_count`, `editor_focus_enter/exit`, `revision_history`, `revision_back`, `publish_now/later`, `publish_word_count`, `editor_author_note_hint`). Không thêm dòng giải thích nút "Đăng" bị khoá.

## Success Criteria

- [ ] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] `lib/autosave.ts`, `lib/draft-mirror.ts`, `lib/chapters.ts`, 3 hook phase 9 không đổi (`git diff --stat`)
- [ ] Số chữ, trạng thái lưu, badge chương, pill "Có thay đổi chưa đăng" mỗi thứ đúng một node trong DOM
- [ ] `rg -l 'dangerouslySetInnerHTML' apps/web/src` đúng 3 file (`routes/__root.tsx`, `components/reader/chapter-content.tsx`, file xem trước revision); không component nào có prop `html: string` cho xem trước
- [ ] `app.css` khối `hr` của editor/xem trước không đổi
- [ ] Mọi file trong `components/editor/` ≤ 200 dòng; `lint-boundaries.test.ts` xanh

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| `getByText` khớp node ẩn (render 2 bản) | M × H | một node; đổi vị trí bằng CSS grid hoặc `useMediaQuery` |
| `getByLabel('Giờ đăng')`/`('Hẹn giờ')` khớp nhiều label | M × M | label radio đúng chữ cũ, mô tả ngoài label |
| HTML sink nhận chuỗi tuỳ ý sau khi tách | L × H | `RevisionPreview` tự gọi `useRevisionPreview`, không prop `html`; tiêu chí grep 3 file |
| Toolbar mobile bị bàn phím che | M × L | `useKeyboardOffset`; không e2e mobile cho bàn phím → kiểm tay |
| Thêm request `useMyStory` khi mở editor | H × L | chấp nhận; ẩn tên khi đang tải |
| Vô tình sửa hook phase 9 khi đổi UI | L × H | tiêu chí `git diff --stat`; e2e editor/publish/revision |

**Rollback:** revert `components/editor/*` (trừ 3 hook phase 9), `app.css`, `lib/use-*` mới, e2e mới; phase 9 vẫn đứng riêng.

## Ngoài phạm vi phase

Không đổi API/autosave/mirror/hook phase 9; không dòng giải thích nút Đăng; không vẽ lại trang quản lý truyện; không thêm chuỗi i18n; không đổi kiểu ngắt cảnh; không xem trước bản nháp local.
