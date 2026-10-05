# Hướng dẫn kiểm duyệt

Dành cho tài khoản `mod` và `admin`. Trang hàng chờ: `/moderation` (link "Kiểm duyệt" trong menu tài khoản, chỉ hiện với mod/admin).

## Hàng chờ báo cáo

- Lọc theo trạng thái (Đang chờ / Đã xử lý / Đã bỏ qua) và theo lý do. Mới nhất lên trước, 20 báo cáo mỗi trang.
- Mỗi báo cáo hiện mục bị báo cáo (truyện, chương hoặc tài khoản) kèm link tới trang thật, trạng thái hiện tại (đã ẩn, tác giả đã xoá, tác giả đang bị khoá...), mô tả của người báo, người báo ("Hệ thống" với báo cáo tự động) và số báo cáo đang chờ cho cùng mục.
- Người dùng báo cáo được truyện, chương, tài khoản với 5 lý do: vi phạm bản quyền, đạo văn, spam, nội dung cấm, gắn nhãn sai. Mỗi người chỉ có một báo cáo đang chờ cho mỗi mục; có giới hạn tần suất (`RATE_LIMITS.report` trong `packages/shared/src/rate-limits.ts`).
- Báo cáo không bao giờ tự ẩn nội dung; mod quyết định.

## Hành động

Mọi hành động ghi vào `moderation_actions` (ai, lúc nào, mục nào, ghi chú) trong cùng transaction với thay đổi. Bấm hành động từ một báo cáo đang chờ thì báo cáo đó và mọi báo cáo đang chờ khác của cùng mục chuyển sang "Đã xử lý".

| Hành động | Ý nghĩa | Đảo lại |
| --- | --- | --- |
| Ẩn truyện | Truyện và mọi chương biến mất khỏi trang công khai, tìm kiếm; tác giả vẫn viết, đăng chương nhưng truyện vẫn ẩn tới khi mod khôi phục | Khôi phục truyện |
| Ẩn chương | Chương trả 404, bộ đếm chương/chữ của truyện tính lại; tác giả không đăng lại được chương này | Khôi phục chương |
| Cấm bình luận | Chưa có tác dụng ở Giai đoạn 1 (bình luận thuộc Giai đoạn 2) | Bỏ cấm bình luận |
| Khoá tài khoản | Đăng xuất ngay mọi phiên, không đăng nhập lại được; mọi truyện, chương, trang tác giả biến mất khỏi trang và tìm kiếm. Không sửa dữ liệu truyện | Mở khoá tài khoản |
| Gộp tag | Tab "Gộp tag": mọi truyện gắn tag cũ chuyển sang tag mới, URL tag cũ chuyển hướng 301 sang tag mới | Không có nút hoàn tác |
| Bỏ qua / Đánh dấu đã xử lý | Đóng một báo cáo mà không đổi nội dung | — |

Quyền: mod tác động lên reader và author; admin thêm cả mod. Không ai khoá được admin hay tự xử mình. Luật này áp cả cho nội dung: mod không ẩn/khôi phục truyện, chương của mod khác hay của admin (để admin làm), không ai xử truyện của chính mình. Báo cáo về nội dung của mod/admin khác vẫn đóng được (bỏ qua, đánh dấu đã xử lý); báo cáo về chính mình hoặc nội dung của mình thì không. Mod bị cấm bình luận hoặc bị khoá thì mất quyền kiểm duyệt. Trang chỉ hiện các nút được phép.

Trang công khai được Cloudflare cache: sau khi ẩn hoặc khoá, worker purge cache và đồng bộ tìm kiếm qua outbox, thường trong vòng một phút. Worker dừng thì nội dung cũ còn trên CDN tới khi worker chạy lại.

## Lưu ý

- **Mở khoá tài khoản:** tài khoản về trạng thái bình thường; nếu trước khi bị khoá họ đang bị cấm bình luận thì phải cấm lại. Chương hẹn giờ của tác giả đã quá giờ trong lúc bị khoá sẽ được đăng ngay ở lần quét kế tiếp (tối đa khoảng 60 giây), có thể đăng dồn nhiều chương.
- **Gộp tag:** chọn đúng tag đích trước khi xác nhận. Tag nào đã gộp vào tag nguồn trước đó cũng chuyển thẳng sang tag đích (không tạo chuỗi chuyển hướng nhiều bước). Gộp tag phổ biến sinh nhiều job purge, worker xử lý dần. Tag nguồn không còn truyện nào thì trang tag cũ có thể còn trong cache CDN tới khi hết hạn.
- **Báo cáo trùng lặp tự động:** chỉ bắt được chương chép gần nguyên văn (độ giống ước tính từ 70%). Chép rồi sửa nhiều (giống dưới khoảng 50%) gần như không bị phát hiện, cần người đọc báo cáo. Báo cáo tự động hiện "Giống N% với chương này" kèm link chương gốc. Bỏ qua một cặp trùng thì lần đăng lại có sửa nhẹ của cùng cặp sẽ không bị báo lại.
- Mô tả của người báo và ghi chú của mod là văn bản thuần, không ai ngoài mod/admin thấy. Tác giả không biết ai đã báo cáo.
