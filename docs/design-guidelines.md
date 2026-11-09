# Hướng dẫn thiết kế

Bổ sung cho mục 8 của `docs/project-spec.md`. Hướng **B+ "ứng dụng đọc ấm"**. Khi mockup lệch với repo, **`apps/web/src/styles/tokens.css` là chuẩn**.

## Nguồn

| Thứ | Link |
| --- | --- |
| Design System | chưa có (bảng token ở canvas trang "Vòng 2", mục `B-tokens`) |
| Design trang chủ, trang truyện, header, footer (chốt 2026-11-09) | artifact https://claude.ai/artifact/6BT5brLmxY4NmZp2wdpH5B, board Main, Story, Mobile |
| Mockup các trang còn lại | canvas https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo, trang "Vòng 3 · B+ đã chốt" |
| Tokens (chuẩn) | `apps/web/src/styles/tokens.css` |
| Ánh xạ sang Tailwind, bo góc | `apps/web/src/styles/app.css` (`@theme inline`) |
| Khu đọc | `apps/web/src/styles/reader.css` |
| Bảng hằng để test | `apps/web/src/styles/token-values.ts`, `token-contrast-pairs.ts` |

Canvas dùng tên ngắn (`--bg`, `--surface`, `--s2`, `--accent`, `--soft`, ...); `--accent` của canvas là `--primary` trong code.

## Nguyên tắc (spec mục 8)

- "Ấm, như một ứng dụng đọc", mobile-first. Khu đọc gần như vô hình, khu khám phá giống hiệu sách, khu viết tập trung.
- Nền ngà ấm, nội dung trên thẻ trắng. Thứ bậc đến từ bậc nền (`--background` → `--band` → `--card`), không từ bóng đổ.
- **Một** màu nhấn mòng két (`--primary`), chỉ cho hành động chính, mục đang chọn, tiến độ, focus. Ngoại lệ: một từ nhấn trong tiêu đề khu trang chủ ("đọc", "kể"), logo (ô dấu trang và chữ "Say"), số thứ hạng 1-3.
- Bo góc mềm; nút, chip, tab dạng viên. Vùng chạm ≥ 44px. Không gradient; bìa làm mờ chỉ là `<img>` + `filter` + lớp phủ trơn.
- Không quảng cáo, banner, popup; hero trang chủ là truyện nổi bật (nhãn "Mới đáng chú ý"), không phải banner. Không thanh tiến trình chuyển trang; không hiển thị ID nội bộ.
- Mọi chuỗi hiển thị qua Paraglide (`packages/shared/messages/vi.json`), không hardcode.
- Hai theme site **Ngà** (sáng, mặc định) và **Tối**, người dùng tự chọn (xem "Theme site"). Animation tắt khi `prefers-reduced-motion: reduce`.
- Lớp trang trí giữ: gáy sách trên bìa, bìa làm mờ sau hero trang chủ, trang truyện và ô thể loại, vạch kệ dưới bìa, dải `--band`, hàng số liệu. Tiêu đề khu ở trang chủ và trang truyện không có ô icon. Không dùng: nền chấm bi, hoạ tiết bìa theo thể loại.

## Token màu

Tên theo quy ước shadcn/ui. **"Màu nhấn" = `--primary`**; `--accent` chỉ là nền hover của component.

| Token | Ngà | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--background` | `#F8F3E8` | `#101312` | nền trang, nền editor |
| `--foreground` (+ `--card-`, `--popover-`, `--secondary-`, `--accent-foreground`) | `#2B2722` | `#E8ECE9` | chữ chính |
| `--card`, `--popover` | `#FFFFFF` | `#181C1A` | thẻ, sheet, menu, dialog, ô nhập, thanh tab (tách khỏi nền trang) |
| `--secondary`, `--muted`, `--accent` | `#EFE8DA` | `#222724` | nút phụ, nền tab group, thanh tiến độ trống, nền hover |
| `--muted-foreground` | `#675F55` | `#9AA39E` | chữ phụ, meta, gợi ý dưới ô nhập |
| `--border` | `#E6DECE` | `#2C322F` | viền thẻ, đường kẻ trang trí (không yêu cầu tương phản) |
| `--input` | `#8C8377` | `#6E7771` | viền ô nhập (đạt 3:1) |
| `--primary`, `--ring` | `#0E6B5B` | `#4FC2A8` | màu nhấn, link, focus ring |
| `--primary-foreground` | `#FFFFFF` | `#0B1F1A` | chữ trên màu nhấn |
| `--primary-soft` | `#DDEFEA` | `#17332C` | nền nhấn nhẹ: mục đang chọn, pill tab đang chọn, badge "Đang ra"/"Đã đăng", ô icon tiêu đề mục |
| `--band` | `#EFE6D4` | `#161A18` | dải nền tông trơn sau khối mời viết trang chủ, nền nhóm tab và đường kẻ dòng ở "Đang được đọc nhiều", khối số liệu `/write`, banner bản local trong editor |
| `--shelf-line` | `#D8CEB9` | `#3A413D` | vạch kệ dưới bìa (`StoryShelfCard`), trang trí |
| `--hero-base` | `#241D18` | `#241D18` | nền dưới bìa mờ, thấy khi ảnh chưa tải hoặc lỗi |
| `--hero-ink` | `#2B2722` | `#2B2722` | chữ của nút nền `--cover-fg` trên bìa mờ (hero gán vào `--story-tint`) |
| `--hero-scrim` | `rgb(22 17 13 / 0.64)` | `rgb(22 17 13 / 0.64)` | lớp phủ trơn trên bìa mờ, màu duy nhất có alpha; chữ trên nó luôn là `--cover-fg`, đạt 4.5:1 cả khi bìa trắng tinh (`tokens.test.ts`) |
| `--destructive` | `#B3261E` | `#F2877C` | lỗi, xoá, nhãn 18+, bị ẩn |
| `--warning-soft` / `--warning-foreground` | `#FFF1DC` / `#8A4B00` | `#2E2312` / `#F2B866` | nhãn Tạm ngưng, Hẹn giờ, cảnh báo, tag cảnh báo (`TagChip kind="warning"`, badge tag ở màn 18+ và trang tag kind cảnh báo) |

Utility Tailwind tương ứng: `bg-background`, `bg-band`, `bg-primary-soft`, `text-warning-foreground`, `border-input`, ... (ánh xạ trong `@theme inline` của `app.css`).

Nền ô thể loại dùng lại `--cover-N`, không có token riêng (`components/home/home-genre-tiles.tsx`): Ngôn tình `--cover-7`, Tiên hiệp `--cover-4`, Kinh dị `--cover-9`, Huyền huyễn `--cover-5`. Màu này nằm dưới mọi ô, là nền giữ tương phản lúc bìa mờ chưa tải và là toàn bộ nền khi thể loại chưa có truyện có bìa.

## Theme site

- Lựa chọn 3 giá trị `system | ivory | dark` (`SITE_THEME_CHOICES`, `packages/shared`), mặc định `system`: máy sáng → Ngà, máy tối → Tối.
- Áp bằng `data-theme` trên `<html>` (`ivory` | `dark`; `system` = không có thuộc tính). `BOOT_SCRIPT` (inline, đầu `<head>`) đọc localStorage `nh:theme` (`{choice, updatedAt}`) và gắn thuộc tính trước khi vẽ; HTML SSR không bao giờ có `data-theme`, không phụ thuộc cookie, vẫn cache công khai.
- Người đã đăng nhập đồng bộ thêm vào `users.preferences.siteTheme`; bản đổi sau cùng thắng (`updatedAt`), như cài đặt trang đọc. `SiteThemeSync` (root) đối chiếu một lần khi tài khoản đã tải; thiết bị mới đổi theme sau hydrate một lần (chấp nhận, cookie sẽ phá cache).
- `tokens.css`: `:root` = Ngà; Tối khai báo ở `:root:where([data-theme='dark'])` và trong `@media (prefers-color-scheme: dark)` ở `:root:where(:not([data-theme='ivory']))`. Luôn dùng `:root:where(...)` để giữ specificity 0,1,0: preset đọc (`[data-reader-theme=…]`, khai báo sau) mới thắng `--reader-*`.
- `dark:` của Tailwind theo theme thật (`@custom-variant dark` trong `app.css`), không chỉ theo hệ điều hành.
- Chỗ chọn: công tắc ở footer (mọi trang có `SiteLayout`, nhóm radio dạng segment), menu tài khoản ở header (đã đăng nhập, và khách dưới `md`; nhãn "Giao diện" + 3 `menuitemradio`) và mục "Giao diện" cuối `/settings` (cả khách, nhóm radio dạng segment). Trang đọc và editor không có picker theme site (trang đọc dùng preset riêng).

## Khu đọc

Chọn preset bằng thuộc tính `data-reader-theme` trên `<html>`; không có thuộc tính thì theo theme site: `ivory` (Ngà) hoặc `dark-gray` (Tối). "Khôi phục mặc định" bỏ thuộc tính. Danh sách preset ở `READER_THEMES` (`packages/shared/src/schemas/reader.ts`). Không có bảng chọn màu tự do.

| Preset | Tên hiển thị | `--reader-bg` | `--reader-fg` | `--reader-muted` | `--reader-card` | Nhấn |
| --- | --- | --- | --- | --- | --- | --- |
| `white` | Sáng | `#FFFFFF` | `#1F1F1F` | `#5F5F5F` | `#F4F4F2` | light |
| `ivory` | Ngà | `#FBF6EC` | `#2B2722` | `#675F55` | `#F3ECDD` | light |
| `sepia` | Sepia | `#F4ECD8` | `#3B2F22` | `#6A5A47` | `#EADFC6` | light |
| `soft-green` | Xanh dịu | `#E6EFE4` | `#22302A` | `#4E5F55` | `#D9E5D6` | light |
| `dark-gray` | Xám tối | `#2B2B2B` | `#D6D3CE` | `#A3A09B` | `#363636` | dark |
| `oled-black` | Đen OLED | `#000000` | `#C9C5BE` | `#8F8B85` | `#141414` | dark |

- `--reader-card`: nền khối lời nhắn tác giả, rail desktop, nút phụ cuối chương. Có cả ở trạng thái không chọn preset (khai báo trên `:root` và trong các khối Tối).
- Nhấn theo preset: `--reader-primary`, `--reader-primary-foreground`, `--reader-primary-soft` = bộ light (`#0E6B5B`) hoặc dark (`#4FC2A8`) như cột "Nhấn". Chỉ `.reader-page` ghi đè `--primary*`/`--ring` bằng các biến này (`reader.css`); preset **không** ghi đè `--primary` trên `<html>`, vì thuộc tính nằm ở mọi trang.
- Màn cảnh báo 18+ nằm **ngoài** `.reader-page`, dùng token site. Sheet mục lục/cài đặt portal ra ngoài, cũng dùng token site.
- Đường kẻ khu đọc dùng `--reader-fg` qua opacity modifier (`border-reader-fg/10`), trang trí.
- Mặc định chữ đọc: 19px, line-height 1.8, cách đoạn 1em, cột 68ch (khai báo trên `:root` trong `reader.css`, khớp `DEFAULT_READER_SETTINGS`). Độ rộng cột hẹp 60ch / rộng 75ch chỉ áp từ `lg`.

## Font

Self-host, import trong `app.css`, không gọi Google Fonts: font giao diện qua `@fontsource/be-vietnam-pro` (mỗi weight một file CSS), font đọc qua `@fontsource-variable/*`.

| Token | Font | Utility | Dùng cho |
| --- | --- | --- | --- |
| `--font-ui` | Be Vietnam Pro (không variable, weight 400, 500, 600, 700, 800) | `font-sans` (mặc định của `body`) | giao diện, mọi tiêu đề UI. Font mới được user tạm chấp nhận (2026-11-09), tên font chỉ khai báo ở token này để sau dễ đổi |
| `--font-content` | Source Serif 4 (variable, thường + nghiêng) | `font-serif` | chỉ nội dung chương: trang đọc (mặc định), tên chương ở trang đọc, editor (cả ô tên chương), xem trước revision, lời nhắn tác giả, trích đoạn trong bình luận theo đoạn |
| `--font-reader-literata` | Literata (variable) | qua `var()` | lựa chọn ở trang đọc |
| `--font-reader-noto-serif` | Noto Serif (variable) | qua `var()` | lựa chọn ở trang đọc |

- `__root.tsx` preload đúng 4 file giao diện `be-vietnam-pro-{latin,vietnamese}-{400,700}-normal.woff2` (hai weight mang phần lớn chữ; weight khác sẽ tranh băng thông với ảnh LCP). Route đọc `stories.$storyKey.chapter-{$number}.tsx` preload thêm 2 file `source-serif-4-{latin,vietnamese}-wght-normal.woff2`; chỉ route này hiện chữ truyện ở lần vẽ đầu.
- Literata, Noto Serif chỉ tải khi người đọc chọn (`unicode-range` + chỉ dùng khi `data-reader-font` trỏ tới). Nhãn nút chọn font render bằng font giao diện, để mở bảng cài đặt không kéo cả 4 font.
- Lựa chọn font giao diện ở trang đọc có nhãn "Be Vietnam Pro" (`reader_settings_font_plus_jakarta_sans`) và dùng lại `--font-ui`. Khóa lưu vẫn là `plus-jakarta-sans` để khỏi đổi dữ liệu trong localStorage và `users.preferences`. Giá trị cũ `be-vietnam-pro`, `inter` được map sang khóa đó (`LEGACY_READER_FONTS` trong `packages/shared/src/schemas/reader.ts`, và selector tương ứng trong `reader.css`).
- Serif chỉ cho nội dung chương (trang đọc, tên chương ở trang đọc, editor, xem trước revision, lời nhắn tác giả, trích đoạn trong bình luận theo đoạn). Mọi văn bản khác dùng font giao diện, kể cả giới thiệu truyện, trang điều khoản/quy định, mô tả cuộc thi, số thứ hạng, logo, mẫu "Aa" ở nhóm màu nền trong cài đặt đọc.

## Chữ

Chỉ ghi các cỡ đã có trong code (không có token `--text-*`):

| Chỗ | Cỡ / độ đậm | Nơi khai báo |
| --- | --- | --- |
| `body` | 15px / 400 | `app.css` (`@layer base`) |
| Thanh và nút trang đọc (`.reader-page`) | weight 500 | `reader.css` |
| Tiêu đề trang (`PageTitle`, h1) | 28px / 800 | `components/page-shell.tsx` |
| Tiêu đề mục có icon (`SectionHeading`, h2), các trang ngoài trang chủ và trang truyện | 22px / 800 | `components/section-heading.tsx` |
| Tiêu đề mục trang truyện (`SectionHeading` không icon) | 20px mobile, 26px từ `md` / 700 | `components/section-heading.tsx` |
| Tiêu đề hero trang chủ | 27px mobile, `clamp(36px, 4.6vw, 62px)` từ `md` / 700 | `components/home/home-featured-hero.tsx` |
| Tên truyện ở hero trang truyện | 28px mobile, `clamp(40px, 5vw, 66px)` từ `md` / 700 | `components/story/story-hero.tsx` |
| Tiêu đề khu trang chủ (ô thể loại, kệ) | 29px mobile, 36px từ `md` / 700 | `components/home/home-genre-tiles.tsx`, `StoryShelfHeading` trong `components/story/story-shelf.tsx` |
| "Đang được đọc nhiều" | 25px mobile, 28px từ `md` / 700 | `components/home/home-rankings.tsx` |
| "Có truyện muốn kể?" | `clamp(34px, 4vw, 48px)` / 700 | `components/home/home-write-band.tsx` |
| Tên thể loại trên ô | 27px mobile, 36px từ `md` / 700 | `components/home/home-genre-tiles.tsx` |
| Tên truyện trên kệ / dòng meta | 15px / 700, dưới `sm` 14px; 13px, dưới `sm` 12px; `compact` 13px / 700 | `components/story/story-shelf-card.tsx` |
| Nhãn trạng thái | 11px / 700 | `components/ui/badge.tsx` |

Nội dung chương (`.reader-column`, editor, xem trước revision) đặt `font-weight: 400`. Ngắt cảnh (`<hr>`) hiển thị `* * *`.

## Hình khối, bóng, focus

- Bo góc (`@theme inline` trong `app.css`): `xs 6` (nhãn trạng thái), `sm 8` (bìa nhỏ), `md 12` (bìa, ô nhập), `lg 18` (thẻ, danh sách), `xl 24` (khối, dialog), `2xl 28` (khối lớn); sheet bo cạnh trên 28px dưới `lg`, không bo khi là panel từ `lg`, `full` (nút, chip, tab, ô tìm kiếm, thanh tiến độ).
- Bóng: chỉ bìa nổi và dialog (`0 24px 60px` đen 25%). Bìa hero từ `md`: trên bìa mờ, trang chủ `0 26px 54px` đen 45%, trang truyện `0 24px 50px` đen 45%; truyện chưa có bìa `0 20px 44px` đen 26%. Bìa hero dưới `md`: `0 12px 24px` đen 40%. Bìa kệ: `0 8px 14px -6px rgba(43,39,34,.45)`, bản `compact` `0 6px 10px -5px` cùng màu. Bìa nhỏ trên ô thể loại: `0 10px 20px` đen 40%. Ngoài ra có `shadow-xs` cho mục đang chọn trong tab group và các nhóm lựa chọn dạng segment (cài đặt đọc, công tắc giao diện ở footer và `/settings`), `shadow-lg` cho hai lớp nổi của trang đọc (nút bình luận theo đoạn, thanh nghe truyện). Thẻ, nút thường, sheet không bóng.
- Focus: `focus-visible:ring-[3px] ring-ring` (không alpha). Nút trên bìa mờ dùng kiểu "Trên bìa mờ" bên dưới.
- Container trang: `max-width 1240px`, lề 16px mobile / 32px desktop.

## Bìa

Truyện chưa có bìa hiện bìa chữ (`components/story-cover.tsx`): HTML/CSS thuần, tỷ lệ 2:3, bo `md`, `role="img"` với tên truyện làm nhãn.

- Chữ màu `--cover-fg`: tên truyện sans 800 phía trên (cỡ theo nấc độ dài tên, `coverTitleClass` trong `lib/cover-palette.ts`, đơn vị `cqw`), đường kẻ mảnh, bút danh 600 nhỏ phía dưới.
- **Gáy sách:** dải trái ~5% bề rộng bìa, đen 20% + vạch phải trắng 15%, `aria-hidden`; có cả trên bìa ảnh.
- **Chữ cái đầu lớn mờ:** ký tự đầu tên truyện, 800, cỡ ≈ 105% bề rộng bìa, trắng ~11%, tràn góc dưới phải, `aria-hidden`.
- Có bìa ảnh thì dùng `<img>` `srcset` 300w/600w, `width=600 height=900`, cùng khung; ảnh lỗi tải thì rơi về bìa chữ.
- Thẻ truyện (`components/story/story-card.tsx`) có đúng **một** `<a>` mỗi thẻ; bìa không phải link riêng.

| Token | Màu | Tên gợi nhớ |
| --- | --- | --- |
| `--cover-0` | `#8A2F3C` | đỏ son |
| `--cover-1` | `#7A4E2D` | nâu đất |
| `--cover-2` | `#7D6420` | vàng đồng |
| `--cover-3` | `#4F5D2F` | rêu |
| `--cover-4` | `#2F5D50` | lục bảo |
| `--cover-5` | `#2E5266` | lam khói |
| `--cover-6` | `#2C3E66` | chàm |
| `--cover-7` | `#A8431F` | đất nung |
| `--cover-8` | `#5C5346` | nâu đá |
| `--cover-9` | `#3A3632` | xám than |
| `--cover-fg` | `#F6F1E7` | chữ trên bìa |

- Dùng chung cho Ngà và Tối (bìa là "vật thể"). Mọi màu đạt ≥ 5:1 với `--cover-fg` (thấp nhất 5.02 trên `--cover-2`).
- Chọn màu: FNV-1a 32-bit trên slug tag chính `% COVER_PALETTE_SIZE` (`lib/cover-palette.ts`). Cùng màu đó dùng cho chấm màu của `TagChip`.
- Thêm màu: thêm `--cover-N` (N liên tiếp) vào `tokens.css` và `token-values.ts`, tăng `COVER_PALETTE_SIZE`. Đổi số màu làm đổi màu của các tag hiện có.
- Chữ trên bìa mờ và trên ô thể loại chỉ dùng `--cover-fg`, phân cấp bằng cỡ và độ đậm, không giảm opacity chữ.

## Quy tắc tương phản

- Mọi cặp chữ/nền đạt WCAG AA **4.5:1**; viền ô nhập và focus ring đạt **3:1** (WCAG 1.4.11).
- Danh sách cặp: `CONTRAST_PAIRS`, `READER_CONTRAST_PAIRS`, `COVER_CONTRAST_PAIRS` (`styles/token-contrast-pairs.ts`). `pnpm test` kiểm mọi cặp ở Ngà, Tối và 6 preset, đồng thời đối chiếu từng giá trị có nguyên văn trong `tokens.css`.
- Đổi hoặc thêm màu: sửa **cả** `tokens.css` và `token-values.ts` (mỗi giá trị một dòng `--tên: #hex;`; riêng `--hero-scrim` là `rgb(...)`, sửa cả `HERO_SCRIM`), thêm cặp nếu là cặp chữ/nền mới. Hàm `contrastRatio()` ở `apps/web/src/lib/contrast.ts`.

## Component

- shadcn/ui (style `new-york`) ở `apps/web/src/components/ui/`, chỉ thêm component cần dùng. Hiện có: button, input, textarea, label, checkbox, select, dialog, sheet, dropdown-menu, badge.
- **Button** (`ui/button.tsx`): pill, cao 44 (`default`) / 48 (`lg`); nút "Chương tiếp" cuối chương cao 64. Biến thể: `default` (nhấn), `secondary`, `ghost`, `outline` (viền 1.5px `--foreground`), `destructive` (viền + chữ `--destructive`, không nền đỏ đặc), `link`. Disabled opacity 0.6.
- **Badge** (`ui/badge.tsx`): cao 24, bo `xs`, 11/700. Biến thể thêm `muted` (nháp) và `warning` (Tạm ngưng, Hẹn giờ, tag cảnh báo).
- **`status-badges.tsx`**: một kiểu cho mỗi trạng thái toàn site: `StoryStatusBadge`, `StoryVisibilityBadge`, `ChapterStatusBadge`, `StoryFlagBadges` (Có dùng AI = viền `--input`; 18+ = viền + chữ `--destructive`). Không tự chọn variant ở từng trang.
- **`TagChip`** (`tag-chip.tsx`): link pill tới trang tag, chấm màu bìa của tag 8px; tên truy cập chỉ là tên tag. `kind="warning"`: nền `--warning-soft`, chữ `--warning-foreground`, viền `--warning-foreground` 30%, icon `TriangleAlert` 14px thay chấm màu; luôn có `data-kind` khi truyền kind.
- **`SiteLogo`** (`site-logo.tsx`): dấu trang SVG 32px, 36px từ `md` + wordmark hai tông ("Say" 700 màu `--primary`, "Novel" 500). `aria-hidden`; link bọc ngoài mang tên truy cập.
- **`CoverBackdrop`** (`cover-backdrop.tsx`): bìa cỡ 300 làm mờ sau một khu: `<img>` absolute cover, `object-position: center 68%`, `blur` 28px (36px từ `md`), `saturate(.85)`, `scale(1.18)`, phủ `--hero-scrim`. Trang trí (`aria-hidden`); cha cần `relative isolate overflow-hidden` và tự đặt màu nền dự phòng. `eager` cho hero đầu trang. Không animate, không `will-change`.
- **`StoryShelfCard`** (`story/story-shelf-card.tsx`): bìa đứng trên vạch `--shelf-line`, tên truyện, một dòng meta (`StoryMetaLine`: chữ bị cắt, nhãn AI và 18+ thì không). Đúng một `<a>` phủ cả thẻ. `compact` chỉ có tên, cho sidebar hẹp.
- **`StoryShelf`, `StoryShelfHeading`** (`story/story-shelf.tsx`): lưới không có khoảng cách cột để vạch kệ nối liền, cột tối thiểu 165px; dưới `sm` là một hàng cuộn ngang. `limit` cắt danh sách như nhau ở server và client; `mobileLimit` ẩn bằng CSS để HTML không đổi theo thiết bị. `StoryShelfHeading` là tiêu đề khu + link "Xem thêm".
- **`SectionHeading`** (`section-heading.tsx`): có `icon`: ô icon 34×34 nền `--primary-soft` (trên `--band` thì `onBand` → nền `--card`) + h2 22/800 + dòng phụ, dùng ở trang tác giả, Khám phá, kết quả cuộc thi. Không `icon`: h2 20px, 26px từ `md` / 700 ở trang truyện (giới thiệu, thông báo, mục lục, đánh giá, thảo luận, truyện liên quan). Trang chủ chỉ dùng ở nhánh cuộc thi của khối mời viết (đang tắt, xem `CONTESTS_ENABLED`). Vùng bọc dùng `aria-labelledby={id}`.
- **`PageShell` / `PageTitle`** (`page-shell.tsx`): cột nội dung trang phụ (1240px hoặc `narrow` 560px) và h1 duy nhất của trang; `pageCardClass` cho khối form/chữ chính.
- **Tab group:** `segmented-link-classes.ts` chỉ là class (không component): mỗi trang giữ `<Link>` có type (`to` + `search`) để điều hướng phía client. Track nền `--secondary`, pill đang chọn nền `--card` chữ đậm.
- **Trên bìa mờ** (`components/story/on-cover-classes.ts`): `ON_COVER_SOLID` (nền `--cover-fg`, chữ `--story-tint` do hero gán bằng `--hero-ink`, focus bằng outline lệch) và `ON_COVER_OUTLINE` (viền `--cover-fg`) cho nút trên hero trang chủ và trang truyện khi truyện có bìa; không dùng màu site trên nền bìa.
- Thêm component shadcn: không chạy `shadcn init` (kéo package `cn`). Trong `apps/web` chạy `pnpm dlx shadcn@latest add <tên>`, rồi:
  1. kiểm `package.json`: CLI tự thêm `cn` thì gỡ, import `cn` từ `@/lib/utils` (`clsx` + `tailwind-merge`);
  2. xoá class `shadow-*` (trừ dialog/panel nổi), đổi `ring-ring/50` → `ring-ring` (giữ `ring-[3px]`);
  3. chuyển bo góc sang thang ở trên (nút, chip → `rounded-full`);
  4. chuỗi tiếng Anh mặc định (vd. `sr-only` "Close") chuyển sang `m.*()`;
  5. `pnpm format`.
- Không thêm `sonner`: thông báo dùng inline như `FormMessage`.
- Icon: `lucide-react`, 16–22px.

## Layout

- **Khung trang:** `SiteLayout` (`components/site-layout.tsx`) là component từng trang tự bọc (không phải layout route): header, `main`, footer, thanh tab. Prop `bottomInset`: `'tabBar'` (mặc định), `'cta'` (trang truyện: ẩn thanh tab, chừa đáy cho nút đọc dính), `'none'`. Trang đọc và editor chương không dùng `SiteLayout` (có thanh riêng). Trang 404/lỗi mặc định ở `components/not-found.tsx`.
- **Header** (`site-header.tsx`): `SiteLogo`; từ `md` có ô tìm kiếm pill và ba link Khám phá, Bảng xếp hạng, Tủ truyện cho mọi người (chỉ icon dưới `xl`, chỉ chữ từ `xl`), thêm "Viết truyện" khi đã đăng nhập; dưới `md` ô tìm kiếm thành link icon "Tìm kiếm". Khách từ `md` có hai nút "Đăng nhập" (quay lại trang đang ở) và "Đăng ký"; khách dưới `md` có nút tròn 42px (`data-account-slot`), icon người, mở menu Đăng nhập, Đăng ký và chọn giao diện. Đã đăng nhập: nút tròn 42px chữ cái đầu + menu tài khoản. Lúc SSR/đang tải, ô tài khoản là placeholder giống nút cuối cùng; từ `md` hai link của khách là link thật (`.guest-hint`), bấm được ngay cả khi chưa biết phiên; dưới `md` chuông thông báo giữ ô 42px trống cho khách để cụm phải không xô khi biết phiên.
- **Footer** (`site-footer.tsx`): giống nhau với mọi người nên HTML vẫn cache công khai: wordmark + khẩu hiệu, link (Bảng xếp hạng, Điều khoản, Quy định nội dung, Chính sách bảo mật; Cuộc thi khi `CONTESTS_ENABLED`), công tắc giao diện 3 nấc. `BOOT_SCRIPT` đã áp theme trước khi vẽ, sau hydrate chỉ nấc đang chọn đổi.
- **Hint tài khoản, chống nháy khi tải trang** (`lib/account-hint.ts`): HTML công khai không đọc session, nên lúc SSR/đang tải `useMe()` các phần cá nhân render sẵn dạng placeholder. localStorage `nh:account` (`{initial, continueRows}`, `continueRows` tối đa 1 theo `CONTINUE_ROWS_MAX`; ghi khi `useMe()` có tài khoản, xoá khi 401/đăng xuất) được `BOOT_SCRIPT` áp trước khi vẽ: `data-signed-in` (hiện `.signed-in-hint`: nút Viết truyện, chuông, chữ cái đầu qua `--account-initial` dạng hex escape; ẩn `.guest-hint`) và `data-continue-rows` (giữ chỗ thanh "Đọc tiếp" trang chủ khi lần trước có thanh, `.continue-hint`). Không có hint thì hiện placeholder khách. Chỉ để hiển thị, không bao giờ dùng để phân quyền.
- **Trang truyện:** `StoryHero` trên `CoverBackdrop`, chữ `--cover-fg`, bìa nghiêng 2° từ `md`; truyện chưa có bìa thì nền trang + bìa chữ. Cột chính (giới thiệu đứng đầu, thông báo, tag, mục lục, đánh giá, thảo luận) và sidebar cùng đè lên chân hero; sidebar gồm (thẻ tác giả, "Truyện liên quan" là lưới 3 cột `StoryShelfCard compact`, tối đa 6, truyện cùng tác giả trước rồi cùng tag chính, "Độc giả gắn bó", nút báo cáo). Hàng số liệu: số chương, số chữ, tần suất ra chương, lần cập nhật (`story-meta.tsx`). Màn hẹp hơn ~950px sidebar xuống dưới cột chính (user chốt 2026-10-08, thay vị trí "cuối trang" của A3).
- **Trang chủ** (`routes/index.tsx`, `components/home/*`), từ trên xuống: hero "Mới đáng chú ý" (`CoverBackdrop`, bìa bên phải nghiêng 2,5° từ `md`; truyện chưa có bìa thì nền trang, bìa chữ bên trái, nút màu nhấn) → thanh "Đọc tiếp" của thành viên (một truyện, đè lên chân hero khi hero có bìa; tải ở client) → "Hôm nay đọc gì?" (tối đa 4 ô thể loại; tag không có trong DB thì không có ô, không ô nào thì ẩn cả khu; nền bìa mờ của một truyện có bìa thuộc thể loại, từ `md` thêm tối đa 3 bìa nhỏ xoè ở góc, không bao giờ dùng truyện 18+) → hàng hai cột: kệ "Vừa có chương mới" (10 bìa, mobile 5, "Chương N · thể loại", "Xem thêm" → `/search?sort=updated`) cạnh "Đang được đọc nhiều" (tab viên Ngày/Tuần/Tháng/Đang lên từ `md`, top 5, mobile top 3, link "Xem đủ bảng"; ẩn khi Redis xếp hạng không đọc được hoặc chưa xếp được truyện nào) → "Truyện nổi bật" (mod) → "Trọn bộ, đọc một mạch" → "Truyện mới cần độc giả" → dải `--band` "Có truyện muốn kể?" (khi `CONTESTS_ENABLED` và có cuộc thi đang diễn ra thì thành các thẻ cuộc thi + thẻ mời viết). Ba kệ nổi bật, trọn bộ, cần độc giả rỗng thì ẩn. Một truyện chỉ xuất hiện ở một khu trong số hero, nổi bật, vừa hoàn thành, cần độc giả (`lib/home-sections.ts`); "Vừa có chương mới" là dòng thời gian nên được trùng; bảng xếp hạng không bị cắt để thứ hạng trung thực (`[auto]` 2026-10-08, chờ user duyệt).
- **Khám phá** (`/search`, giữ URL, `noindex`): tiêu đề "Khám phá" khi chưa có từ khoá; sắp xếp và lọc (thể loại, tình trạng, độ dài) là chip viên một chạm, công tắc "Ẩn truyện có dùng AI" (`role="switch"`, nhận cả Space); chưa lọc gì thì có các hàng lối vào render server (không 18+). Header desktop có mục "Khám phá".
- **Thanh tab dưới** (`mobile-tab-bar.tsx`, dưới `md`): `nav` "Điều hướng chính", cao 72, nền `--card`, 5 mục Trang chủ, Khám phá, Tủ truyện, Viết, Tôi (`/settings` hoặc `/sign-in`). Trang công khai cache được (Trang chủ, Khám phá) tải lại cả document; đích cá nhân dùng `Link` (điều hướng phía client). Mục đang chọn `aria-current="page"`, icon trong pill `--primary-soft`. Ẩn ở trang truyện, trang đọc, editor.
- **Trang đọc:** một mốc `lg` (1024px). Dưới `lg`: thanh trên + thanh dưới 4 ô (Mục lục, Trước, Sau, Cài đặt), sheet ở đáy. Từ `lg`: thanh trên + rail dọc bên phải; sheet thành panel cạnh màn hình (`side="adaptive-*"` trong `ui/sheet.tsx`): cài đặt và bình luận theo đoạn ở phải (cột chữ giữ nguyên độ rộng và vị trí, vẫn căn giữa; panel đè lên phía phải, kể cả mép phải cột ở màn 1024–1279px, không phủ tối), mục lục ở trái. Thanh trên có tên truyện nhỏ, tên chương và thanh tiến độ mảnh.
- **Safe-area:** viewport `viewport-fit=cover`. Không đệm `body` (nền trang đọc, dải màu tràn viền). Khung nội dung (header, `PageShell`, footer, `<main>` editor) và thanh cố định dùng utility `px-safe-<n>` trong `app.css` (= `max(<n> spacing, env(safe-area-inset-left/right))`); thanh/sheet dính đáy cộng `env(safe-area-inset-bottom)` (toolbar editor chỉ khi bàn phím đóng). Thanh cố định ở đáy gắn `data-bottom-bar="md" | "lg"` (mốc thanh biến mất) để `:root` có `scroll-padding-bottom: 72px + inset` dưới mốc đó. Trang kiểm duyệt `/moderation` rộng tối đa 960px.
- **Phần tử trùng theo viewport** (bản desktop + bản mobile của cùng control) ẩn bằng `display:none` (`hidden md:flex`, `hidden lg:flex` / `lg:hidden`), không chỉ ẩn bằng hình, để accessibility tree và Playwright strict mode chỉ thấy một bản.
