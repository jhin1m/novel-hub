# Review phase 8: cài đặt trang đọc và preferences

Reviewer: code-reviewer (2026-10-05). Điểm: **8.5/10**. Không Critical/High.

## Finding và xử lý

| # | Mức | Nội dung | Xử lý |
|---|---|---|---|
| M1 | Medium | Int test "hai PATCH song song" vẫn xanh khi gỡ `FOR UPDATE` (probe 3/3) | **Sửa:** test giữ khoá bằng client riêng, assert update đang chờ, ghi `showMature` rồi commit; probe gỡ khoá → test fail |
| L1 | Low | `onSuccess` ghi cả khối `preferences` vào cache → hai PATCH về sai thứ tự làm lùi `showMature`, xoá `nh:mature` | **Sửa:** chỉ ghép field mà request đó đổi; `syncMatureFlag` chỉ khi patch có `showMature` |
| L2 | Low | Không đồng bộ giữa tab: tab cũ ghi đè field tab kia vừa đổi | **Sửa:** listener `storage` trong `subscribe`, nạp lại snapshot + áp lên `<html>` |
| L3 | Low | Upload đang debounce mất khi chuyển trang < 1s | Chấp nhận: local mới hơn → lần xem trang sau tự upload |
| L4 | Low | Đăng xuất không xoá `nh:reader`; tài khoản sau có thể nhận cài đặt local | Chấp nhận: chỉ là cài đặt hiển thị, hành vi có chủ đích (cài đặt theo thiết bị) |
| L5 | Low | Server không so `updatedAt`; đồng hồ lệch luôn thắng | Chấp nhận (plan đã ghi rủi ro) |
| L6 | Low | Slider thiếu `aria-valuetext`; focus rơi về `body` sau khi bật 18+ | **Sửa:** `aria-valuetext` có đơn vị; focus chuyển vào `h1` (e2e kiểm) |
| L7 | Low | Tên test e2e chứa chuỗi tiếng Việt | **Sửa:** "the reset button ..." |
| L8 | Low | File phase lệch code (enum, tên biến CSS, cập nhật cache, log lỗi) | **Sửa:** ghi lệch plan vào phase-08 |

## Đã xác nhận
- Boot script chỉ gán giá trị trong allowlist, 1038 byte; fixture chèn CSS có test.
- PATCH qua CSRF, `no-store`, `.strict()`, kiểm `confirmAdult` ở core; không trả `id`.
- Không vòng lặp đồng bộ (updatedAt bằng nhau → `none`); không stale closure.
- Hồi quy: `GET /me` chỉ thêm `preferences.reader?`; `useMe` giữ hành vi; phím mũi tên bỏ qua khi có dialog/input; hydration dùng server snapshot mặc định.

## Câu hỏi mở
- Có muốn xoá `nh:reader` khi đăng xuất không (L4)? Hiện giữ theo thiết bị.
