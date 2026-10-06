# Code review: theo dõi và thông báo (phase 3)

Reviewer: code-reviewer subagent (read-only; controller lưu report hộ). Ngày 2026-10-06.

## Kết luận

Không Critical/High. 1 Medium, 5 Low, vài nit. Typecheck, lint xanh. Đạt toàn bộ acceptance criteria trừ L4 (giữ nguyên, có lý do).

## Findings và xử lý

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| M1 | Medium | Hai fan-out cùng truyện chạy song song (content worker concurrency 4, đăng hẹn giờ cùng lúc) khoá dòng theo thứ tự khác nhau → deadlock; retry cứu được nhưng log lỗi, trễ | **Đã sửa**: chọn `distinct user_id` trong subquery, `order by user_id` trước `ON CONFLICT` (`notify-followers.ts`) |
| L1 | Low | Job giao lại sau khi người đọc đã đọc thông báo → tạo thông báo mới cho chương đã báo | **Đã sửa**: `not exists` thông báo đã đọc cùng `dedupe_key` chứa chương này; int test bổ sung |
| L2 | Low | `useMarkNotificationsRead.onSettled` trả promise invalidate → bấm thông báo chờ refetch mới chuyển trang | **Đã sửa**: không await invalidate |
| L3 | Low | Prune quét toàn bảng mỗi lô (không index `created_at`) | Chấp nhận năm đầu, ghi nhận |
| L4 | Low | Link đăng nhập của khách không kèm `redirect` | Giữ [auto]: `sign-in.tsx` chưa hỗ trợ `redirect`, `LibraryButton` cũng vậy; thêm cần sửa trang đăng nhập (ngoài phạm vi, rủi ro open redirect) |
| L5 | Low | Cast `::uuid` trên payload chạy trước khi lọc `type` → type tương lai lưu non-uuid sẽ làm list/count 500 | **Đã ghi chú** trong `notification-visibility.ts` |
| nit | — | Thời gian tương đối hiện "sau N phút" khi đồng hồ server nhanh hơn | **Đã sửa**: kẹp về ≤ 0 |
| nit | — | Comment > 100 cột (`hooks.ts`, `queues.ts`) | **Đã sửa** |
| nit | — | Rate limit `follow` tài khoản mới bằng tài khoản thường | Giữ theo plan (60/120 mỗi 10 phút) |

## Hợp đồng, hồi quy

- Chỉ thêm: route mới, `RateLimitAction.follow`, `CONTENT_JOBS.notifyFollowers`, queue `maintenance`, cột nullable + 2 index. Không đổi env.
- Rolling deploy: worker cũ nhận `notify-followers` → unrecoverable, mất thông báo chương đó; không đáng kể với compose restart.
- `outbox.int.test.ts` phải liệt kê job mới (tester đã sửa).

## Câu hỏi mở

- Có thêm `redirect` cho link đăng nhập (theo dõi, tủ truyện) không? Cần sửa `sign-in.tsx`.
- Có siết rate limit `follow` cho tài khoản mới (spec §7) không?
