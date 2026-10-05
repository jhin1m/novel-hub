# Cook report — phase 6 trang đọc: khung (2026-10-06, tự động qua đêm)

## Kết quả
- Gate xanh: typecheck, lint, format:check, test (672), test:int (301 + 1 skip S3), test:e2e (86).
- test:int lần 1 (tester) đỏ 1 test `publishing-worker.int.test.ts` (outbox `processedAt` null); chạy lại 2 lần xanh → flake, không liên quan phase 6.
- Chụp màn 360/1280 (dev 3200, dữ liệu demo): thanh trên, thanh dưới, rail, đầu/cuối chương hiển thị đúng.

## File
- Mới: `components/reader/{reader-top-bar,reader-controls,chapter-header}.tsx`, `lib/reader/{chapter-heading.ts,chapter-heading.test.ts,use-scroll-progress.ts,use-panel-trigger.ts}`.
- Sửa: route chương, `chapter-end.tsx`, 2 sheet (controlled), `reader.css` (thanh + `.reader-progress`, `hr` không đổi), `vi.json`, `e2e/mobile-navigation.spec.ts` (+5 test).
- Xoá: `components/reader/reader-nav.tsx` (chưa stage).

## Quyết định `[auto]`
- [auto] `useScrollProgress(content)` tự tạo và trả ref thanh thay vì nhận `barRef`. Lý do: lint `react-hooks/immutability` cấm ghi vào ref là tham số hook.
- [auto] 2 sheet nhận thêm prop `trigger` (ref nút đã mở) + hook `usePanelTrigger(trigger, modal)`: trả focus về nút khi đóng, trừ khi sheet không modal bị đóng do tương tác bên ngoài; bấm lại nút = toggle. Lý do: không còn `SheetTrigger`; review chỉ ra focus nhảy về nút làm `:focus-within` giữ thanh hiện khi cuộn.
- [auto] Ô Trước/Sau khi không có chương dùng `<button disabled aria-label>` kiểu ô, không phải shadcn `Button`. Lý do: class size/variant của Button xung đột với ô 64×60.
- [auto] Xoá key `reader_by_author`, `reader_author_note` (không còn dùng).
- [auto] Thanh tiến độ cập nhật thêm khi chữ reflow (`ResizeObserver`). Lý do: nit review, đổi cỡ chữ làm thanh lệch.
- [auto] Thanh tiến độ dùng cùng thước đo `scrollPctOf` với tiến độ lưu (phần chữ nằm trên đáy màn) → chương ngắn ở đầu trang đã hiện ~50%. Chấp nhận, nhất quán với dữ liệu "đọc tiếp".

## Để phase 7
- Rail (`fixed right-6`) có thể che mép phải chữ ở 1024px + cỡ 24 + cột rộng (nit review) → xử lý cùng `lg:pr-96`/bố cục panel phase 7.
- `reader-settings-sheet.tsx` 248 dòng (ngoại lệ đã biết, tách ở phase 7).

## Câu hỏi mở
- Không.
