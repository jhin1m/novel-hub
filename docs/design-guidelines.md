# Hướng dẫn thiết kế

Bổ sung cho mục 8 của `docs/project-spec.md`. Khi Design System hoặc mockup lệch với repo, **`apps/web/src/styles/tokens.css` là chuẩn**.

## Nguồn

| Thứ | Link |
| --- | --- |
| Design System | chưa có |
| Mockup | chưa có |
| Tokens (chuẩn) | `apps/web/src/styles/tokens.css` |
| Bảng hằng để test | `apps/web/src/styles/token-values.ts` |

## Nguyên tắc (spec mục 8)

- "Yên tĩnh, đậm chất sách", mobile-first. Khu đọc gần như vô hình, khu khám phá giống hiệu sách, khu viết tập trung.
- Tông trung tính ấm (trắng ngà, xám than) + **một** màu nhấn: đất nung.
- Nhiều khoảng trắng, bo góc nhỏ (`--radius: 0.375rem`), không gradient, không bóng đổ (component shadcn đã bỏ `shadow-*`).
- Không quảng cáo, banner, popup; không thanh tiến trình chuyển trang; không hiển thị ID nội bộ.
- Mọi chuỗi hiển thị qua Paraglide (`packages/shared/messages/vi.json`), không hardcode.
- Dark mode theo `prefers-color-scheme` của hệ điều hành, không có nút chuyển. Animation tắt khi `prefers-reduced-motion: reduce`.

## Token màu

Tên theo quy ước shadcn/ui. **"Màu nhấn" = `--primary`**; `--accent` chỉ là nền hover của component.

| Token | Light | Dark | Dùng cho |
| --- | --- | --- | --- |
| `--background` / `--foreground` | `#FBF8F3` / `#2A2724` | `#1C1A18` / `#ECE6DD` | nền trang, chữ chính |
| `--card`, `--popover` (+ `-foreground`) | như background | như background | thẻ, menu, dialog |
| `--primary` / `--primary-foreground` | `#A8432A` / `#FBF8F3` | `#D9825F` / `#1C1A18` | màu nhấn: nút chính, link, focus ring |
| `--secondary`, `--muted`, `--accent` | `#F2EEE7` | `#2A2724` | nền phụ, nền hover |
| `--muted-foreground` | `#6B645C` | `#A89F94` | chữ phụ, gợi ý dưới ô nhập |
| `--destructive` | `#A3342B` | `#E5806F` | lỗi, hành động xoá |
| `--input` | `#8A8278` | `#6F675E` | viền ô nhập (đạt 3:1) |
| `--border` | `#E4DED4` | `#3A3632` | đường kẻ trang trí (không yêu cầu tương phản) |
| `--ring` | = `--primary` | = `--primary` | viền focus, dùng ở độ đậm 70% (`ring-ring/70`, ≈ 3.2:1 light / 3.6:1 dark) |

Utility Tailwind tương ứng: `bg-background`, `text-foreground`, `text-primary`, `border-input`, ... (ánh xạ trong `@theme inline` của `app.css`).

## Font

Self-host qua `@fontsource*`, không gọi Google Fonts.

| Token | Font | Utility | Dùng cho |
| --- | --- | --- | --- |
| `--font-ui` | Be Vietnam Pro 400/500/600/700 | `font-sans` (mặc định của `body`) | giao diện |
| `--font-content` | Literata (variable, thường + nghiêng) | `font-serif` | nội dung truyện, tiêu đề |
| `--font-reader-noto-serif` | Noto Serif (variable) | dùng qua `var()` | lựa chọn ở trang đọc |
| `--font-reader-inter` | Inter (variable) | dùng qua `var()` | lựa chọn ở trang đọc |

- `__root.tsx` preload Literata và Be Vietnam Pro 400 (subset `latin` + `vietnamese`).
- `@font-face` có `unicode-range`, trình duyệt chỉ tải font khi có chữ dùng nó: Noto Serif và Inter không tải ở trang thường.

## Preset trang đọc

Chọn bằng thuộc tính `data-reader-theme` trên phần tử gốc; không có thuộc tính thì mặc định `ivory` (light) hoặc `dark-gray` (dark). Danh sách preset khai báo ở `READER_THEMES` (`packages/shared/src/schemas/reader.ts`). Biến: `--reader-bg`, `--reader-fg`, `--reader-muted` (utility `bg-reader-bg`, `text-reader-fg`, `text-reader-muted`).

| Preset | Tên hiển thị | `--reader-bg` | `--reader-fg` | `--reader-muted` |
| --- | --- | --- | --- | --- |
| `white` | Sáng | `#FFFFFF` | `#1F1F1F` | `#5F5F5F` |
| `ivory` | Ngà | `#FBF6EC` | `#2B2722` | `#675F55` |
| `sepia` | Sepia | `#F4ECD8` | `#3B2F22` | `#6A5A47` |
| `soft-green` | Xanh dịu (xanh lá nhạt) | `#E6EFE4` | `#22302A` | `#4E5F55` |
| `dark-gray` | Xám tối | `#2B2B2B` | `#D6D3CE` | `#A3A09B` |
| `oled-black` | Đen OLED | `#000000` | `#C9C5BE` | `#8F8B85` |

Không có bảng chọn màu tự do.

## Bìa mặc định

Truyện chưa có bìa hiện bìa chữ (`components/story-cover.tsx`): HTML/CSS thuần, tỷ lệ 2:3, tiêu đề (Literata) + đường kẻ mảnh + bút danh (Be Vietnam Pro), không hiện tag. Có bìa thì dùng `<img>` `srcset` 300w/600w, `width=600 height=900`; ảnh lỗi tải thì rơi về bìa chữ.

| Token | Màu | Tên gợi nhớ |
| --- | --- | --- |
| `--cover-0` | `#8A2F3C` | đỏ son |
| `--cover-1` | `#7A4E2D` | nâu đất |
| `--cover-2` | `#7D6420` | vàng đồng |
| `--cover-3` | `#4F5D2F` | rêu |
| `--cover-4` | `#2F5D50` | lục bảo |
| `--cover-5` | `#2E5266` | lam khói |
| `--cover-6` | `#2C3E66` | chàm |
| `--cover-7` | `#5B3A64` | tím mơ |
| `--cover-8` | `#7E3B54` | hồng trầm |
| `--cover-9` | `#3A3632` | xám than |
| `--cover-fg` | `#FBF8F3` | chữ trên bìa |

- Dùng chung cho light và dark (bìa là "vật thể", không đổi theo theme). Mọi màu đạt ≥ 5.3:1 với `--cover-fg`.
- Chọn màu: FNV-1a 32-bit trên slug tag chính `% COVER_PALETTE_SIZE` (`lib/cover-palette.ts`). Truyện cùng tag chính cùng màu; hash thuần số nguyên nên server và trình duyệt cho cùng kết quả.
- Cỡ tiêu đề theo 4 nấc độ dài (≤ 20, ≤ 45, ≤ 90, > 90 ký tự), đơn vị `cqw` theo bề rộng bìa (cỡ `rem` làm dự phòng), tối đa 6 dòng.
- Thêm màu: thêm `--cover-N` (N liên tiếp) vào `tokens.css` và `TOKEN_VALUES.cover`, tăng `COVER_PALETTE_SIZE`. `pnpm test` kiểm tương phản và số biến khớp nhau. Đổi số màu làm đổi màu của các tag hiện có.

## Quy tắc tương phản

- Mọi cặp chữ/nền đạt WCAG AA **4.5:1**; viền ô nhập đạt **3:1** (WCAG 1.4.11).
- Danh sách cặp kiểm tra: `CONTRAST_PAIRS` trong `token-values.ts`. `pnpm test` kiểm mọi cặp ở light, dark và 6 preset, đồng thời đối chiếu từng giá trị có nguyên văn trong `tokens.css`.
- Đổi hoặc thêm màu: sửa **cả** `tokens.css` và `token-values.ts` (mỗi giá trị một dòng `--tên: #hex;`), thêm cặp vào `CONTRAST_PAIRS` nếu là cặp chữ/nền mới. Hàm `contrastRatio()` ở `apps/web/src/lib/contrast.ts`.

## Component

- shadcn/ui (style `new-york`) ở `apps/web/src/components/ui/`, chỉ thêm component cần dùng. Hiện có: button, input, textarea, label, checkbox, select, dialog, sheet, dropdown-menu, badge.
- Không chạy `shadcn init` (kéo package `cn`). Thêm component: trong `apps/web` chạy `pnpm dlx shadcn@latest add <tên>`, rồi:
  1. kiểm `package.json`: CLI tự thêm `cn` thì gỡ, import `cn` từ `@/lib/utils` (`clsx` + `tailwind-merge`);
  2. xoá class `shadow-*`, giữ `focus-visible:ring` nhưng đổi `ring-ring/50` → `ring-ring/70` (50% chỉ ≈ 2.2:1, không đạt 3:1 của WCAG 1.4.11);
  3. chuỗi tiếng Anh mặc định (vd. `sr-only` "Close") chuyển sang `m.*()`;
  4. `pnpm format`.
- Không thêm `sonner`: thông báo dùng inline như `FormMessage`.
- Khung trang: `SiteLayout` (`components/site-layout.tsx`) là component từng trang tự bọc; trang đọc và chế độ viết tập trung không dùng. Trang 404/lỗi mặc định ở `components/not-found.tsx`.
