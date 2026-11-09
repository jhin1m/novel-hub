# Hướng dẫn thiết kế

Bổ sung cho mục 8 của `docs/project-spec.md`. Hướng **B+ "ứng dụng đọc ấm"**. Khi mockup lệch với repo, **`apps/web/src/styles/tokens.css` là chuẩn**.

## Nguồn

| Thứ | Link |
| --- | --- |
| Design System | chưa có (bảng token ở canvas trang "Vòng 2", mục `B-tokens`) |
| Mockup | canvas https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo, trang "Vòng 3 · B+ đã chốt" |
| Tokens (chuẩn) | `apps/web/src/styles/tokens.css` |
| Ánh xạ sang Tailwind, bo góc | `apps/web/src/styles/app.css` (`@theme inline`) |
| Khu đọc | `apps/web/src/styles/reader.css` |
| Bảng hằng để test | `apps/web/src/styles/token-values.ts`, `token-contrast-pairs.ts` |

Canvas dùng tên ngắn (`--bg`, `--surface`, `--s2`, `--accent`, `--soft`, ...); `--accent` của canvas là `--primary` trong code.

## Nguyên tắc (spec mục 8)

- "Ấm, như một ứng dụng đọc", mobile-first. Khu đọc gần như vô hình, khu khám phá giống hiệu sách, khu viết tập trung.
- Nền ngà ấm, nội dung trên thẻ trắng. Thứ bậc đến từ bậc nền (`--background` → `--band` → `--card`), không từ bóng đổ.
- **Một** màu nhấn mòng két (`--primary`), chỉ cho hành động chính, mục đang chọn, tiến độ, focus.
- Bo góc mềm; nút, chip, tab dạng viên. Vùng chạm ≥ 44px. Không gradient.
- Không quảng cáo, banner, popup; hero trang chủ là truyện nổi bật (nhãn "Mới đáng chú ý"), không phải banner. Không thanh tiến trình chuyển trang; không hiển thị ID nội bộ.
- Mọi chuỗi hiển thị qua Paraglide (`packages/shared/messages/vi.json`), không hardcode.
- Hai theme site **Ngà** (sáng, mặc định) và **Tối**, người dùng tự chọn (xem "Theme site"). Animation tắt khi `prefers-reduced-motion: reduce`.
- Lớp trang trí giữ: gáy sách trên bìa, hero trang chủ, chip thể loại, icon cạnh tiêu đề mục, dải `--band`, hero màu tag ở trang truyện, hàng số liệu. Không dùng: nền chấm bi, hoạ tiết bìa theo thể loại.

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
| `--band` | `#EFE6D4` | `#161A18` | dải nền tông trơn sau một khu trang chủ, khối số liệu `/write`, banner bản local trong editor |
| `--destructive` | `#B3261E` | `#F2877C` | lỗi, xoá, nhãn 18+, bị ẩn |
| `--warning-soft` / `--warning-foreground` | `#FFF1DC` / `#8A4B00` | `#2E2312` / `#F2B866` | nhãn Tạm ngưng, Hẹn giờ, cảnh báo, tag cảnh báo (`TagChip kind="warning"`, badge tag ở màn 18+ và trang tag kind cảnh báo) |

Utility Tailwind tương ứng: `bg-background`, `bg-band`, `bg-primary-soft`, `text-warning-foreground`, `border-input`, ... (ánh xạ trong `@theme inline` của `app.css`).

## Theme site

- Lựa chọn 3 giá trị `system | ivory | dark` (`SITE_THEME_CHOICES`, `packages/shared`), mặc định `system`: máy sáng → Ngà, máy tối → Tối.
- Áp bằng `data-theme` trên `<html>` (`ivory` | `dark`; `system` = không có thuộc tính). `BOOT_SCRIPT` (inline, đầu `<head>`) đọc localStorage `nh:theme` (`{choice, updatedAt}`) và gắn thuộc tính trước khi vẽ; HTML SSR không bao giờ có `data-theme`, không phụ thuộc cookie, vẫn cache công khai.
- Người đã đăng nhập đồng bộ thêm vào `users.preferences.siteTheme`; bản đổi sau cùng thắng (`updatedAt`), như cài đặt trang đọc. `SiteThemeSync` (root) đối chiếu một lần khi tài khoản đã tải; thiết bị mới đổi theme sau hydrate một lần (chấp nhận, cookie sẽ phá cache).
- `tokens.css`: `:root` = Ngà; Tối khai báo ở `:root:where([data-theme='dark'])` và trong `@media (prefers-color-scheme: dark)` ở `:root:where(:not([data-theme='ivory']))`. Luôn dùng `:root:where(...)` để giữ specificity 0,1,0: preset đọc (`[data-reader-theme=…]`, khai báo sau) mới thắng `--reader-*`.
- `dark:` của Tailwind theo theme thật (`@custom-variant dark` trong `app.css`), không chỉ theo hệ điều hành.
- Chỗ chọn: menu tài khoản ở header (khách và đã đăng nhập; nhãn "Giao diện" + 3 `menuitemradio`) và mục "Giao diện" cuối `/settings` (cả khách, nhóm radio dạng segment). Trang đọc và editor không có picker theme site (trang đọc dùng preset riêng).

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

Self-host qua `@fontsource-variable/*` (import trong `app.css`), không gọi Google Fonts.

| Token | Font | Utility | Dùng cho |
| --- | --- | --- | --- |
| `--font-ui` | Plus Jakarta Sans (variable) | `font-sans` (mặc định của `body`) | giao diện, mọi tiêu đề UI |
| `--font-content` | Source Serif 4 (variable, thường + nghiêng) | `font-serif` | chỉ nội dung truyện: trang đọc (mặc định), tên chương ở trang đọc, editor (cả ô tên chương), xem trước revision, lời nhắn tác giả, giới thiệu truyện, trích đoạn trong bình luận theo đoạn |
| `--font-reader-literata` | Literata (variable) | qua `var()` | lựa chọn ở trang đọc |
| `--font-reader-noto-serif` | Noto Serif (variable) | qua `var()` | lựa chọn ở trang đọc |

- `__root.tsx` preload đúng 4 file `*-{latin,vietnamese}-wght-normal.woff2` của Plus Jakarta Sans và Source Serif 4.
- Literata, Noto Serif chỉ tải khi người đọc chọn (`unicode-range` + chỉ dùng khi `data-reader-font` trỏ tới). Nhãn nút chọn font render bằng font giao diện, để mở bảng cài đặt không kéo cả 4 font.
- Lựa chọn `plus-jakarta-sans` ở trang đọc dùng lại `--font-ui`. Giá trị cũ `be-vietnam-pro`, `inter` (localStorage, `users.preferences`) được map sang `plus-jakarta-sans` (`LEGACY_READER_FONTS` trong `packages/shared/src/schemas/reader.ts`, và selector tương ứng trong `reader.css`).
- Serif chỉ cho nội dung truyện (trang đọc, tên chương ở trang đọc, editor, xem trước revision, lời nhắn tác giả, giới thiệu truyện, trích đoạn trong bình luận theo đoạn). Mọi văn bản giao diện khác dùng font giao diện, kể cả trang điều khoản/quy định, mô tả cuộc thi, số thứ hạng, mẫu "Aa" ở nhóm màu nền trong cài đặt đọc. Ngoại lệ trang trí duy nhất: chữ "N" của logo.

## Chữ

Chỉ ghi các cỡ đã có trong code (không có token `--text-*`):

| Chỗ | Cỡ / độ đậm | Nơi khai báo |
| --- | --- | --- |
| `body` | 15px / 500 | `app.css` (`@layer base`) |
| Tiêu đề trang (`PageTitle`, h1) | 28px / 800 | `components/page-shell.tsx` |
| Tiêu đề mục (`SectionHeading`, h2) | 22px / 800 | `components/section-heading.tsx` |
| Tiêu đề hero trang chủ | 24px mobile, 38px từ `md` / 800 | `components/home/home-featured-hero.tsx` |
| Tiêu đề hero trang truyện | 24px mobile, 48px từ `md` / 800 | `components/story/story-hero.tsx` |
| Nhãn trạng thái | 11px / 700 | `components/ui/badge.tsx` |

Nội dung truyện (trang đọc, editor, xem trước revision) đặt `font-weight: 400`; 500 của `body` chỉ cho giao diện. Ngắt cảnh (`<hr>`) hiển thị `* * *`.

## Hình khối, bóng, focus

- Bo góc (`@theme inline` trong `app.css`): `xs 6` (nhãn trạng thái), `sm 8` (bìa nhỏ), `md 12` (bìa, ô nhập), `lg 18` (thẻ, danh sách), `xl 24` (khối, dialog), `2xl 28` (hero, khối lớn); sheet bo cạnh trên 28px dưới `lg`, không bo khi là panel từ `lg`, `full` (nút, chip, tab, ô tìm kiếm, thanh tiến độ).
- Bóng: chỉ bìa nổi trong hero (trang chủ `0 20px 44px` đen 26%, trang truyện `0 22px 48px` đen 27%) và dialog (`0 24px 60px` đen 25%). Ngoài ra chỉ có `shadow-xs` cho mục đang chọn trong tab group và trong các nhóm lựa chọn ở cài đặt đọc. Thẻ, nút, sheet không bóng.
- Focus: `focus-visible:ring-[3px] ring-ring` (không alpha). Trên nền màu bìa dùng kiểu "trên màu bìa" bên dưới.
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
| `--cover-7` | `#5B3A64` | tím mơ |
| `--cover-8` | `#7E3B54` | hồng trầm |
| `--cover-9` | `#3A3632` | xám than |
| `--cover-fg` | `#F6F1E7` | chữ trên bìa |

- Dùng chung cho Ngà và Tối (bìa là "vật thể"). Mọi màu đạt ≥ 5:1 với `--cover-fg` (thấp nhất 5.02 trên `--cover-2`).
- Chọn màu: FNV-1a 32-bit trên slug tag chính `% COVER_PALETTE_SIZE` (`lib/cover-palette.ts`). Cùng màu đó dùng cho chấm màu của chip thể loại và dải hero trang truyện (`--story-tint`).
- Thêm màu: thêm `--cover-N` (N liên tiếp) vào `tokens.css` và `token-values.ts`, tăng `COVER_PALETTE_SIZE`. Đổi số màu làm đổi màu của các tag hiện có.
- Chữ trên hero/dải màu tag chỉ dùng `--cover-fg`, phân cấp bằng cỡ và độ đậm, không giảm opacity chữ.

## Quy tắc tương phản

- Mọi cặp chữ/nền đạt WCAG AA **4.5:1**; viền ô nhập và focus ring đạt **3:1** (WCAG 1.4.11).
- Danh sách cặp: `CONTRAST_PAIRS`, `READER_CONTRAST_PAIRS`, `COVER_CONTRAST_PAIRS` (`styles/token-contrast-pairs.ts`). `pnpm test` kiểm mọi cặp ở Ngà, Tối và 6 preset, đồng thời đối chiếu từng giá trị có nguyên văn trong `tokens.css`.
- Đổi hoặc thêm màu: sửa **cả** `tokens.css` và `token-values.ts` (mỗi giá trị một dòng `--tên: #hex;`), thêm cặp nếu là cặp chữ/nền mới. Hàm `contrastRatio()` ở `apps/web/src/lib/contrast.ts`.

## Component

- shadcn/ui (style `new-york`) ở `apps/web/src/components/ui/`, chỉ thêm component cần dùng. Hiện có: button, input, textarea, label, checkbox, select, dialog, sheet, dropdown-menu, badge.
- **Button** (`ui/button.tsx`): pill, cao 44 (`default`) / 48 (`lg`); nút "Chương tiếp" cuối chương cao 64. Biến thể: `default` (nhấn), `secondary`, `ghost`, `outline` (viền 1.5px `--foreground`), `destructive` (viền + chữ `--destructive`, không nền đỏ đặc), `link`. Disabled opacity 0.6.
- **Badge** (`ui/badge.tsx`): cao 24, bo `xs`, 11/700. Biến thể thêm `muted` (nháp) và `warning` (Tạm ngưng, Hẹn giờ, tag cảnh báo).
- **`status-badges.tsx`**: một kiểu cho mỗi trạng thái toàn site: `StoryStatusBadge`, `StoryVisibilityBadge`, `ChapterStatusBadge`, `StoryFlagBadges` (Có dùng AI = viền `--input`; 18+ = viền + chữ `--destructive`). Không tự chọn variant ở từng trang.
- **`TagChip`** (`tag-chip.tsx`): link pill tới trang tag, chấm màu bìa của tag 8px; tên truy cập chỉ là tên tag. `kind="warning"`: nền `--warning-soft`, chữ `--warning-foreground`, viền `--warning-foreground` 30%, icon `TriangleAlert` 14px thay chấm màu; luôn có `data-kind` khi truyền kind.
- **`SectionHeading`** (`section-heading.tsx`): ô icon 34×34 nền `--primary-soft` (trên `--band` thì `onBand` → nền `--card`) + h2 22/800 + dòng phụ; vùng bọc dùng `aria-labelledby={id}`.
- **`PageShell` / `PageTitle`** (`page-shell.tsx`): cột nội dung trang phụ (1240px hoặc `narrow` 560px) và h1 duy nhất của trang; `pageCardClass` cho khối form/chữ chính.
- **Tab group:** `segmented-link-classes.ts` chỉ là class (không component): mỗi trang giữ `<Link>` có type (`to` + `search`) để điều hướng phía client. Track nền `--secondary`, pill đang chọn nền `--card` chữ đậm.
- **Trên màu bìa** (`components/story/on-cover-classes.ts`): `ON_COVER_SOLID` (nền `--cover-fg`, chữ màu tag, focus bằng outline lệch) và `ON_COVER_OUTLINE` (viền `--cover-fg`) cho nút trên hero trang truyện; không dùng màu site trên nền bìa.
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
- **Header** (`site-header.tsx`): logo + wordmark "SayNovel" (wordmark `sr-only` dưới `sm`); desktop có ô tìm kiếm pill, nav (khi đã đăng nhập), nút tài khoản; dưới `md` ô tìm kiếm thành link icon "Tìm kiếm". Cụm phải không xô khi biết phiên: ô tài khoản luôn là một nút tròn 42px (`data-account-slot`): lúc SSR/đang tải là placeholder giống hệt một trong hai nút, icon người + menu "Đăng nhập" (quay lại trang đang ở) / "Đăng ký" cho khách, chữ cái đầu + menu tài khoản khi đã đăng nhập; chuông thông báo giữ ô 42px trống cho khách. Chỉ nav desktop (đã đăng nhập) mọc thêm vào khoảng trống, không đẩy logo hay ô tìm kiếm.
- **Hint tài khoản, chống nháy khi tải trang** (`lib/account-hint.ts`): HTML công khai không đọc session, nên lúc SSR/đang tải `useMe()` các phần cá nhân render sẵn dạng placeholder. localStorage `nh:account` (`{initial, continueRows}`, ghi khi `useMe()` có tài khoản, xoá khi 401/đăng xuất) được `BOOT_SCRIPT` áp trước khi vẽ: `data-signed-in` (hiện `.signed-in-hint`: nav Tủ truyện/Viết truyện, chuông, chữ cái đầu qua `--account-initial` dạng hex escape; ẩn `.guest-hint`) và `data-continue-rows` (khung "Đọc tiếp" trang chủ với đúng số dòng lần trước, `.continue-hint`). Không có hint thì hiện placeholder khách. Chỉ để hiển thị, không bao giờ dùng để phân quyền.
- **Trang truyện:** cột chính (giới thiệu, tag, mục lục, đánh giá, thảo luận) + sidebar (thẻ tác giả, "Truyện liên quan" dạng danh sách gọn `StoryRowList` gồm "Cùng tác giả" rồi "Cùng thể loại", "Độc giả gắn bó", nút báo cáo). Màn hẹp hơn ~950px sidebar xuống dưới cột chính (user chốt 2026-10-08, thay vị trí "cuối trang" của A3).
- **Trang chủ** (`routes/index.tsx`, `components/home/*`), từ trên xuống: chip thể loại → hero "Mới đáng chú ý" + "Đọc tiếp" → Truyện nổi bật (mod) → Bảng xếp hạng (tab viên Ngày/Tuần/Tháng/Đang lên, top 5, link "Xem đủ" và "Được đề cử nhiều"; ẩn khi Redis xếp hạng không đọc được) → Mới cập nhật (dòng có "Chương N · tên", mobile 12 dòng, "Xem thêm" → `/search?sort=updated`) → Vừa hoàn thành → Truyện mới cần độc giả → dải `--band` Truyện mới đáng chú ý → dải `--band` cuộc thi đang diễn ra + khối mời viết. Một truyện chỉ xuất hiện ở một khu trong số hero, nổi bật, vừa hoàn thành, cần độc giả, đáng chú ý (`lib/home-sections.ts`); Mới cập nhật là dòng thời gian nên được trùng; bảng xếp hạng không bị cắt để thứ hạng trung thực (`[auto]` 2026-10-08, chờ user duyệt).
- **Khám phá** (`/search`, giữ URL, `noindex`): tiêu đề "Khám phá" khi chưa có từ khoá; sắp xếp và lọc (thể loại, tình trạng, độ dài) là chip viên một chạm, công tắc "Ẩn truyện có dùng AI" (`role="switch"`, nhận cả Space); chưa lọc gì thì có các hàng lối vào render server (không 18+). Header desktop có mục "Khám phá".
- **Thanh tab dưới** (`mobile-tab-bar.tsx`, dưới `md`): `nav` "Điều hướng chính", cao 72, nền `--card`, 5 mục Trang chủ, Khám phá, Tủ truyện, Viết, Tôi (`/settings` hoặc `/sign-in`). Trang công khai cache được (Trang chủ, Khám phá) tải lại cả document; đích cá nhân dùng `Link` (điều hướng phía client). Mục đang chọn `aria-current="page"`, icon trong pill `--primary-soft`. Ẩn ở trang truyện, trang đọc, editor.
- **Trang đọc:** một mốc `lg` (1024px). Dưới `lg`: thanh trên + thanh dưới 4 ô (Mục lục, Trước, Sau, Cài đặt), sheet ở đáy. Từ `lg`: thanh trên + rail dọc bên phải; sheet thành panel cạnh màn hình (`side="adaptive-*"` trong `ui/sheet.tsx`): cài đặt và bình luận theo đoạn ở phải (cột chữ giữ nguyên độ rộng và vị trí, vẫn căn giữa; panel đè lên phía phải, kể cả mép phải cột ở màn 1024–1279px, không phủ tối), mục lục ở trái. Thanh trên có tên truyện nhỏ, tên chương và thanh tiến độ mảnh.
- **Safe-area:** viewport `viewport-fit=cover`. Không đệm `body` (nền trang đọc, dải màu tràn viền). Khung nội dung (header, `PageShell`, footer, `<main>` editor) và thanh cố định dùng utility `px-safe-<n>` trong `app.css` (= `max(<n> spacing, env(safe-area-inset-left/right))`); thanh/sheet dính đáy cộng `env(safe-area-inset-bottom)` (toolbar editor chỉ khi bàn phím đóng). Thanh cố định ở đáy gắn `data-bottom-bar="md" | "lg"` (mốc thanh biến mất) để `:root` có `scroll-padding-bottom: 72px + inset` dưới mốc đó. Trang kiểm duyệt `/moderation` rộng tối đa 960px.
- **Phần tử trùng theo viewport** (bản desktop + bản mobile của cùng control) ẩn bằng `display:none` (`hidden md:flex`, `hidden lg:flex` / `lg:hidden`), không chỉ ẩn bằng hình, để accessibility tree và Playwright strict mode chỉ thấy một bản.
