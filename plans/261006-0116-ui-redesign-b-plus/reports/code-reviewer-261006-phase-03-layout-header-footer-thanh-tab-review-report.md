# Review phase 3: layout header footer thanh tab

Reviewer: code-reviewer subagent, 2026-10-06. Status: DONE_WITH_CONCERNS (chỉ Low).

## Kết quả
- Mọi tiêu chí phase + "Accessible name phải giữ" đạt. Không regression e2e/hydrate/contract.
- Gate: typecheck, lint, format:check, unit 654, int 301, e2e 77 xanh.
- TanStack `Link` tự gắn `aria-current="page"` khi active (không tắt được bằng `undefined`); tập router đánh active luôn là tập con của `activeMainTab` → nhất quán (kiểm bằng SSR render, router 1.170.41).
- Tương phản tab: muted/card ~6.4 (light) ~7 (dark); primary/card ~6.3/~8; primary/primary-soft ~5.3/~6.

## Low (không sửa phase này)
1. Placeholder tài khoản 42px → header khách dịch ~150px khi `/me` trả về. [auto] Giữ: spec phase ghi `size-[42px]`.
2. Thanh tab fixed có thể che phần tử được focus (WCAG 2.4.11); cách sửa `scroll-padding-bottom` trên `html` khi có thanh tab. [auto] Hoãn: không có e2e/tiêu chí, cần CSS toàn cục; ghi cho phase 11.
3. `env(safe-area-inset-bottom)` = 0 vì viewport meta thiếu `viewport-fit=cover` (`__root.tsx`). [auto] Hoãn: đổi root head ngoài phạm vi.
4. "Tôi" trỏ `/sign-in` cho user đã đăng nhập tới khi `useMe` xong. Spec chấp nhận (SSR giống nhau).
5. `/` ở 360 có 2 link `aria-current` (logo do router tự gắn + tab). Vô hại.

## Nits
- Ô tìm dùng `border-input` thay `--border` (đạt 3:1 cho viền input) → giữ.
- Pill desktop là `div` không phải `nav` (tránh trùng tên "Điều hướng chính") → giữ.
- e2e chỉ chứng minh "Tủ truyện" điều hướng client; "Viết"/"Tôi" là `Link` theo code.

## Câu hỏi mở
- Placeholder khách 42px có cần xem lại không (Low 1)?
- Thêm `viewport-fit=cover` + `scroll-padding-bottom` ở phase sau (Low 2, 3)?
