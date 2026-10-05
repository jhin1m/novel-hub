# Code review: phase 7 sheet cài đặt + mục lục trang đọc

Scope: `reader-settings-sheet.tsx` (244 → 115), `reader-settings-controls.tsx` (mới, 196), `chapter-toc-sheet.tsx`, route chương (`lg:pr-96`), `e2e/reader-settings.spec.ts`, `e2e/mobile-navigation.spec.ts`.

Kết luận: đạt mọi tiêu chí phase; không critical/high. typecheck, lint, prettier, unit 672/672 xanh.

## Không hồi quy
- `useReaderSettings`, localStorage, đồng bộ prefs không đổi.
- `use-arrow-keys.ts` bỏ qua phím khi có `[role="dialog"]` → vẫn đúng với modal; focus trap thêm một lớp.
- Props `ReaderSettingsSheet`/`ChapterTocSheet` không đổi; `renderOption` thêm tham số `checked` (chỉ dùng nội bộ module).
- Gate 18+ `openPanel = gated ? null : panel` giữ nguyên.

## Findings
| # | Mức | Nội dung | Xử lý |
| --- | --- | --- | --- |
| M1 | Medium | 1024–1279px: `lg:pr-96` co cột dưới `--reader-column` khi panel mở → "Vừa"/"Rộng" chỉ thấy khác sau khi đóng; dòng rủi ro plan sai | [auto] chấp nhận, sửa docblock + dòng rủi ro |
| L1 | Low | Pill chọn `bg-card` trên `bg-secondary` ~1.2:1 | Đã thêm `peer-checked:ring-1 ring-border` |
| L2 | Low | Test font thiếu khẳng định dương | Đã thêm kiểm `source-serif-4` được tải |
| L3 | Low | Pill `h-9` (36px) vs tile 44px | Đã đổi `h-10` |
| L4 | Low | Docblock TOC xuống dòng lệch | Đã sửa |
| L5 | Low | Viền ô "Sáng" mờ (~1.2:1) | Không sửa (quyết định thiết kế; nhãn + "Aa" nhận diện được) |
| L6 | Low | `reader-settings-controls.tsx` 196/200 dòng | Ghi chú: lần thêm sau tách `THEME_LABELS`/`FONT_LABELS` |

## Edge cases (ghi nhận, chủ ý)
- Overlay trong suốt nhận mọi click ngoài: ở lg bấm "Mục lục" khi panel cài đặt mở chỉ đóng panel.
- Modal khoá cuộn: không cuộn chương khi đang chỉnh.
- Mobile: bottom sheet tới 90dvh, chỉ một dải chữ phía trên để xem trước.

## Câu hỏi mở
- M1: có muốn chỉ dời cột từ `xl` (`xl:pr-96`) thay vì `lg` không? Hiện giữ `lg` (chữ không bị che).
