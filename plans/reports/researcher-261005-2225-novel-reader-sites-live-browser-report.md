# Nghiên cứu web truyện bằng trình duyệt thật (bổ sung cho redesign hướng B)

Ngày 2026-10-05. Bổ sung cho `researcher-261005-2203-novel-ui-patterns-vn-cn-en-report.md` (bản đó chủ yếu dựa trên kiến thức có sẵn). Lần này mở trang thật bằng Chrome (desktop) và agent-browser giả lập iPhone 14 (mobile), có chụp màn hình.

## Phạm vi đã xem
| Trang | Desktop | Mobile | Ghi chú |
| --- | --- | --- | --- |
| Royal Road | home, truyện, đọc | – | giao diện cũ, chỉ dùng làm ví dụ cần tránh |
| Webnovel | home, truyện, mục lục, đọc, cài đặt | home (bản mobile bị CAPTCHA Cloudflare chặn, không vượt) | |
| docln (Hako) | home, truyện, đọc | – | trang VN |
| Fanqie | home, truyện, đọc | – | |
| Qidian | home (ảnh không tải) | home, truyện, đọc, panel điều khiển | |
| Tapas | – | home Novels, truyện, đọc | |
| Wattpad | không vào được (trang lỗi, bị chặn ở VN) | – | |

Không xem được: **editor và dashboard tác giả** (phải có tài khoản, không tạo tài khoản), Apple Books, Kindle (app, không phải web).

## Đối chiếu 7 lớp trang trí của B+
| Lớp | Bằng chứng | Đề xuất |
| --- | --- | --- |
| Gáy sách trên bìa | Tapas: bìa có bóng gáy ở mép trái | **Giữ.** Rẻ, giúp lưới toàn bìa mặc định trông như sách |
| Hero "Biên tập chọn" | Webnovel (Weekly Book: bìa + giới thiệu trên nền tối), Qidian, Fanqie | **Giữ.** Trước Giai đoạn 2 lấy nguồn từ "truyện mới đáng chú ý"; Giai đoạn 2 đổi sang `featured_slots` |
| Meta giàu trên thẻ | Qidian (bìa trái + 2 dòng giới thiệu + chip thể loại/trạng thái/số chữ), docln (dòng chương mới nhất in màu) | **Giữ** cho dạng hàng ngang; thẻ lưới chỉ giữ 1 dòng meta |
| Ô thể loại | Qidian (hàng phím tắt dạng icon), docln và Webnovel (chip tag để lọc) | **Giữ dạng chip** cuộn ngang, không làm ô lớn |
| Icon tiêu đề mục | docln (nhãn 2 tông), Fanqie (hoạ tiết nhỏ cạnh tiêu đề) | **Giữ, làm nhẹ:** icon lucide nhỏ màu nhấn + nút "Xem thêm" bên phải |
| Hoạ tiết bìa theo thể loại | Không trang nào làm (họ đều có ảnh bìa thật) | **Bỏ.** Giữ chữ cái lớn mờ + gáy là đủ (YAGNI) |
| Nền chấm bi | Không trang nào dùng. Fanqie trang trí bằng **dải nền tông nhạt** sau từng khu, hoạ tiết chỉ ở mép | **Bỏ chấm bi**, thay bằng dải nền tông màu trơn. Không cần gradient nên không phải sửa quy tắc "không gradient" trong spec |

## Pattern mới đáng lấy (chưa có trong B / B+)
1. **Hero trang truyện theo màu** (Qidian, Tapas): dải màu đầu trang chứa bìa, tên, tác giả, chip tag chính; bên dưới là tấm nền thẻ bo góc trên phủ chồng lên dải. Mình không có màu lấy từ bìa, nên dùng màu `--cover-*` của tag chính (đã có sẵn).
2. **Hàng 3–4 số liệu lớn có vạch ngăn** (Qidian: hạng / tổng chữ / người theo dõi; docln: lần cuối / số từ / đánh giá / lượt xem). Nhãn nhỏ, số to.
3. **Mục lục**: ghim dòng "Chương mới nhất: … · N giờ trước" ở đầu, có nút đảo thứ tự (Webnovel, Tapas, Qidian). Desktop chia 2 cột (Webnovel) hoặc 3 cột (Fanqie).
4. **Trang truyện mobile có 2 nút dính đáy**: "Theo dõi" (viền) + "Đọc chương 1 / Đọc tiếp" (đặc) (Tapas, Qidian).
5. **Đầu chương**: dưới tiêu đề có dòng meta nhỏ "N chữ · cập nhật ngày" (Fanqie, docln).
6. **Thanh trang đọc mobile**: thanh trên 2 dòng (tên truyện nhỏ + tên chương) (Tapas); thanh dưới có mục lục, trước, sau, cài đặt (Tapas, Qidian).
7. **Thanh trang đọc desktop**: thanh nổi dọc bên phải, icon kèm nhãn chữ, mờ khi đang đọc (Fanqie, Webnovel, docln). Bảng cài đặt mở dạng panel bên cạnh cột chữ, không che chữ (Webnovel), nên xem trước được ngay.
8. **Cột giấy trên nền tông** (Webnovel, Fanqie): khớp B (nền `#F5F4EF` + thẻ trắng).

## Để dành cho Giai đoạn 2 (ghi lại, không làm trong redesign)
- Bình luận theo đoạn: Webnovel và Qidian hiện số đếm sau mỗi đoạn, Qidian còn chèn sẵn bình luận mẫu, nhìn rất rối. Nên có công tắc trong bảng cài đặt (Webnovel có công tắc này) và mặc định chỉ hiện chấm nhỏ.
- Lịch ra chương theo thứ trong tuần + nhãn "UP" (Tapas). Dữ liệu `scheduled_at`/`published_at` đã có sẵn.
- Huy hiệu cấp tác giả trên thẻ tác giả (Fanqie).
- Đọc thử đoạn đầu chương 1 ngay trên trang truyện, mờ dần + nút "Đọc tiếp" (Qidian). Phải đi qua `canReadChapter()`.

## Anti-pattern xác nhận
- Dòng chữ quá dài (~110–150 ký tự) và chữ nhỏ ở trang đọc: Royal Road, docln.
- Khối thông báo nhiều màu ở đầu trang (docln), quảng cáo chèn vào trang đọc (docln Shopee), sheet ép tải app (Qidian, Webnovel).
- Chèn bình luận mẫu vào giữa nội dung chương (Qidian).
- Trang chủ desktop kiểu cổng thông tin dày đặc (Qidian).

## Hạn chế
- Chưa xem được editor và dashboard tác giả của trang nào (cần đăng nhập). Phần này vẫn dựa vào report trước (iA Writer, Ulysses, Reedsy).
- Không có số đo hex hay kích thước; chỉ là quan sát bằng mắt từ ảnh chụp.

## Câu hỏi mở
- Có thêm hero theo màu tag chính cho trang truyện không?
- Có bỏ chấm bi và hoạ tiết bìa như đề xuất không?
- Thanh trang đọc: theo kiểu Tapas (gọn) hay Qidian (panel lớn hơn)?
