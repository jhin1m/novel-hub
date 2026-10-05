# Nghiên cứu UI web truyện (VN, CN, EN, app đọc hiện đại)

Nguồn: 2 researcher, 2026-10-05. **Hầu hết dựa trên kiến thức có sẵn, không fetch được live** (Qidian trả rỗng, truyenfull lỗi DNS, metruyencv đã đóng 10/02/2026). Pattern tin được; hex/kích thước chỉ là ước lượng.

## Pattern chung đáng lấy
- Home: khu biên tập/mod chọn → "Mới cập nhật" dạng **hàng** (tên + "Chương N" + thời gian) → xếp hạng tab ngày/tuần/tháng → chip thể loại. VN reader quen dạng này (metruyencv, truyenfull, docln).
- Card: bìa 2:3, tên 2 dòng, bút danh, 1 dòng meta (tag chính · số chương · cập nhật). Trạng thái là chữ nhỏ, không pill màu. Năm đầu không hiện rating trên card.
- Trang truyện: số liệu ≤ 4 (chương, chữ, theo dõi, nhịp ra chương), 2 CTA "Đọc tiếp Ch. N" / "Đọc từ đầu", tab Mục lục / Đánh giá / Bình luận, mục lục có đảo thứ tự + nhảy tới chương.
- Trang đọc: toolbar ẩn/hiện, vạch tiến độ 2px trong khu đọc, settings dạng bottom sheet xem trước ngay, 6 preset. Cuối chương: nút chương tiếp to, lời nhắn tác giả nhỏ, bình luận gập sau dòng đếm, nút theo dõi dạng chữ.
- Editor (iA Writer/Ulysses/Reedsy): nền trơn, trạng thái lưu nhỏ góc, đếm chữ, bubble menu khi chọn chữ, typography khớp trang đọc, revisions ở drawer.
- Mobile: thanh tab dưới (Wattpad, Fanqie, QQ Reading) và CTA dính đáy ở trang truyện.
- Thứ bậc bằng cỡ chữ + bậc nền (bg / surface / s2), một màu nhấn chỉ cho CTA, hạng, tab active.

## Anti-pattern
Quảng cáo chèn đoạn, popup, banner xoay tự động, bảng dày trên mobile, menu 20+ thể loại không nhóm, mục lục nghìn dòng không có jump, cuộn vô hạn ở trang đọc, bảng chọn màu tự do, inline comment mỗi đoạn kiểu Wattpad (ồn).

## Chẩn đoán UI hiện tại
- `--card` = `--background`, `--secondary`/`--muted`/`--accent` cùng `#F2EEE7` → không có bậc nền, nên trông phẳng.
- Home chỉ là 3 lưới bìa giống nhau; card có 5 dòng chữ xám ngang hàng.

## 3 hướng (đã dựng trên canvas)
| | A Hiệu sách biên tập | B Ứng dụng đọc ấm | C Mực và đèn đêm |
| --- | --- | --- | --- |
| Nền / nhấn (sáng) | `#FAFAF7` / đỏ son `#B42318` | `#F5F4EF` + thẻ trắng / mòng két `#0E6B5B` | `#F4EFE4` / đồng `#8A5A12` |
| Tối | `#121214` / `#F0796B` | `#101312` / `#4FC2A8` | **mặc định** `#12151C` / `#D8A657` |
| Font | Newsreader + Be Vietnam Pro | Plus Jakarta Sans + Source Serif 4 | Alegreya + Alegreya Sans |
| Bo góc | 2–4px | 10–26px, pill | 0–2px |
| Dấu ấn | số hạng nghiêng to, đường kẻ 2px, thể loại dạng chữ lớn | Đọc tiếp có thanh tiến độ, tab dưới, sheet cài đặt | khung bìa đôi viền đồng, hoa văn, chữ hoa đầu chương, mục lục có dấu chấm dẫn |
| Rủi ro | gần hướng cũ nếu làm nhạt tay | chung chung nhất, xa "đậm chất sách" | dark-first đổi quy ước dark theo OS; Alegreya ở cỡ nhỏ cần thử |

Mọi cặp chữ/nền chính đã kiểm ≥ 4.5:1 (script contrast trong scratchpad). Lưu ý: chữ vàng đồng trên bìa màu không đạt, nên vàng chỉ để trang trí, chữ bìa dùng `#F6F1E7`.

## Câu hỏi mở
- Chọn hướng nào, hay ghép (ví dụ bố cục A + màu/typo C)?
- Thanh tab dưới trên mobile (B) có cần không?
- Đoạn văn: cách đoạn (hiện tại) hay thụt đầu dòng (C)?
- Dark: vẫn theo OS hay thêm nút chuyển?
- Đổi font thì phải sửa spec §2/§8 (Literata, Be Vietnam Pro, danh sách font trang đọc).
