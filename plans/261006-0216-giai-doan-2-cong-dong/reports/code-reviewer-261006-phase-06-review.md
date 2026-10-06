# Code review — phase 6 dashboard tác giả

Kết luận: không có lỗi critical/high; mọi tiêu chí chấp nhận đạt; typecheck + lint xanh.

- (a) Tiêu chí: cửa sổ 30 ngày `statsDate`; views30d/reached/dropOff; trừ tác giả; NOT_FOUND cho người khác, 401 khách; 5 query, không N+1; `<table>` thật; phân trang client 100; trạng thái trống; link ở card + trang quản lý; NO_STORE, noindex, WriterGate.
- (b) SQL đúng: lọc 30 ngày ở điều kiện LEFT JOIN; follows theo ngày VN; `reachedByChapter` tính người dừng ở chương đã xoá; dropOff không âm, chia 0 → null.
- (c) Không hồi quy: stretched link của card, trang sửa, chain `app.ts`/AppType, `addDays` chỉ thêm export.
- (d) Contract chỉ thêm.

## Finding mức thấp
1. Link "Số liệu" trên card vùng chạm nhỏ (~20px) cạnh stretched link → bấm lệch mở trang quản lý. **Đã sửa.**
2. `aria-label` trên `<dl>` không có role → **Đã sửa** (`role="group"`).
3. Nút "Sau" disabled ở trang cuối làm mất focus (chỉ truyện >100 chương). [auto] Bỏ qua: hiếm, YAGNI.
4. `totals.views` gồm chương đã xoá/ẩn nên tổng ≠ tổng bảng. [auto] Giữ: có chủ đích, comment trong code.
5. Nhiều link cùng tên "Số liệu" (đạt WCAG 2.4.4 nhờ ngữ cảnh list item). [auto] Bỏ qua.

**Status:** DONE
