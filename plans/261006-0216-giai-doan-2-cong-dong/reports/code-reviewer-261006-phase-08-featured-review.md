# Code review — phase 08 truyện nổi bật do mod chọn

Reviewer: code-reviewer subagent (read-only; controller lưu file). Kết quả: không Critical/High; tiêu chí (a)–(f) đạt.

## Findings và xử lý

| # | Mức | Finding | Xử lý |
|---|---|---|---|
| M1 | Medium | Nhóm "Đang hiển thị" xếp theo thời gian, vẫn liệt kê truyện bị ẩn/18+/tác giả bị khoá hoặc ngoài top 12 dù trang chủ không hiện | [auto] Đổi nhãn "Đang trong thời gian nổi bật" + dòng giải thích dưới tiêu đề nhóm; ghi trong moderation-guide. Lý do: đơn giản nhất, không thêm field DTO |
| L1 | Low | Server nhận slot đã kết thúc hoặc bắt đầu quá xa | [auto] Bỏ qua (YAGNI): vô hại, slot quá khứ rơi vào nhóm "đã kết thúc", có thể xoá slot chưa bắt đầu |
| L2 | Low | Mặc định "từ bây giờ" cũ đi nếu để tab mở lâu | [auto] Bỏ qua: mod thấy giá trị trong ô trước khi lưu |
| L3 | Low | Lỗi xoá biến mất khi row nhảy nhóm sau refetch | [auto] Bỏ qua: 409 chỉ khi slot vừa bắt đầu, row nhảy sang nhóm có nút "Kết thúc ngay" là đủ rõ |
| L4 | Low | A11y: nút lặp không có tên truyện; hint không gắn input | Sửa: `aria-describedby` nút → tiêu đề row; hai ô thời gian → hint |
| L5 | Low | Tự chọn truyện của mình báo lỗi chung FORBIDDEN | [auto] Bỏ qua: plan chốt dùng lại `FORBIDDEN`; intro form đã nêu quy tắc |
| L6 | Low | `parseStoryRef` nhận lỏng | Bỏ qua: hệ quả chỉ là NOT_FOUND |
| L7 | Low | Chuỗi hardcode 12/30/90 | Sửa: tham số `{limit}`/`{days}` từ `FEATURED_RULES` |
| L8 | Low | Danh sách mod không phân trang | Bỏ qua: khối lượng nhỏ |
| L9 | Low | Comment > 100 ký tự ở `routes/moderation.ts` | Sửa |

Gate sau sửa: chạy lại `pnpm typecheck`, `lint`, `format:check`, `test`, `test:e2e`.
