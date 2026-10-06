# Cook phase 12: Tài liệu và spec

Ngày 2026-10-06, `--auto` (qua đêm). Chỉ sửa tài liệu, không đổi code.

## Đã làm

- `docs/project-spec.md`: §2 thêm hàng "Font" (4 package `@fontsource-variable/*`); §8 sửa đủ các vị trí: câu mở (hướng "ấm, như một ứng dụng đọc", hero "Mới đáng chú ý" không phải banner), màu, chữ, bo góc/bóng, font trang đọc (giữ "Font khác mặc định chỉ tải khi người đọc chọn"), thanh điều hướng trang đọc (mốc 1024px, rail, panel phải), cuối chương (lời nhắn → Chương tiếp → Chương trước; bình luận ở GĐ2), bìa (gáy, chữ cái mờ), trang chủ (hero, chip, `--band`, thanh tab 5 mục), trang truyện (dải màu tag, CTA dính đáy), `/write` dải số liệu. Không đổi checkbox nào.
- `docs/design-guidelines.md`: viết lại theo code: link canvas, nguyên tắc B+, bảng token (gồm `--primary-soft`, `--band`, `--warning-*`, `--card` tách nền), khu đọc 6 preset + `--reader-card` + `--reader-primary*` (chỉ `.reader-page`, màn 18+ ngoài), font + preload, thang chữ chỉ phần đã có, bo góc, bóng, focus `ring-ring`, bìa, component chung, layout, mốc `lg`, quy tắc `display:none`.
- `docs/deployment-cloudflare.md`: đoạn "Purge Everything sau deploy/rollback đổi asset" trong mục Purge cache.

## Kiểm

- Grep font/màu cũ, "Biên tập chọn" trong `docs/`: 0 (chỉ còn nhắc giá trị cũ `be-vietnam-pro`/`inter` có chủ ý ở mục map legacy).
- Mọi hex trong `design-guidelines.md` có trong `tokens.css`.
- Gate (tester): typecheck, lint, format:check, test 693, test:int 301, e2e 93: xanh. Sau khi sửa theo review chạy lại `pnpm format:check`: xanh.
- Review (code-reviewer): đạt mọi tiêu chí; 7 sai lệch nhỏ đã sửa trong docs.

## Quyết định tự chọn

- [auto] Serif ngoài nội dung truyện (giới thiệu, tên chương ở trang đọc, thân trang điều khoản, chữ "N" logo, mẫu "Aa") ghi vào docs là ngoại lệ, không sửa code. Lý do: phase chỉ tài liệu; khuyến nghị của reviewer.
- [auto] Đoạn purge thêm "không chắc có đổi asset thì cứ purge" thay vì liệt kê khi nào bỏ qua. Lý do: build Vite có thể đổi hash dù chỉ đổi code server.

## Ghi chú cho plan sau (không làm ở đây)

- Nút đóng dialog/sheet còn `focus:ring-2 ring-offset-2` (`ui/dialog.tsx:65`, `ui/sheet.tsx:92`), lệch quy tắc focus `ring-[3px] ring-ring`.
- Tên chương ở trang đọc dùng `font-serif` cố định, không theo font người đọc chọn.
- Phase file ghi `docs/` nằm trong `.prettierignore`: thực tế không; docs vẫn qua prettier.
- Trước deploy production đầu tiên (và mỗi deploy đổi asset): làm bước Purge Everything.

## Câu hỏi mở

- Ngoại lệ serif (logo, trang điều khoản) có đúng ý user không, hay chuyển sang sans?
