# Overnight 261006: đang chạy
Cập nhật: 2026-10-06 12:03
Đang làm: Q8 / phase-04
## Đã xong
- Q1 canvas /write + editor (artboard F-* trên https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo), đặc tả ở plans/reports/design-261006-write-editor-screens-report.md
- Q2 report brainstorm cuối: plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md
- Q3 plan redesign: plans/261006-0116-ui-redesign-b-plus (12 phase, red-team 33/34 finding)
- Q4 validate redesign (Session 2: 15 lệch đã sửa)
- Q5 phase-01 tokens và font (gate xanh sau 1 lần sửa: .prettierignore bỏ file inlang tự sinh)
- Q5 phase-02 component dùng chung
- Q5 phase-03 layout header/footer/thanh tab
- Q5 phase-04 trang chủ
- Q5 phase-05 trang truyện
- Q5 phase-06 trang đọc: khung
- Q5 phase-07 trang đọc: sheet cài đặt + mục lục
- Q5 phase-08 trang /write
- Q5 phase-09 editor tách file (gate xanh sau 1 lần sửa: test int publishing-worker chập chờn, nay chờ đúng job id + drain hàng đợi, 12/12 xanh)
- Q5 phase-10 editor giao diện
- Q5 phase-11 trang phụ
- Q5 phase-12 tài liệu + spec §2/§8 (redesign B+ xong 12/12 phase)
- Q6 plan Giai đoạn 2: plans/261006-0216-giai-doan-2-cong-dong (9 phase cho 6 checkbox, red-team 16/17 áp dụng)
- Q7 validate Giai đoạn 2 (sửa index ON CONFLICT thông báo, 400→403 tự theo dõi)
- Q8 phase-01 bình luận chương hai cấp (migration 0003_comment_threads, đã áp DB dev)
- Q8 phase-02 bình luận theo đoạn → [x] checkbox 'Bình luận chương' (migration 0004)
- Q8 phase-03 theo dõi + thông báo → [x] checkbox 'Theo dõi' (migration 0005)

## Quyết định [auto] (sáng cần duyệt)
- Q1: 8 quyết định [auto] trong design-261006-write-editor-screens-report.md
- Q1 câu hỏi mở: giữ dải số liệu ở /write?; trang quản lý truyện /write/stories/$publicId chưa vẽ; gợi ý lý do nút "Đăng" bị khoá (cần chuỗi i18n mới)
- Q2: 25 quyết định [auto] trong Validation Log của report brainstorm cuối (đáng xem: settings desktop là sheet phải không phủ tối; giữ slider; giữ header thường; bỏ khu 'Đã hoàn thành' và phần Giai đoạn 2 trên canvas; sửa tương phản hero dùng --cover-fg)
- Controller: NAS không có namespace /ak:*; dùng /ck:plan, /ck:cook, /ck:fix (cùng flag --deep/validate/--auto) thay thế
- Q3: hero trang chủ đổi nhãn 'Biên tập chọn' → 'Mới đáng chú ý' tới khi có featured_slots (chạm quyết định user đã chốt)
- Q3: người đọc đã lưu font literata giữ Literata; 12 phase thay vì 9; còn lại xem Quyết định đã chốt + Validation Log trong plan.md
- Q4: 6 câu [auto] ở Validation Log Session 2 plan redesign; đáng xem: thứ tự cuối chương (lời nhắn → Chương tiếp → Chương trước) sửa spec §8 ở phase 12
- Q5 p01: đặt font-weight 400 cho vùng chữ truyện/editor/preview (code-review Medium); gỡ dep @fontsource-variable/inter và @fontsource/be-vietnam-pro
- Q5 p02: thẻ lưới thêm bút danh + dòng 'Cập nhật {ngày}' (spec §8), dày hơn canvas; lưới mobile giữ 2 cột ở 360px
- Q5 p03 câu hỏi mở: giữ chỗ 42px cho nút tài khoản (header khách dịch ~150px khi tải xong)?; thêm viewport-fit=cover + scroll-padding-bottom ở phase 11?
- Q5 p04: e2e 'Đọc tiếp' bật 18+ thẳng trong DB thay vì qua trang cài đặt; chi tiết trong reports/cook-261006-phase-04-home-page-report.md
- Q5 p05: xoá key i18n story_page_by; viền focus breadcrumb hero dùng --cover-fg
- Q5 p06: vạch tiến độ dùng cùng cách đo tiến độ đọc (chương ngắn mở ra đã ~50%); xoá reader_by_author, reader_author_note
- Q5 p07: 1024–1279px cột chữ co lại khi panel mở (chọn Vừa/Rộng chỉ thấy khác sau khi đóng); tab chọn thêm viền + cao 40px; viền ô màu 'Sáng' mờ chưa sửa (quyết định thiết kế)
- Q5 p08: giữ dải số liệu ở /write; nhãn 'Tổng quan truyện của bạn' đặt trên dl như plan
- Fix test chập chờn: không sửa registerPublishingSchedulers (chạy job ngay khi đăng ký là đúng ở production)
- Q5 p10: pill 'Có thay đổi chưa đăng' trên mobile xuống dòng dưới tên chương; sheet lịch sử cao 90% dưới lg; hộp thoại đăng mobile phóng to thay vì trượt lên
- Q5 p11: form truyện + trang tĩnh cột 720px (plan ghi ~560px); /moderation rộng 1240px (reviewer: chữ dàn dài, cân nhắc 960px?); badge tag warning có nên dùng màu warning?; logic report-card tách sang report-actions.ts để test
- Q5 p12: font serif còn dùng ngoài nội dung (giới thiệu truyện, tên chương trang đọc, trang điều khoản, chữ 'N' logo, mẫu 'Aa') ghi là ngoại lệ trong docs; câu hỏi: giữ serif cho logo + điều khoản?; việc sau: nút đóng dialog/sheet còn focus:ring-2 ring-offset-2, tên chương trang đọc luôn serif
- Q6: 9 phase cho 6 checkbox; bình luận theo đoạn không chèn chỉ báo vào nội dung; hero trang chủ chưa do mod chọn; cửa sổ xếp hạng 'ngày' = hôm nay + hôm qua; 8 huy hiệu; cắt khu xếp hạng trang chủ, thông báo huy hiệu, biểu đồ SVG dashboard, chip dự thi (xem 5 câu hỏi mở trong plan.md)
- Q7: tài khoản muted không đăng được cả bình luận lẫn đánh giá/review (spec chỉ ghi bình luận, đây là mở rộng); hero trang chủ vẫn tự động, mod chọn khu 'Truyện nổi bật' riêng
- Q8 p01: normalizePlainText ở packages/shared; cursor phân trang ${micros}_${uuid}; createComment không bọc transaction; câu hỏi: API bình luận chương 18+ không kiểm tuỳ chọn 18+ (giữ hay bắt buộc bật?)
- Q8 p02: 'Theo đoạn (M)' đếm số bình luận; hai tab chỉ hiện khi có bình luận theo đoạn; sheet đoạn đẩy cột chữ như bảng cài đặt, mobile cao ≤60%; trả lời lưu paragraph_id của gốc; lỗi Low: triple-click đoạn cuối/trước blockquote không hiện nút nổi
- Q8 p03 câu hỏi: link đăng nhập cho khách (theo dõi/tủ truyện) có kèm redirect quay lại? (cần sửa sign-in.tsx); có siết rate limit follow cho tài khoản mới (spec §7)?

## Chặn / lỗi
- Q3 (nhẹ): 'ck plan add-phase --after' lỗi afterId.toLowerCase; worker đổi tên phase bằng tay, 'ck plan validate' xác nhận
- Thư mục .claude/ (settings.local.json, agent-memory của code-reviewer) do subagent tạo ở gốc repo, chưa track; controller không commit, sáng xem rồi xoá hoặc gitignore
- Q5 p05 (controller): lần đầu đóng worker khi nó còn chạy e2e nền (chưa in RESULT) → e2e mồ côi cổng 3100 chạy chồng gate, test int publishing-worker đỏ. Đã kill tiến trình mồ côi, sửa controller chỉ đóng worker khi có RESULT, cook lại phase 5 trên working tree; không tính là lần sửa gate
- (đã sửa) Test chập chờn publishing-worker.int.test.ts
- Cần kiểm tay trên điện thoại thật: toolbar editor nằm đúng trên bàn phím ảo, con trỏ không bị che
- Controller khởi động lại phiên lúc ~01:50 UTC (sau khi phase 11 xong); tiếp tục từ trạng thái trên đĩa, không mất việc
- E2E chập chờn e2e/library.spec.ts:59 'continue reading' (đỏ 1 lần khi tải nặng, chạy lại xanh); chưa rõ nguyên nhân

## Lệnh tiếp theo cho user
- (đang chạy)
