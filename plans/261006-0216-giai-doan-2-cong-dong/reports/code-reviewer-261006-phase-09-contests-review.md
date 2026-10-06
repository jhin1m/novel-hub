# Code review: Phase 9 cuộc thi theo chủ đề

Reviewer: code-reviewer subagent (read-only); controller ghi lại report và kết quả xử lý.

## Kết luận

Đạt tiêu chí (a)–(e). Không có Critical/High. 1 Medium, 7 Low.

| # | Mức | Finding | Xử lý |
|---|---|---|---|
| M1 | Medium | `enterContest` đọc `starts_at` không khoá, insert ngoài transaction → mod đổi `starts_at` cùng lúc thì lọt bài không hợp lệ | Fixed: transaction + `FOR SHARE` trên hàng cuộc thi (`contest-entries.ts`), `updateContest` đã `FOR UPDATE` |
| L1 | Low | Purge chỉ trang 1 của cuộc thi | Giữ (như trang tag); guide ghi rõ "trang đầu", trang sau hết hạn 10 phút |
| L2 | Low | Hiện ngày kết thúc không có giờ → tác giả vào buổi tối gặp `CONTEST_NOT_OPEN` | Fixed: `formatDateTime` (`HH:mm dd/MM/yyyy` giờ VN) cho thời gian cuộc thi |
| L3 | Low | Sửa `ends_at` về tương lai khi đã có hạng → mở lại, ẩn kết quả, tác giả rút bài có hạng không log | Fixed [auto]: `INVALID_STATE` nếu có hạng và kết thúc mới ở tương lai; bỏ hạng trước nếu cần mở lại |
| L4 | Low | Truyện published nhưng không còn chương vẫn tham gia được, không bao giờ hiện | Fixed: `not_published` khi `last_chapter_at` null; text lý do sửa thành "chưa công khai hoặc chưa có chương đã đăng" (cũng bao truyện bị mod ẩn) |
| L5 | Low | JSDoc tiếng Việt trong `schema/contests.ts` | Fixed: dịch sang tiếng Anh |
| L6 | Low | Danh sách mod giới hạn 100, không phân trang | Giữ (YAGNI năm đầu), ghi trong guide |
| L7 | Low | Lệch plan nhỏ (lý do lỗi, vị trí `contestStatus`) | Đã ghi `[auto]` trong phase file |

Test thêm: int test L3 (mở lại khi có hạng), L4 (truyện hết chương); unit `formatDateTime`.

## Câu hỏi mở

- [auto] Mod đặt `starts_at` ở quá khứ: cho phép (không giới hạn dưới), guide nhắc đặt bằng/sau lúc công bố. Sáng user duyệt.
- [auto] Cuộc thi đã có hạng có được mở lại không: không, trừ khi bỏ hạng trước. Sáng user duyệt.
