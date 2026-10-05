# Brainstorm cuối: redesign UI hướng B+ ("Ứng dụng đọc ấm")

Ngày 2026-10-06, chế độ tự động qua đêm. Gộp mọi quyết định đã chốt để `/ak:plan` lên plan **không cần mở canvas**. Chưa sửa code.

Nguồn đã gộp:
- `plans/reports/brainstorm-261005-2224-ui-redesign-direction-handoff-report.md` (chọn hướng B)
- `plans/reports/researcher-261005-2225-novel-reader-sites-live-browser-report.md` (đối chiếu lớp trang trí, pattern mới)
- `plans/reports/design-261006-write-editor-screens-report.md` (đặc tả /write + editor, chi tiết hơn mục 7–8 ở đây)
- Memory `ui-redesign-before-stage-2` (các quyết định user chốt ở session 2)
- Canvas https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo, trang "Vòng 3 · B+ đã chốt": `F-home-desktop/mobile`, `F-story-desktop/mobile`, `F-reader-desktop/mobile/mobile-settings`, `F-write-desktop/mobile`, `F-editor-desktop/mobile`; trang "Vòng 2": `B-tokens` (bảng token + thành phần)
- Code hiện tại: `apps/web/src/styles/tokens.css`, `token-values.ts`, `packages/shared/src/schemas/reader.ts`, `apps/web/e2e/*.spec.ts`

Đây là plan riêng do user thêm (không phải checkbox spec), chạy **trước Giai đoạn 2**. Quyết định đánh `[auto]` là do worker tự chọn đêm nay, sáng cần user duyệt.

---

## 1. Tóm tắt hướng

- Nền ấm `#F5F4EF`, nội dung đặt trên thẻ trắng; thứ bậc đến từ bậc nền (nền → dải `--band` → thẻ), không từ bóng đổ.
- Một màu nhấn mòng két (`#0E6B5B` / tối `#4FC2A8`), chỉ cho hành động chính, mục đang chọn, tiến độ, focus.
- Chữ giao diện **Plus Jakarta Sans**, chữ truyện **Source Serif 4**.
- Bo tròn mềm; nút, chip, tab dạng viên (pill). Vùng chạm ≥ 44px.
- Dark theo OS (`prefers-color-scheme`), **không** có nút chuyển sáng/tối.
- Lớp trang trí giữ lại (user chốt): gáy sách trên bìa, hero "Biên tập chọn", meta giàu trên thẻ dạng hàng, chip thể loại, icon nhỏ cạnh tiêu đề mục, dải nền tông trơn (`--band`), hero màu tag chính ở trang truyện, hàng số liệu lớn có vạch ngăn.
- Lớp trang trí bỏ (user chốt): nền chấm bi, hoạ tiết bìa theo thể loại.

## 2. Tokens

### 2.1 Bảng màu giao diện (light / dark)

Tên theo shadcn/ui như code hiện tại. **Canvas dùng tên ngắn** (`--bg`, `--surface`, `--s2`, `--accent`, `--afg`, `--soft`, `--band`, `--warnbg/--warnfg`, `--danger`); cột 2 là ánh xạ. Lưu ý: `--accent` của canvas = `--primary` trong code; `--accent` trong code vẫn chỉ là nền hover của component.

| Token (code) | Canvas | Light | Dark | Dùng cho |
| --- | --- | --- | --- | --- |
| `--background` | `--bg` | `#F5F4EF` | `#101312` | nền trang, nền editor, nền trang truyện dưới hero |
| `--foreground` (+ mọi `*-foreground` trung tính) | `--fg` | `#1C1D1B` | `#E8ECE9` | chữ chính |
| `--card`, `--popover` | `--surface` | `#FFFFFF` | `#181C1A` | thẻ, sheet, menu, dialog, ô nhập, header thanh tab |
| `--secondary`, `--muted`, `--accent` | `--s2` | `#ECEAE3` | `#222724` | nút phụ, nền tab group, thanh tiến độ trống, nền hover |
| `--muted-foreground` | `--muted` | `#5D5F59` | `#9AA39E` | chữ phụ, meta |
| `--border` | `--border` | `#E3E1D9` | `#2C322F` | viền thẻ, đường kẻ (trang trí) |
| `--input` | `--input` | `#8A8C85` | `#6E7771` | viền ô nhập (≥ 3:1) |
| `--primary`, `--ring` | `--accent` | `#0E6B5B` | `#4FC2A8` | màu nhấn, link, focus ring |
| `--primary-foreground` | `--afg` | `#FFFFFF` | `#0B1F1A` | chữ trên màu nhấn |
| `--primary-soft` **(mới)** | `--soft` | `#DDEFEA` | `#17332C` | nền khối nhấn nhẹ: mục đang chọn, tab bar pill, hàng "Đang đọc", badge "Đã đăng", icon tiêu đề mục |
| `--band` **(mới)** | `--band` | `#ECE8DF` | `#161A18` | dải nền tông trơn sau một khu ở trang chủ, khối số liệu `/write`, banner bản local trong editor |
| `--destructive` | `--danger` | `#B3261E` | `#F2877C` | lỗi, xoá, nhãn 18+, xung đột |
| `--warning-soft` **(mới)** | `--warnbg` | `#FFF1DC` | `#2E2312` | nền nhãn/banner Tạm ngưng, Hẹn giờ, cảnh báo |
| `--warning-foreground` **(mới)** | `--warnfg` | `#8A4B00` | `#F2B866` | chữ trên `--warning-soft` |

Điểm khác code hiện tại: `--card`/`--popover` **tách khỏi** `--background` (giờ là trắng, không còn bằng nền); bỏ màu đất nung.

### 2.2 Bìa chữ mặc định

- Giữ nguyên 10 màu `--cover-0..9` (`#8A2F3C #7A4E2D #7D6420 #4F5D2F #2F5D50 #2E5266 #2C3E66 #5B3A64 #7E3B54 #3A3632`), dùng chung light/dark, chọn bằng hash slug tag chính như `lib/cover-palette.ts`.
- `--cover-fg`: `#FBF8F3` → **`#F6F1E7`** (theo canvas). Tương phản thấp nhất 5.02:1 (trên `--cover-2`).

### 2.3 Khu đọc (6 preset, giữ nguyên giá trị hiện có)

| Preset (`data-reader-theme`) | `--reader-bg` | `--reader-fg` | `--reader-muted` | `--reader-card` **(mới)** | Màu nhấn trong preset |
| --- | --- | --- | --- | --- | --- |
| `white` (Sáng) | `#FFFFFF` | `#1F1F1F` | `#5F5F5F` | `#F4F4F2` | light (`#0E6B5B`) |
| `ivory` (Ngà) | `#FBF6EC` | `#2B2722` | `#675F55` | `#F3ECDD` | light |
| `sepia` (Sepia) | `#F4ECD8` | `#3B2F22` | `#6A5A47` | `#EADFC6` | light |
| `soft-green` (Xanh dịu) | `#E6EFE4` | `#22302A` | `#4E5F55` | `#D9E5D6` | light |
| `dark-gray` (Xám tối) | `#2B2B2B` | `#D6D3CE` | `#A3A09B` | `#363636` | dark (`#4FC2A8`) |
| `oled-black` (Đen) | `#000000` | `#C9C5BE` | `#8F8B85` | `#141414` | dark |

- `--reader-card`: nền khối lời nhắn tác giả, nút phụ cuối chương, rail desktop, nhãn "Chương N".
- Không chọn preset = theo OS như hiện tại (light → ngà, dark → xám tối); "Khôi phục mặc định" vẫn bỏ `data-reader-theme`.
- `[auto]` Mỗi preset ghi đè `--primary`, `--primary-foreground`, `--primary-soft` về bộ light hoặc dark như cột cuối. Lý do: preset tối trên OS sáng sẽ để `#0E6B5B` trên `#2B2B2B` (dưới 3:1).
- `[auto]` Không thêm token đường kẻ trong suốt (`--rline` của canvas là hex 8 ký tự, test token chỉ nhận `#rrggbb`); đường kẻ khu đọc dùng `--reader-fg` qua opacity modifier Tailwind (trang trí, không cần tương phản).

### 2.4 Cặp tương phản (đã tính, thêm vào `CONTRAST_PAIRS`)

| Cặp | Light | Dark | Ngưỡng |
| --- | --- | --- | --- |
| background / foreground | 15.37 | 15.66 | 4.5 |
| background / muted-foreground | 5.87 | 7.21 | 4.5 |
| card / foreground | 16.92 | 14.43 | 4.5 |
| card / muted-foreground | 6.47 | 6.65 | 4.5 |
| secondary / muted-foreground | 5.37 | 5.86 | 4.5 |
| band / foreground | 13.84 | 14.73 | 4.5 |
| band / muted-foreground | 5.29 | 6.78 | 4.5 |
| primary / primary-foreground | 6.42 | 7.85 | 4.5 |
| background / primary (link) | 5.83 | 8.55 | 4.5 |
| card / primary | 6.42 | 7.88 | 4.5 |
| primary-soft / primary | 5.38 | 6.22 | 4.5 |
| primary-soft / foreground | 14.19 | 11.39 | 4.5 |
| background / destructive | 5.94 | 7.59 | 4.5 |
| card / destructive | 6.54 | 6.99 | 4.5 |
| warning-soft / warning-foreground | 6.11 | 8.66 | 4.5 |
| background / input | 3.09 | 4.04 | 3 |
| card / input | 3.40 | 3.72 | 3 |
| background / ring | 5.83 | 8.55 | 3 |
| cover-N / cover-fg (10 màu) | 5.02–10.64 | (giống) | 4.5 |

Khu đọc, mỗi preset (bg/fg, bg/muted, card/fg, card/muted, bg/nhấn, card/nhấn) đều ≥ 4.5; thấp nhất: `dark-gray` card/muted 4.64, `sepia` card/nhấn 4.85. Thêm cặp `--reader-card` vào bảng test.

**Ràng buộc phát sinh khi kiểm** (canvas vi phạm, code phải sửa):
- `[auto]` Chữ phụ màu `#DCE3DC` trên hero màu tag rớt 4.32:1 ở `--cover-2` → mọi chữ trong hero/dải màu tag dùng `--cover-fg`, phân cấp bằng cỡ và độ đậm, không giảm opacity chữ.
- `[auto]` Nền trắng trong suốt 15–18% (`#FFFFFF26`, `#FFFFFF2E`) dưới chữ trên màu tag rớt tới 3.43:1 (cover-1/2/3) → chip/nút có chữ trên hero dùng **viền** (`--cover-fg` mờ, trang trí) trên nền trong suốt, hoặc nền đặc `--cover-fg` + chữ màu tag (≥ 5.02). Nền trong suốt chỉ dùng cho nút icon (icon cần 3:1, vẫn đạt).

### 2.5 Hình khối, khoảng cách, bóng

- Bo góc: `xs 6` (nhãn trạng thái), `sm 8` (bìa nhỏ ≤ 60px), `md 12` (bìa, ô nhập, nút chọn font), `lg 18` (thẻ, danh sách), `xl 24` (khối, sheet, dialog), `2xl 28` (hero, khối lớn, sheet mobile cạnh trên 26–28), `full` (nút, chip, tab, ô tìm kiếm, thanh tiến độ). Thay `--radius: 0.375rem` bằng thang này trong `@theme` (planner chọn cách khai báo).
- Khoảng cách: 4, 8, 12, 16, 20, 24, 32, 48. Container trang `max-width 1240px`, lề 32px desktop / 16px mobile.
- Bóng: chỉ bìa nổi trong hero (`0 18–22px 40–48px` đen 25–27%) và dialog/panel nổi (`0 24px 60px` đen 25%). Không bóng ở thẻ, nút. **Không gradient.**
- Focus: viền 2px `--ring`, lệch 3px (hoặc giữ `ring-[3px] ring-ring/70` hiện có nếu đạt 3:1 trên nền mới; planner kiểm).

## 3. Font

| Vai trò | Font | Package (đã được user duyệt) |
| --- | --- | --- |
| Giao diện | Plus Jakarta Sans (variable, 400–800) | `@fontsource-variable/plus-jakarta-sans` (mới) |
| Nội dung (mặc định trang đọc, editor, giới thiệu truyện, hero) | Source Serif 4 (variable, có italic) | `@fontsource-variable/source-serif-4` (mới) |
| Tuỳ chọn trang đọc | Literata, Noto Serif | đã có |
| Tuỳ chọn trang đọc (sans) | Plus Jakarta Sans | dùng lại font giao diện |

- Bỏ dependency `@fontsource/be-vietnam-pro` và `@fontsource-variable/inter` (không còn dùng). Không phải dependency mới nên không cần duyệt.
- Preload trong `__root.tsx`: file latin + vietnamese của Plus Jakarta Sans và Source Serif 4 (thay Be Vietnam Pro, Literata). Literata/Noto Serif chỉ tải khi người đọc chọn (unicode-range + chỉ dùng khi chọn, như Noto/Inter hiện nay).
- Thang chữ giao diện: display 40/800, h1 28/800, h2 (tiêu đề mục) 22/800, h3 16/700, body 15/500, small 13/500, caption 11/700. Tiêu đề lớn letter-spacing âm (−0.02 đến −0.04em). Tiêu đề hero: trang chủ 38/800 desktop, trang truyện 48/800 desktop, 24/800 mobile.
- Chữ đọc mặc định 19px / line-height 1.8 / cách đoạn 1.0 (giữ `DEFAULT_READER_SETTINGS`, e2e reset kiểm 19px). `[auto]` Canvas desktop vẽ 20/1.85 nhưng giữ 19/1.8 cho cả hai: một mặc định, e2e không đổi.
- Enum `READER_FONTS`: `['literata','noto-serif','be-vietnam-pro','inter']` → `['source-serif-4','literata','noto-serif','plus-jakarta-sans']`, mặc định `source-serif-4`. `[auto]` Giá trị cũ trong localStorage / `users.preferences.reader` được map khi parse: `be-vietnam-pro`, `inter` → `plus-jakarta-sans` (z.preprocess). Lý do: không làm hỏng cài đặt đã lưu, không cần migration DB (jsonb). Script inline trong `<head>` cũng phải chấp nhận/map giá trị cũ.

## 4. Thành phần dùng chung

- **Nút:** pill, cao 44 (mặc định) / 48–52 (CTA trang) / 58–64 (nút "Chương tiếp" cuối chương). Biến thể: chính (`--primary`), phụ (`--secondary`), ghost, viền (1–1.5px `--foreground`), nguy hiểm (viền + chữ `--destructive`). Disabled opacity 0.6.
- **Chip:** pill 32–36px; đang chọn = nền `--primary`; thường = nền `--card` hoặc `--background` + viền `--border`; chip thể loại có chấm màu `--cover-N` của tag 8px.
- **Tab group (segmented):** nền `--secondary` pill, padding 4, tab chọn nền `--card` chữ đậm. Dùng cho chọn khoảng/kệ/căn lề/độ rộng.
- **Nhãn trạng thái:** cao 24, bo 6, 11/700. Đang ra = `--primary-soft`/`--primary`; Hoàn thành = `--secondary`/`--foreground`; Tạm ngưng, Hẹn giờ = `--warning-soft`/`--warning-foreground`; Có dùng AI = viền `--input`, chữ muted; 18+ = viền + chữ `--destructive`; Nháp = `--secondary`/muted; Bị ẩn = viền `--destructive`.
- **Ô nhập:** cao 46, bo 12, nền `--card`, viền 1px `--input`; lỗi viền 2px `--destructive` + dòng lỗi 12/600. Label 13/700 phía trên, hint 12 muted phía dưới.
- **Thông báo inline:** thành công nền `--primary-soft` + icon check màu nhấn; cảnh báo nền `--warning-soft` chữ `--warning-foreground`; bo 14.
- **Thẻ/khối:** nền `--card`, viền 1px `--border`, bo 18–28. Không bóng.
- **Tiêu đề mục:** icon lucide 18px trong ô 34×34 bo 11 nền `--primary-soft` (trên `--band` thì nền `--card`), tiêu đề h2 22/800, dòng phụ 13 muted; nút "Xem tất cả" pill bên phải.
- **Thanh tiến độ:** cao 6, pill, nền `--secondary`, phần đã đọc `--primary`.
- **Bìa chữ mặc định (`story-cover.tsx`):** nền `--cover-N`, tỉ lệ 2:3, bo 12 (≤ 60px thì 5–8). Chữ `--cover-fg`: tên truyện sans 800 phía trên, bút danh 600 nhỏ phía dưới. **Gáy sách:** dải trái rộng ~5% chiều rộng bìa (12px ở 232px, 8px ở 132px, 4px ở 48px), đen 20% + vạch phải 1px trắng 15%; padding trái tăng tương ứng. **Chữ cái lớn mờ:** ký tự đầu tên truyện, 800, cỡ ≈ 1.05–1.1 × chiều rộng bìa, trắng ~11%, tràn góc dưới phải, `aria-hidden`. Bìa ảnh thật (khi có upload) dùng cùng khung bo góc + gáy `[auto]` (một component, rẻ).
- **Icon:** `lucide-react`, stroke 2, 16–22px.

## 5. Layout chung (header, footer, thanh tab)

**Header desktop** (cao 76, nền `--background`, container 1240): logo (ô 34 bo 10 nền `--primary`, chữ "N" Source Serif 700 màu `--primary-foreground`) + "Novel Hub" 19/800; ô tìm kiếm pill 46px nền `--card` viền `--border` (searchbox tên "Tìm kiếm", placeholder hiện có); nav pill 42px: "Tủ truyện", "Viết truyện" (icon bút); nút tài khoản tròn 42px hiện chữ cái đầu tên, menu như hiện tại (Viết truyện, Tủ truyện, Kiểm duyệt nếu mod, Cài đặt, Đăng xuất). Khách: link "Đăng nhập", "Đăng ký".

**Header mobile:** logo | link icon "Tìm kiếm" (href `/search`) | nút tài khoản hoặc "Đăng nhập"/"Đăng ký". `[auto]` Không vẽ ô tìm kiếm full-width hàng 2 như canvas: giữ một header, giữ e2e link `Tìm kiếm` và không tràn ngang ở 360px với tên dài.

**Thanh tab dưới (mobile < md):** `nav aria-label="Điều hướng chính"`, sticky đáy, cao 72, nền `--card`, viền trên. 5 tab: Trang chủ `/`, Khám phá `/search`, Tủ truyện `/library`, Viết `/write`, Tôi (`/settings` nếu đã đăng nhập, `/sign-in` nếu khách). Tab đang chọn: `aria-current="page"`, icon trong pill 52×28 nền `--primary-soft`, chữ `--primary` 11/700; tab khác muted 11/500.
- Hiện ở mọi trang dùng site layout; **ẩn** ở trang truyện (đã có thanh CTA dính đáy), trang đọc, editor (có thanh riêng). `[auto]` Giữ menu tài khoản ở header song song với tab "Tôi": e2e mobile kiểm menu item, và tab bar chỉ là lối tắt.
- Nội dung trang chừa padding đáy bằng chiều cao thanh tab.

**Footer:** container 1240, 13px muted: "© 2026 Novel Hub" | nav "Thông tin": Điều khoản, Quy định nội dung (như hiện tại).

## 6. Từng màn

### 6.1 Trang chủ `/`

Thứ tự desktop (container 1240, các khu cách nhau 52):
1. **Chip thể loại** (`nav aria-label="Thể loại"`): "Tất cả" (đang chọn) + các tag genre đã có trong loader `genres`, mỗi chip có chấm màu `--cover-N`; link `/tags/{slug}`. Desktop xuống dòng, mobile cuộn ngang. Thay khu "Thể loại" dạng badge cuối trang hiện nay.
2. **Hàng hero + Đọc tiếp** (flex wrap):
   - **Hero "Biên tập chọn"** (`section`, flex 999 1 560px): nền màu `--cover-N` của tag chính truyện, bo 28, padding 32, chữ `--cover-fg`. Trái: nhãn viền "Biên tập chọn" (icon sao) + meta "Kỳ ảo · 28 chương · Đang ra"; h2 38/800; bút danh; giới thiệu Source Serif 18/1.6 (cắt ~3 dòng); nút đặc nền `--cover-fg` chữ `--foreground` "Đọc chương 1 →" + nút viền "Xem truyện". Phải: bìa 196px có bóng.
   - Nguồn: phần tử đầu của danh sách "Truyện mới đáng chú ý" render ở SSR (luôn không 18+); danh sách bên dưới bỏ truyện đó. `[auto]` Một truyện, **không carousel**, không chấm phân trang (YAGNI); Giai đoạn 2 đổi nguồn sang `featured_slots`.
   - **Đọc tiếp** (`aside`, flex 1 1 340px, thẻ bo 28): chỉ cho người đã đăng nhập, tải ở client qua API lịch sử đọc đã có (HTML SSR không chứa, vẫn cache công khai). Tối đa 3 hàng: bìa 54px, tên, "Chương X / Y", thanh tiến độ, ghi chú phải (vd "+2 mới" nếu số chương đã đăng > chương đang đọc, hoặc %). Hàng đầu nền `--primary-soft`. Link "Tủ truyện" ở góc. Khách: không render, hero chiếm cả hàng.
3. **Hàng "Mới cập nhật" + (chỗ trống bảng xếp hạng)**: `[auto]` Bảng xếp hạng thuộc Giai đoạn 2 → không làm; "Mới cập nhật" chiếm cả hàng. Danh sách trong một thẻ (`ul` bo 22, nền `--card`) dạng lưới `auto-fill minmax(330px,1fr)`; mỗi hàng: bìa 60px + tên 15/700 + (dòng chương mới nhất nếu API đã có sẵn, không thêm truy vấn) + meta "● Thể loại · N chữ · thời gian" (+ nhãn "Có dùng AI", "18+"). Tiêu đề mục kèm dòng phụ.
4. **"Truyện mới đáng chú ý"** trên **dải `--band`** full-width (padding 44 trên/dưới): lưới bìa `auto-fill minmax(160px,1fr)` desktop; mobile cuộn ngang bìa 140px. Thẻ lưới: bìa + tên (link) + 1 dòng meta "Thể loại · N ch · N chữ" + nhãn trạng thái. `[auto]` Khu "Đã hoàn thành, đọc một mạch" của canvas **không làm** (cần truy vấn mới); dải `--band` chuyển sang khu này.
5. Footer.

Mobile: header → chip cuộn ngang → hero (margin 16, padding 20, bo 24, bìa nhỏ bên phải, 1 câu giới thiệu, nút "Đọc chương 1") → Đọc tiếp (1 thẻ lớn: bìa, tên, "Chương 12 / 28 · tên chương", tiến độ %, nút "Đọc tiếp", "+N chương mới") → Mới cập nhật (danh sách trong thẻ bo 20) → Truyện mới đáng chú ý (dải band, cuộn ngang) → thanh tab.

SSR không chứa truyện 18+ ở mọi khu (giữ `useMatureAwareList` cho các danh sách; hero lấy từ SSR nên không bao giờ 18+). e2e: `getByRole('link', { name: mature.title })` phải có count 0 khi tắt 18+.

### 6.2 Trang truyện `/stories/{slug}-{publicId}`

**Hero màu tag chính** (`section`, nền `--cover-N` của tag chính, chữ `--cover-fg`), full-width:
- `[auto]` Header site **giữ nguyên** phía trên hero (nền `--background`), không vẽ header trong suốt trên dải màu như canvas. Lý do: một component header; ô tìm kiếm trong suốt trên màu tag rớt tương phản (mục 2.4); mobile không thêm hàng back/chia sẻ/tuỳ chọn (chia sẻ, tuỳ chọn không phải tính năng hiện có).
- Desktop (container 1240, padding 20/32/96): bìa 232px bo 16 có viền `--cover-fg` mờ + bóng | cột phải: breadcrumb "Trang chủ / Thể loại"; chip tag chính (nền `--cover-fg`, chữ màu tag) + chip viền trạng thái; h1 48/800; pill tác giả (avatar chữ cái + tên, link `/authors/{username}`); **hàng số liệu** `dl` có vạch ngăn: chương, chữ, ra chương (`~N/tuần`, đã có `story_page_pace`), cập nhật; nút: "Đọc tiếp chương N" (đặc `--cover-fg`, chỉ khi có tiến độ) hoặc "Đọc từ đầu"/"Đọc chương 1", nút viền "Đọc từ đầu" khi đang đọc dở, nút thêm vào tủ (giữ component `library-button`, tên "Thêm vào tủ" / "Trong tủ: …").
- Mobile (padding 0/16/52): bìa 132px + cột chip/h1 24/800/pill tác giả; hàng 4 số liệu dạng lưới bên dưới.
- Nhãn "Có dùng AI", "18+" hiển thị trong hàng chip.
- `[auto]` "Theo dõi", "Theo dõi tác giả", số người theo dõi, tab "Đánh giá"/"Bình luận", "Chia sẻ" **không làm** (Giai đoạn 2 / không có tính năng).

**Tấm nội dung chồng lên hero:** desktop `main` margin-top −56, flex wrap:
- Cột chính (flex 999 1 600px): thẻ `--card` bo 28 padding 32 gồm: giới thiệu Source Serif 19/1.75 (max 700px); danh sách tag pill; **Mục lục**: tiêu đề "Mục lục · N chương"; hàng ghim "Mới nhất" (nền `--primary-soft`, nhãn đặc "Mới nhất", "Chương N · tên", thời gian); danh sách chương lưới `auto-fill minmax(300px,1fr)` (desktop 2 cột): số chương muted, tên cắt dòng, ngày; hàng đang đọc nền `--primary-soft` + chữ "Đang đọc" màu nhấn (tải ở client từ tiến độ, không vào HTML cache). Giữ cơ chế phân trang/tải thêm hiện có ("Xem thêm N chương" là nút viền).
- `[auto]` Nút đảo thứ tự "Cũ nhất/Mới nhất" và ô "Đến chương…" **không làm** (cần thay đổi API/phân trang; để sau).
- Cột phụ (flex 1 1 300px): thẻ tác giả (avatar 52, tên, `@username · N truyện`, bio 14 muted) và "Cùng tác giả" (bìa 48 + tên + meta) nếu dữ liệu đã có; link "Báo cáo truyện" (giữ `report-button`, tên "Báo cáo").
- Mobile: tấm `main` bo trên 28, margin-top −28, nền `--background`; giới thiệu Source Serif 17/1.7 cắt + "Xem thêm"; tag; mục lục trong thẻ bo 18 (mỗi hàng 2 dòng: tên + ngày). **Thanh CTA dính đáy** nền `--card`: `[auto]` chỉ một nút đặc full-width "Đọc tiếp chương N" / "Đọc chương 1" (nút "Theo dõi" bên trái của canvas để Giai đoạn 2).
- 18+: màn cảnh báo `mature-gate` giữ nguyên hành vi, chỉ đổi style token.

### 6.3 Trang đọc `/stories/…/chapter-{n}`

Nền `--reader-bg` toàn trang, chữ `--reader-fg`.

**Thanh trên (mọi cỡ):** sticky, nền `--reader-bg`, viền dưới mờ; cao 56 mobile / 60 desktop: link icon "Về trang truyện" 44px | 2 dòng: tên truyện 11–12 muted cắt dòng, "Ch. 12 · tên chương" 14–15/700 cắt dòng. Dưới cùng thanh tiến độ đọc 2px (phần đã đọc màu nhấn). Đây là tiến độ đọc, không phải thanh tiến trình chuyển trang.

**Thanh dưới (mobile < md):** `nav aria-label="Điều hướng chương"`, cao 72, 4 ô icon + chữ 11/600: **Mục lục** (mở sheet TOC), **Trước**, **Sau**, **Cài đặt** (mở sheet cài đặt). Giữ accessible name: nút "Mục lục"; link trước/sau tên "Chương trước"/"Chương sau" (chữ hiển thị ngắn "Trước"/"Sau" nằm trong tên đầy đủ bằng `aria-label`); nút cài đặt tên "Cài đặt hiển thị" (hiển thị "Cài đặt"). Chương không có trước/sau: ô disabled.

**Rail phải (desktop ≥ md):** `nav` nổi dọc, right 24, top ~180, nền `--reader-card` bo 20 padding 6, 4 ô 64×60 bo 14 icon + nhãn: Mục lục, Cài đặt, Trước, Sau; ô đang mở panel nền `--primary-soft` chữ màu nhấn; opacity 0.6 khi đang đọc, 1 khi hover/focus.

Ẩn/hiện: cả thanh trên, thanh dưới và rail ẩn khi cuộn xuống, hiện khi cuộn lên hoặc chạm giữa màn hình (spec §8, giữ logic hiện có của `reader-nav`).

**Đầu chương:** nhãn pill "Chương 12" (nền `--reader-card`, 11–12/700 muted); h1 Source Serif 700, 30 mobile / 40 desktop; dòng meta 12–13 muted "2.840 chữ · đăng 1 tháng trước" (mới, dữ liệu `word_count`, `published_at` đã có).

**Nội dung:** HTML đã sanitize như cũ (`.reader-content`, `p[data-pid]`), cột 680px (~68ch "Vừa"), font/cỡ/giãn dòng/cách đoạn theo cài đặt. Không chèn gì giữa nội dung.

**Cuối chương:** khối lời nhắn tác giả (nền `--reader-card` bo 18–20, avatar + "Lời nhắn của {tác giả}", thân Source Serif 16–17) → nút đặc pill 58/64px **"Chương tiếp"** → hàng 3 nút phụ nền `--reader-card`: "Chương trước", (ô Bình luận để Giai đoạn 2), (Theo dõi để Giai đoạn 2). `[auto]` Hàng phụ chỉ còn "Chương trước" (bỏ hàng nếu chương 1) vì 2 ô còn lại là tính năng Giai đoạn 2. Hết chương: "Đã hết chương mới" như hiện tại. Desktop thêm dòng mẹo "dùng phím ← → để chuyển chương" (chuỗi mới).
- `[auto]` Nút cuối chương giữ chữ **"Chương tiếp"** (có thể thêm "Chương N" nếu dữ liệu sẵn, tên vẫn chứa "Chương tiếp"); không hiện tên chương kế (cần dữ liệu mới).

**Cài đặt hiển thị:** mobile = bottom sheet bo trên 26, có tay nắm; desktop = `[auto]` **sheet phải không có lớp phủ tối** (giữ `side="right"` hiện có, overlay trong suốt) thay cho modal giữa màn hình có nền tối như canvas. Lý do: live-browser chốt "panel bên cạnh cột chữ, không che chữ" để xem trước ngay; modal tối che đúng chỗ cần xem. Nền panel `--card` theo theme giao diện. Nội dung:
- Tiêu đề hiển thị giữ **"Cài đặt hiển thị"** (tên dialog e2e), nút "Đóng".
- Màu nền: 6 nút tròn 44–48px "Aa" Source Serif tô màu preset, nhãn dưới (Sáng, Ngà, Sepia, Xanh dịu, Xám tối, Đen); chọn = viền 2px màu nhấn. Giữ cấu trúc radio ẩn + label hiện có (e2e click label theo tên radio).
- Phông chữ: lưới 2×2 (desktop 4 cột) nút bo 12 hiển thị bằng chính font đó: Source Serif, Literata, Noto Serif, Plus Jakarta; chọn = viền 2px nhấn + nền `--primary-soft`.
- Cỡ chữ, Giãn dòng, Cách đoạn: `[auto]` **giữ slider** (`input type=range`, tên "Cỡ chữ"…) thay vì nút −/+ của canvas; style lại: track pill `--secondary`, phần đã chọn màu nhấn, giá trị hiển thị bên phải. Lý do: e2e `getByRole('slider', { name: 'Cỡ chữ' })` + phím mũi tên.
- Độ rộng cột chữ (Hẹp/Vừa/Rộng, chỉ desktop) và Căn lề (Trái/Đều hai bên): tab group pill.
- Nút viền "Khôi phục mặc định".

**Mục lục (TOC sheet):** giữ `side="left"` desktop; mobile bottom sheet gần full màn `[auto]` (đồng bộ với sheet cài đặt). Hàng chương hiện tại nền `--primary-soft`.

Màn cảnh báo 18+ trên trang đọc: giữ hành vi, đổi style.

### 6.4 `/write` (Truyện của tôi)

Chi tiết: `design-261006-write-editor-screens-report.md` mục "/write". Tóm tắt:
- Desktop: header site (nav "Viết truyện" `aria-current`); khối `--band` bo 28: h1 "Truyện của tôi" + hàng 3 số liệu có vạch ngăn (truyện, chương đã đăng, chữ; cộng ở client từ `useMyStories`) + nút đặc "Tạo truyện mới". Lưới thẻ ngang 2 cột `minmax(520px,1fr)`: bìa 112, badge hiển thị (Đã đăng / Nháp / Bị ẩn), chấm màu + tag chính, tên 20px, "Tình trạng · N chương · N chữ", "Sửa lần cuối …", "Quản lý →"; cả thẻ là một link tới `/write/stories/$publicId`.
- Mobile: h1 + pill "Tạo truyện mới" 44px; dải 3 số liệu; danh sách thẻ ngang (bìa 76, chevron); thanh tab, tab "Viết" chọn.
- Trạng thái: rỗng (icon bút trong vòng `--primary-soft` + `writer_empty` + CTA), chưa xác thực (khối `--warning-soft`, nút "Gửi lại mail xác thực", dòng status), chưa đăng nhập (`writer_sign_in_required` + "Đăng nhập"). Hai trạng thái gate không có nút tạo truyện.
- Giữ tên: link "Tạo truyện mới" (mọi viewport), link "Truyện của tôi", nút "Gửi lại mail xác thực"; nút submit "Tạo truyện" ở `/write/stories/new`.

### 6.5 Editor chương `/write/stories/$publicId/chapters/$number`

Chi tiết đầy đủ (6 màn desktop, 8 màn mobile): `design-261006-write-editor-screens-report.md` mục "Editor chương". Tóm tắt:
- Nền trơn `--background` toàn trang, không thẻ, không sidebar. Cột 680px; nội dung Source Serif 20/1.85 (mobile 18); tên chương input không viền serif 36 (mobile 26).
- Header desktop 68px: "← Về trang truyện" | tên truyện nhỏ + "Chương 12" + badge trạng thái (+ pill "Có thay đổi chưa đăng") | trạng thái lưu (chấm + chữ, `role=status`) | số chữ | "Lịch sử" | icon "Chế độ tập trung" | nút đặc "Đăng"/"Cập nhật".
- Toolbar desktop: viên nổi giữa dưới header, 9 nút 40px, 3 nhóm (B I S | H2 H3 trích dẫn ngắt cảnh | hoàn tác làm lại), nút bật `--primary-soft` + `aria-pressed`. Mobile: toolbar dính đáy, phần định dạng cuộn ngang, hoàn tác/làm lại ghim phải.
- Header mobile 64px: back icon, "Chương 12" + badge, dòng 2 trạng thái lưu; icon Lịch sử, icon Tập trung (chỉ icon + `aria-label`), nút "Đăng". Số chữ chuyển xuống dưới tên chương. Dòng tiêu đề cho phép ellipsis.
- Chế độ tập trung: chỉ còn chữ; góc phải trên trạng thái lưu mờ 60% + nút thoát mờ 40%; Esc thoát.
- Đăng/hẹn giờ: desktop dialog 520px, mobile bottom sheet; mô tả số chữ + thanh đo (vạch 300 chữ, trang trí), 2 thẻ radio "Đăng ngay"/"Hẹn giờ", `datetime-local` + hint, Huỷ / "Hẹn giờ đăng" | "Đăng chương" | "Cập nhật". Chương đã đăng không có phần chọn thời điểm.
- Lịch sử phiên bản: desktop sheet phải 560px, mobile sheet đáy gần full; danh sách (thời điểm, số chữ, badge "Đang đăng"); xem trước có "← Danh sách phiên bản", "Khôi phục vào bản nháp", nội dung serif; xác nhận khôi phục dùng dialog hiện có.
- Banner trên tên chương: hẹn giờ (`--warning-soft`, icon đồng hồ, "Cập nhật bản hẹn giờ"/"Huỷ hẹn"), xung đột (nền `--card`, viền `--destructive`, "Tải bản mới nhất" đặc / "Giữ bản của tôi" viền), bản chưa lưu trên máy (`--band`, "Khôi phục"/"Bỏ"), notice sau khi đăng là dòng `role=status` muted.
- Trạng thái lưu: Đã lưu (chấm nhấn), Chưa lưu/Đang lưu… (chấm xám), Lỗi/Xung đột (chữ + chấm `--destructive`).
- Cuối chương: ngắt cảnh là vạch ngắn giữa cột; "Lời nhắn tác giả" ô `--card` bo 20 + label + textarea + hint "Tối đa 1.000 ký tự".
- Giữ đủ chức năng hiện có; không API mới.

### 6.6 Các trang phụ dùng chung layout

Không vẽ riêng trên canvas. `[auto]` Chỉ đổi qua token + component dùng chung + khung trang chuẩn, không thiết kế lại bố cục (YAGNI):
- Khung trang chuẩn: container 1240, h1 28/800, nội dung chính trên thẻ `--card` bo 24 khi là form/khối; thanh tab mobile hiện.
- `/search`: ô tìm (searchbox "Từ khoá"), bộ lọc dạng chip/tab group, kết quả dùng thẻ hàng của "Mới cập nhật".
- `/tags/{slug}`: tiêu đề tag + chip kind; lưới bìa như "Truyện mới đáng chú ý" (dùng `story-grid`), phân trang pill.
- `/authors/{username}`: khối tác giả (avatar, tên, @username, bio) + lưới truyện. `[auto]` Không thêm hero màu (chỉ trang truyện có).
- `/library` (Tủ truyện + Lịch sử): tab group kệ; hàng truyện có thanh tiến độ + "Đọc tiếp chương N".
- `/settings`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`: form trong thẻ `--card` bo 24, rộng ~420–560px, giữa trang.
- `/write/stories/new`, `/write/stories/$publicId` (quản lý truyện: form, bìa, danh sách chương): `[auto]` chưa vẽ trên canvas; áp token + component (ô nhập bo 12, chip tag, nhãn trạng thái, nút pill), giữ bố cục hiện tại.
- `/moderation`: thẻ báo cáo trên `--card`, nhãn trạng thái mới; không đổi luồng.
- `/terms`, `/content-policy`, 404: `static-page` với chữ Source Serif cho thân bài.
- Màn cảnh báo 18+, dialog báo cáo: chỉ đổi style.

## 7. Phần spec phải sửa (`docs/project-spec.md`)

User đã duyệt sửa §2 và §8 cho khớp hướng B (plan overnight, mục "Quyết định user đã duyệt"). Đề xuất nội dung:

**§2 Stack** `[auto]` thêm một hàng "Font": `@fontsource-variable/plus-jakarta-sans` (giao diện), `@fontsource-variable/source-serif-4` (nội dung), `@fontsource-variable/literata`, `@fontsource-variable/noto-serif` (tuỳ chọn trang đọc); self-host, subset tiếng Việt. Lý do: quy tắc "không thêm dependency ngoài mục 2" cần chỗ ghi package font.

**§8 Ngôn ngữ thiết kế:**
- Câu mở: "yên tĩnh, đậm chất sách" → "ấm, như một ứng dụng đọc" (hướng B); giữ "khu đọc gần như vô hình, khu khám phá giống hiệu sách, khu viết tập trung", "không quảng cáo, không banner, không popup" (ghi rõ hero "Biên tập chọn" là khu biên tập, không phải banner quảng cáo).
- Màu: "trắng ngà, xám than + một màu nhấn (chốt khi dựng Design System)" → nền ngà ấm + thẻ trắng, một màu nhấn mòng két; light/dark theo OS; khu đọc 6 preset.
- Chữ: "Literata cho nội dung, Be Vietnam Pro cho giao diện" → "Source Serif 4 cho nội dung, Plus Jakarta Sans cho giao diện".
- "bo góc nhỏ, bóng đổ tối thiểu, không gradient" → "bo góc mềm, nút và chip dạng viên, bóng đổ chỉ ở bìa nổi và lớp nổi, không gradient".
- Bảng tuỳ chỉnh trang đọc, font: "Literata, Noto Serif, Be Vietnam Pro, Inter" → "Source Serif 4 (mặc định), Literata, Noto Serif, Plus Jakarta Sans".
- Thanh điều hướng trang đọc: "Chỉ gồm: tên chương, chương trước/sau, mục lục, cài đặt" → thêm "tên truyện (nhỏ) và thanh tiến độ đọc mảnh"; mobile thanh trên + thanh dưới (Mục lục/Trước/Sau/Cài đặt); desktop thanh trên + rail dọc bên phải; bảng cài đặt desktop là panel bên phải không che cột chữ.
- Khu khám phá: bìa mặc định thêm "gáy sách và chữ cái đầu lớn mờ"; thêm "chip thể loại, hero Biên tập chọn, dải nền tông trơn giữa các khu, mobile có thanh tab dưới 5 mục".
- Trang truyện: "trình bày gọn như một trang sách" → "dải màu tag chính chứa bìa, tên, tác giả, hàng số liệu (số chương, số chữ, tần suất ra chương, lần cập nhật); nội dung trên tấm nền chồng lên dải; mobile có nút đọc dính đáy".
- Khu viết: giữ nguyên ý (nền trơn, trạng thái lưu nhỏ ở góc, chế độ tập trung); bổ sung "/write có dải số liệu nhỏ; dashboard đầy đủ vẫn ở Giai đoạn 2".

**`docs/design-guidelines.md`:** viết lại bảng token, font, nguyên tắc theo mục 2–4 của report; điền link canvas vào ô "Mockup". **`docs/code-standards.md`** nếu nhắc tên font cũ thì sửa.

## 8. Ràng buộc e2e: giữ accessible name

Đổi giao diện nhưng **không đổi** tên/role/chuỗi sau (e2e trong `apps/web/e2e/` đang dùng). Đổi chữ hiển thị ngắn hơn thì dùng `aria-label` sao cho tên vẫn **chứa** chữ hiển thị (WCAG 2.5.3).

- Header/layout: `banner`, `contentinfo` (chứa "Novel Hub"); link "Đăng nhập", "Đăng ký"; link "Tìm kiếm" href `/search` (mobile, trong banner); searchbox "Tìm kiếm" (desktop); nút "Tài khoản: {tên hiển thị}" (đúng chuỗi, kể cả tên dài 360px không tràn ngang); menu item "Viết truyện", "Tủ truyện", "Cài đặt", "Kiểm duyệt", "Đăng xuất"; footer link "Điều khoản" `/terms`, "Quy định nội dung"; 404 heading "Không tìm thấy trang" + link "Về trang chủ".
- Trang chủ/danh mục: link tên truyện (dùng `.first()`), link "Tiên hiệp" (chip thể loại vẫn là link tên tag); region "Truyện", region "Tác giả" (trang tìm kiếm/tác giả); `img` "Bìa truyện {tên}"; truyện 18+ không xuất hiện khi tắt tuỳ chọn.
- Trang truyện: h1 = tên truyện; link "Đọc tiếp chương N"; nút "Thêm vào tủ", "Trong tủ: …", "Tuỳ chọn cho {tên}"; nút "Báo cáo", dialog "Báo cáo chương"; heading "Truyện có nội dung 18+", nút "Hiện nội dung 18+", "Đăng nhập để đọc"; meta robots/canonical/og giữ.
- Trang đọc: link "Về trang truyện"; nút "Mục lục"; link "Chương tiếp" (cuối chương); link `/^Chương \d/` trong TOC; nút + dialog "Cài đặt hiển thị"; radio theo tên preset ("Sepia", "Xám tối", "Hẹp"…) bọc trong `label`; slider "Cỡ chữ"; nút "Khôi phục mặc định"; chữ "Độ rộng cột chữ" ẩn ở mobile; `.reader-content p[data-pid]`; `<link rel="prefetch">` chương sau; `data-reader-theme`, `data-reader-width`, biến `--reader-font-size`, `--reader-column` (60ch hẹp desktop, 68ch mobile) và script inline áp trước khi vẽ.
- Khu viết: link "Truyện của tôi", "Tạo truyện mới"; nút "Tạo truyện", "Thêm chương", "Lưu thay đổi", "Xoá chương", "Xoá chương 1", "Gửi lại mail xác thực"; label "Tên truyện", "Giới thiệu", "Tình trạng", combobox "Thể loại chính", checkbox "Truyện có nội dung 18+"; chữ "Chưa có bìa", "Đã chọn N/10 tag"; heading "Sửa truyện".
- Editor: textbox "Nội dung chương", label "Tên chương", toolbar "Định dạng", nút "Đăng" (exact), "Cập nhật" (exact), "Đăng chương", "Hẹn giờ đăng", "Huỷ hẹn", "Lịch sử", dialog "Lịch sử phiên bản", "Khôi phục vào bản nháp", dialog "Khôi phục phiên bản này?", nút "Khôi phục" (exact), "Chế độ tập trung", "Tải bản mới nhất", "Giữ bản của tôi"; label "Hẹn giờ", "Giờ đăng"; chữ "Đã lưu lúc…", "Chưa lưu", "Xung đột", "Lỗi, thử lại sau Ns", "Có thay đổi chưa đăng", "Đã đăng", "Nháp", "Hẹn giờ", "Hẹn đăng lúc…", "Có bản chưa lưu trên máy này…", "Chương đang được sửa ở nơi khác.", "N chữ"; class `.chapter-editor-content`, `.chapter-preview-content`; `role=status`, `alertdialog`.
- Tủ truyện: menuitemradio "Đã xong", link "Đã xong", menuitem "Bỏ khỏi tủ", nút "Xoá khỏi lịch sử", heading level 3 = tên truyện trong lịch sử.
- Kiểm duyệt: heading "Kiểm duyệt" (level 1), nút "Ẩn chương", heading lý do ("Đạo văn").

e2e **được phép sửa** (thay đổi có chủ đích):
- `layout.spec.ts`: danh sách file font preload → `plus-jakarta-sans-*`, `source-serif-4-*` (latin + vietnamese); test "không tải font tuỳ chọn" đổi từ Noto Serif/Inter sang Literata/Noto Serif.
- Thêm e2e nhẹ cho thanh tab mobile (hiện, `aria-current`, ẩn ở trang đọc) và không tràn ngang 360px ở trang truyện/trang chủ mới.
- Unit test: `tokens.test.ts` (giá trị + cặp tương phản mục 2.4), `story-cover.test.tsx` (gáy, chữ cái mờ `aria-hidden`), schema reader (map font cũ).

## 9. Những gì KHÔNG làm

- Không đổi API, schema DB, migration, route, URL. (Ngoại lệ duy nhất ở dữ liệu: enum font trong Zod + map giá trị cũ, không đụng DB.)
- Không làm tính năng Giai đoạn 2 dù canvas có vẽ chỗ: bảng xếp hạng (tab Ngày/Tuần/Tháng, nav "Xếp hạng", trend ↑/↓), theo dõi (nút, số người theo dõi, "Theo dõi tác giả"), thông báo (chuông), bình luận (nút "Bình luận 12", tab), đánh giá (tab), `featured_slots`, dashboard tác giả đầy đủ.
- Không làm: khu "Đã hoàn thành, đọc một mạch"; carousel hero và chấm phân trang; nút đảo thứ tự mục lục, ô "Đến chương…"; nút chia sẻ, nút "Thêm tuỳ chọn"; header trong suốt trên hero; ô tìm kiếm full-width trên header mobile; nền chấm bi; hoạ tiết bìa theo thể loại; gradient; nút chuyển sáng/tối; thụt đầu dòng kiểu sách; thanh tiến trình chuyển trang; đọc thử chương 1 trên trang truyện; lịch ra chương theo thứ; huy hiệu tác giả.
- Không thiết kế lại bố cục các trang phụ (mục 6.6), chỉ áp token + component.
- Không thêm dependency ngoài 2 package font đã duyệt; không đổi config Docker/env/CI/Cloudflare.
- Không thay HTML cache công khai bằng nội dung cá nhân: "Đọc tiếp", "Đang đọc", tiến độ, 18+ bổ sung đều tải ở client.

## 10. Gợi ý chia phase cho `/ak:plan`

Planner quyết định cuối; thứ tự gợi ý (mỗi phase gate xanh được):
1. Tokens + font: `tokens.css`, `token-values.ts` (+ token mới, cặp tương phản, `--reader-card`, ghi đè nhấn theo preset), `app.css` (`@theme`, thang bo góc, font), `__root.tsx` preload, `package.json` (thêm 2 font, bỏ 2 font cũ), schema `READER_FONTS` + map giá trị cũ + script inline, sửa `layout.spec.ts`.
2. Component dùng chung: `ui/button`, `badge`, `input`, `textarea`, `select`, `checkbox`, `dialog`, `sheet`, `dropdown-menu` (pill, bo góc, bỏ bóng thừa), `story-cover` (gáy + chữ cái mờ), `story-card` (dạng hàng + dạng lưới), tiêu đề mục.
3. Layout: header desktop/mobile, footer, thanh tab mobile (+ e2e).
4. Trang chủ.
5. Trang truyện (hero màu tag, số liệu, mục lục, CTA dính đáy).
6. Trang đọc (thanh trên, thanh dưới, rail, đầu chương, cuối chương, sheet cài đặt, TOC).
7. `/write` + editor.
8. Trang phụ (mục 6.6) + cập nhật spec §2/§8, `docs/design-guidelines.md`.

## Validation Log

- [auto] Hero trang chủ một truyện, không carousel: YAGNI; nguồn tạm là truyện mới đáng chú ý đầu tiên ở SSR nên không bao giờ 18+.
- [auto] Bỏ khu "Đã hoàn thành, đọc một mạch": cần truy vấn core mới; chuyển dải `--band` sang "Truyện mới đáng chú ý".
- [auto] Không làm phần Giai đoạn 2 canvas đã vẽ chỗ (xếp hạng, theo dõi, chuông, bình luận, đánh giá): ngoài phạm vi redesign, spec bắt làm tuần tự.
- [auto] Header site giữ nguyên trên trang truyện, không trong suốt trên dải màu: một component; tránh ô tìm kiếm trong suốt rớt tương phản.
- [auto] Chữ trên hero/dải màu tag chỉ dùng `--cover-fg`; chip có chữ dùng viền hoặc nền đặc `--cover-fg`: `#DCE3DC` và nền trắng 15–18% rớt dưới 4.5:1 ở một số màu bìa.
- [auto] `--cover-fg` đổi sang `#F6F1E7` theo canvas: vẫn ≥ 5.02:1 với mọi màu bìa.
- [auto] Mỗi preset đọc ghi đè bộ màu nhấn light/dark: tránh nhấn sáng trên nền tối khi OS sáng.
- [auto] Không thêm token đường kẻ trong suốt; dùng opacity modifier: test token chỉ nhận `#rrggbb`.
- [auto] Cỡ chữ/giãn dòng/cách đoạn giữ slider, không dùng nút −/+ của canvas: e2e dùng `slider "Cỡ chữ"` + phím mũi tên.
- [auto] Bảng cài đặt desktop là sheet phải không phủ tối thay cho modal giữa màn hình của canvas: khớp quyết định "panel bên cạnh, không che chữ" từ live-browser; giữ component hiện có.
- [auto] Tên dialog/nút cài đặt giữ "Cài đặt hiển thị" (canvas ghi "Hiển thị"/"Cài đặt"): e2e.
- [auto] Chữ đọc mặc định giữ 19px/1.8 cho mọi cỡ màn hình: một mặc định; e2e reset kiểm 19px.
- [auto] Enum font đổi sang `source-serif-4`, `literata`, `noto-serif`, `plus-jakarta-sans` và map `be-vietnam-pro`/`inter` cũ sang `plus-jakarta-sans`: không làm hỏng cài đặt đã lưu, không cần migration.
- [auto] Header mobile không có ô tìm kiếm full-width: giữ link icon "Tìm kiếm" cho e2e và không tràn ngang ở 360px.
- [auto] Thanh tab mobile ẩn ở trang truyện, trang đọc, editor; giữ menu tài khoản song song tab "Tôi": các trang này có thanh riêng; e2e mobile kiểm menu tài khoản.
- [auto] Cuối chương chỉ còn "Chương tiếp" + "Chương trước"; nút giữ chữ "Chương tiếp": hai ô còn lại là Giai đoạn 2; e2e tìm link "Chương tiếp".
- [auto] Trang truyện mobile: thanh dính đáy chỉ một nút đọc, không nút "Theo dõi": theo dõi thuộc Giai đoạn 2.
- [auto] Không làm nút đảo thứ tự và ô "Đến chương…" ở mục lục: cần đổi API/phân trang.
- [auto] Bìa ảnh thật cũng có gáy: một component cho mọi bìa, chi phí nhỏ.
- [auto] Trang phụ chỉ áp token + component, không vẽ lại; trang quản lý truyện `/write/stories/$publicId` giữ bố cục: chưa có trên canvas, YAGNI.
- [auto] Thêm hàng "Font" vào spec §2: để 2 package font mới có chỗ ghi trong danh sách stack được phép.
- [auto] Dải số liệu ở `/write` giữ như canvas (trả lời câu hỏi mở của report editor): rẻ, cộng ở client, không API.
- [auto] Nút "Đăng" bị khoá khi số chữ ngoài 300–20.000: không thêm dòng gợi ý lý do (câu hỏi mở của report editor không có phương án Recommended → chọn đơn giản nhất, giữ như hiện tại).
- [auto] Pill tạo truyện ở `/write` mobile giữ chữ "Tạo truyện mới" (canvas ghi "Tạo truyện"): một chuỗi, tên link khớp e2e ở mọi viewport.

## Câu hỏi mở (cho user khi dậy)

- Duyệt các quyết định `[auto]` ở trên, nhất là: bảng cài đặt desktop dạng sheet phải (canvas vẽ modal giữa), slider thay nút −/+, header không trong suốt trên trang truyện, bỏ khu "Đã hoàn thành".
- Có cần vẽ trang quản lý truyện `/write/stories/$publicId` và các trang phụ trên canvas trước khi cook không? (Hiện: chỉ áp token.)
- Hero "Biên tập chọn" trước Giai đoạn 2 lấy truyện mới đáng chú ý đầu tiên: chấp nhận được không, hay ẩn hero tới khi có `featured_slots`?
