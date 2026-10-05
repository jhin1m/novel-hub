# Brainstorm redesign UI: handoff (dừng giữa chừng)

Ngày 2026-10-05. Chưa có plan, chưa sửa code. Brainstorm chưa chốt.

## Đã làm
- Canvas thiết kế (private): https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo
  - Trang "Vòng 1 · 3 hướng": bảng so sánh + A (Hiệu sách biên tập), B (Ứng dụng đọc ấm), C (Mực và đèn đêm). Mỗi hướng có home desktop, home mobile, trang truyện mobile, trang đọc mobile.
  - Trang "Vòng 2 · Hướng B": `B-tokens` (token sheet đầy đủ) + `B2-home-mobile` (B+ có 7 lớp trang trí bật/tắt ở Tweaks).
- Nghiên cứu: `researcher-261005-2203-novel-ui-patterns-vn-cn-en-report.md`. **Hạn chế lớn:** researcher gần như không fetch được trang thật, nội dung dựa trên kiến thức có sẵn.

## Quyết định của user
- Không ưng UI hiện tại: trống/nhạt, màu và font chưa đẹp, thiếu thứ bậc, trang đọc và editor chưa tốt.
- Token và font được đổi thoải mái.
- Chọn **hướng B** (Plus Jakarta Sans + Source Serif 4, nền `#F5F4EF`, thẻ trắng, nhấn mòng két `#0E6B5B` / tối `#4FC2A8`, bo tròn, nút dạng viên).
- Giữ: thanh tab dưới trên mobile, ô "Đọc tiếp" đầu trang chủ (tải ở client để HTML vẫn cache được).
- Không chọn: thụt đầu dòng kiểu sách, nút chuyển sáng/tối (dark vẫn theo OS).
- Phản hồi về B+: "hơi ít chi tiết, trang trí thêm được không". B+ đã dựng nhưng **user chưa duyệt lớp nào**.

## Chưa chốt
- Giữ lớp trang trí nào: hoạ tiết bìa theo thể loại, gáy sách, hero Biên tập chọn, meta giàu, icon tiêu đề mục, ô thể loại, nền chấm bi.
- User muốn **nghiên cứu thêm các trang novel reader** trước khi chốt.

## Việc tiếp (session sau)
1. Nghiên cứu lại bằng **trình duyệt thật** (claude-in-chrome hoặc ak:agent-browser), chụp màn hình thay vì chỉ WebFetch. Gợi ý: Webnovel, Wattpad, Royal Road, Tapas, Fanqie web, Qidian m., docln/Hako, metruyencv (nếu còn), Waka; app đọc: Apple Books, Kindle, Readwise Reader. Tập trung trang đọc, trang truyện, trang chủ, dashboard tác giả và editor.
2. Ghi lại những thứ đáng lấy vào report mới, đối chiếu với B / B+.
3. Chốt lớp trang trí, rồi làm tiếp các màn còn lại trên canvas: home desktop B+, trang truyện desktop, trang đọc desktop, /write mobile + desktop, editor mobile + desktop.
4. User duyệt xong thì viết report brainstorm cuối, rồi chạy `/ak:plan` cho redesign. Đây là plan riêng do user thêm, không phải checkbox trong spec.

## Ảnh hưởng tới spec / code khi triển khai
- Spec §8 phải sửa: "yên tĩnh, đậm chất sách", "bo góc nhỏ", "bìa không hiện tag" (nếu giữ hoạ tiết theo thể loại), "không gradient" (nền chấm bi dùng `radial-gradient`).
- Spec §2/§8 về font: Literata/Be Vietnam Pro → Plus Jakarta Sans + Source Serif 4; cập nhật danh sách font trang đọc.
- `apps/web/src/styles/tokens.css` + `token-values.ts` + `CONTRAST_PAIRS`: thêm `--primary-soft`, `--warning-soft/-fg`, tách `--card` khỏi `--background`. Cặp chính đã kiểm ≥ 4.5:1, viền ô nhập ≥ 3:1.
- Bìa: giữ 10 màu `--cover-*`, đổi layout (chữ sans đậm, chữ cái lớn mờ, có thể thêm hoạ tiết + gáy).
- Trend xếp hạng (↑/↓, MỚI) cần lưu hạng kỳ trước (Giai đoạn 2).
- Giữ accessible name để e2e ít vỡ.
