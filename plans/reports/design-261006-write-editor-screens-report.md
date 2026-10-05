# Thiết kế khu viết: /write và editor chương (B+ đã chốt)

Ngày 2026-10-06, chế độ tự động qua đêm. Canvas (private): https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo, trang "Vòng 3 · B+ đã chốt", hai hàng mới ở dưới cùng. Chưa sửa code.

## Artboard đã thêm
| File | Nội dung |
| --- | --- |
| `F-write-desktop` | `/write` desktop (PAGE). Tweaks `state`: list / empty / unverified / signedOut |
| `F-write-mobile` | `/write` mobile, 4 điện thoại: danh sách, chưa có truyện, chưa xác thực email, chưa đăng nhập |
| `F-editor-desktop` | Editor desktop, 6 màn xếp dọc: đang viết (cuộn tới lời nhắn), hộp thoại đăng/hẹn giờ, lịch sử phiên bản (xem trước), tập trung, đang hẹn giờ + có sửa, xung đột |
| `F-editor-mobile` | Editor mobile, 8 điện thoại: đang viết, cuối chương, sheet đăng/hẹn giờ, sheet lịch sử, tập trung, đang hẹn giờ, xung đột, bản chưa lưu trên máy + lỗi mạng |

Tất cả có Tweaks `dark`. Token, font, bìa (gáy + chữ cái mờ), pill, thanh tab dưới giống các artboard F-* đã có.

## /write: Truyện của tôi
- **Desktop:** header site như trang chủ, nav "Viết truyện" ở trạng thái `aria-current`. Dải `--band` bo 28: h1 "Truyện của tôi" + hàng 3 số liệu có vạch ngăn (truyện, chương đã đăng, chữ) + nút đặc "Tạo truyện mới". Bên dưới là lưới thẻ ngang 2 cột (`minmax(520px,1fr)`): bìa 112px, badge hiển thị (Đã đăng = soft/accent, Nháp = s2/muted, Bị ẩn = viền danger), chấm màu + tên tag chính, tên truyện 20px, dòng "Tình trạng · N chương · N chữ", "Sửa lần cuối …", chữ "Quản lý →". Cả thẻ là một link tới `/write/stories/$publicId`.
- **Mobile:** tiêu đề + nút "Tạo truyện" (pill 44px) cùng hàng; dải 3 số liệu; danh sách thẻ ngang (bìa 76px, chevron phải); thanh tab dưới, tab "Viết" đang chọn.
- **Trạng thái:** rỗng (icon bút trong vòng soft + `writer_empty` + CTA), chưa xác thực (khối `--warnbg`, nút "Gửi lại mail xác thực", dòng status sau khi gửi), chưa đăng nhập (`writer_sign_in_required` + "Đăng nhập"). Hai trạng thái gate không có nút tạo truyện.

## Editor chương
- **Nền trơn:** cả trang dùng `--bg`, không thẻ, không sidebar. Cột chữ 680px (~70ch), Source Serif 4 20px/1.85 (mobile 18px). Tên chương là input không viền, serif 36px (mobile 26px).
- **Header desktop (68px):** "← Về trang truyện" | tên truyện nhỏ + "Chương 12" + badge trạng thái chương (+ pill "Có thay đổi chưa đăng") | trạng thái lưu nhỏ (chấm màu + chữ, `role=status`) | "2.840 chữ" | "Lịch sử" | icon "Chế độ tập trung" | nút đặc "Đăng"/"Cập nhật".
- **Toolbar desktop:** viên nổi giữa dưới header, 9 nút 40px chia 3 nhóm (B I S | H2 H3 trích dẫn ngắt cảnh | hoàn tác làm lại), nút đang bật dùng `--soft` + `aria-pressed`.
- **Mobile:** header 64px gồm back icon, "Chương 12" + badge, dòng 2 là trạng thái lưu; icon Lịch sử, icon Tập trung, nút "Đăng". Số chữ chuyển xuống dưới tên chương (giống dòng meta ở trang đọc). Toolbar dính đáy (trên bàn phím): phần định dạng cuộn ngang, hoàn tác/làm lại ghim bên phải.
- **Chế độ tập trung:** chỉ còn chữ; góc phải trên có trạng thái lưu mờ 60% + nút thoát mờ 40%. Esc thoát như hiện tại.
- **Đăng / hẹn giờ:** desktop là dialog 520px, mobile là bottom sheet. Mô tả số chữ + thanh đo (vạch mốc 300 chữ), 2 thẻ radio "Đăng ngay" / "Hẹn giờ", ô `datetime-local` + hint, nút Huỷ / "Hẹn giờ đăng" (hoặc "Đăng chương", "Cập nhật"). Chương đã đăng thì không có phần chọn thời điểm, giống code hiện tại.
- **Lịch sử phiên bản:** desktop là sheet phải 560px; mobile là sheet đáy gần full màn. Danh sách: thời điểm, số chữ, badge "Đang đăng". Chế độ xem trước: "← Danh sách phiên bản", meta, "Khôi phục vào bản nháp", nội dung serif. Bước xác nhận khôi phục vẫn dùng dialog hiện có (chưa vẽ).
- **Banner trên tên chương:** hẹn giờ (`--warnbg`, icon đồng hồ, "Cập nhật bản hẹn giờ" / "Huỷ hẹn"), xung đột (nền surface, viền `--danger`, icon cảnh báo, "Tải bản mới nhất" đặc / "Giữ bản của tôi" viền), bản chưa lưu trên máy (`--band`, "Khôi phục" / "Bỏ"), notice sau khi đăng/hẹn giờ là một dòng `role=status` màu muted.
- **Trạng thái lưu:** Đã lưu (chấm accent), Chưa lưu / Đang lưu… (chấm xám), Lỗi / Xung đột (chữ + chấm `--danger`).
- **Cuối chương:** ngắt cảnh là vạch ngắn giữa cột; "Lời nhắn tác giả" là ô surface bo 20 với label, textarea, hint "Tối đa 1.000 ký tự".

Giữ đủ chức năng hiện có: autosave + bản sao local, xung đột, khôi phục bản local, đăng, cập nhật, hẹn giờ, cập nhật/huỷ hẹn, lịch sử + xem trước + khôi phục, tên chương, lời nhắn, số chữ, chế độ tập trung. Accessible name giữ như cũ (`Lịch sử`, `Chế độ tập trung`, `Định dạng`, `Nội dung chương`, `Tên chương`, `Đăng`, …) để e2e ít vỡ.

## Ảnh hưởng khi triển khai
- Không cần API hay chuỗi i18n mới, trừ 3 nhãn số liệu ở `/write` ("truyện", "chương đã đăng", "chữ") và chữ "Quản lý". Số liệu cộng ở client từ `useMyStories` (`chapterCount` chỉ đếm chương đã đăng, xác nhận ở `packages/core/src/publishing/counters.ts:15`).
- Cần token `--warning-soft/-fg` và `--band` (đã nằm trong danh sách token mới của redesign).
- Header editor mobile chật khi badge "Đã đăng" + nút "Cập nhật": cho phép cắt chữ (ellipsis) ở dòng tiêu đề.

## Validation Log
- [auto] Dùng canvas thay vì report-only: công cụ Artifact có sẵn, publish cùng URL thành công (version 12).
- [auto] Nhiều trạng thái gom vào một artboard (một dải điện thoại / các màn desktop xếp dọc) thay vì một file mỗi trạng thái: người duyệt thấy hết khi lướt canvas, không phải bật Tweaks. `/write` desktop là PAGE nên dùng Tweaks `state`.
- [auto] Thêm dải 3 số liệu ở `/write`: rẻ (cộng client từ dữ liệu sẵn có), khớp pattern "hàng số liệu có vạch ngăn" đã chốt; dashboard đầy đủ vẫn để Giai đoạn 2.
- [auto] Không thêm lọc theo trạng thái, nút "Viết chương mới" hay "Xem trang truyện" trên thẻ `/write` (YAGNI, ngoài phạm vi chức năng hiện có).
- [auto] Editor dùng nền `--bg` cho toàn trang, không có tờ giấy trắng: đúng "nền trơn" của spec §8, đồng bộ trang đọc.
- [auto] Mobile bỏ chữ trên nút Lịch sử/Tập trung (chỉ icon + `aria-label`), đưa số chữ xuống dưới tên chương: header 390px không đủ chỗ.
- [auto] Đăng/hẹn giờ và lịch sử trên mobile là bottom sheet; desktop giữ dialog và sheet phải như code hiện tại.
- [auto] Thanh đo số chữ trong hộp thoại đăng chỉ là trang trí phụ cho dòng mô tả sẵn có; không thêm chuỗi mới.

## Câu hỏi mở (cho user khi dậy)
- Dải số liệu ở `/write` có giữ không, hay để trống cho tới dashboard Giai đoạn 2?
- Trang quản lý truyện `/write/stories/$publicId` (mục lục chương, bìa, form) chưa vẽ: có cần vẽ trước khi chạy `/ak:plan` cho redesign không?
- Nút "Đăng" bị vô hiệu khi số chữ ngoài 300–20.000 nhưng hiện không nói lý do: có thêm dòng gợi ý cạnh nút không (cần chuỗi i18n mới)?
