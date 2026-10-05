# Review phase 2: Component dùng chung

Ngày: 2026-10-06 · Reviewer: code-reviewer (subagent) · Controller xử lý `[auto]`

## Kết quả

Mọi tiêu chí Success Criteria đạt; không vỡ contract, không regress nơi gọi (StoryCover `className` lên wrapper, link tên kéo phủ thẻ, `getByText('Nháp')`, strict `search.spec`). Badge mọi variant đạt AA light/dark (thấp nhất 5.37:1).

## Findings và xử lý

| # | Mức | Finding | Xử lý |
| --- | --- | --- | --- |
| 1 | High | Header 360px tràn (372 > 360), `header-mobile.spec.ts:43` đỏ do nút 44px | Sửa: `size="sm"`/`icon-sm` cho nút header `site-layout.tsx` (bước 8 plan). e2e 72/72 xanh |
| 2 | Medium | Thẻ lưới mất ngày cập nhật (spec §8 bắt buộc) và bút danh hiển thị | [auto] Thêm lại bút danh + "Cập nhật {ngày}". Lý do: spec thắng plan; bìa chữ `aria-hidden` |
| 3 | Low | Placeholder AccountMenu `h-9` | Không cần: nút tài khoản giờ `size="sm"` = h-9 |
| 4 | Low | Sheet adaptive thiếu `overflow-y-auto`, tay nắm cộng `gap-4` | Để phase 7, 10 đặt ở nơi gọi |
| 5 | Low | `StoryGrid` < `sm` giữ 2 cột | [auto] Giữ, ghi vào phase file |
| 6 | Low | Gáy `w-[5%]` thay `5cqw` | Chấp nhận (tương đương) |
| 7 | Low | `Badge asChild` link tag cao 24px ở trang chủ/trang truyện | Phase 4, 5 thay bằng `TagChip` |
| 8 | Low | `aria-invalid:border-destructive` thừa ở Button | Bỏ qua (vendor, vô hại) |
| 9 | Low | `overflow-x-auto` khi `scroll` có thể cắt focus outline mép | Theo dõi ở phase 4 |

## Câu hỏi mở

- Thẻ lưới thêm bút danh + ngày (lệch canvas gọn hơn): user duyệt sáng.
