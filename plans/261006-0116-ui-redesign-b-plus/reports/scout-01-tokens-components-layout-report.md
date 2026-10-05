# Scout 01: tokens + font (P1), component dùng chung (P2), layout (P3)

Ngày 2026-10-05. Chỉ đọc code. Spec: `plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` §2–5, 8, 10.
Đường dẫn tương đối từ `apps/web/src/` trừ khi ghi khác.

## Phát hiện quan trọng (đọc trước)

1. **Ghi đè màu nhấn theo preset sẽ lan ra toàn site.** `BOOT_SCRIPT` + `applyReaderSettings` đặt `data-reader-theme` trên `<html>` ở **mọi trang**, không riêng trang đọc. Nếu thêm `--primary` vào `[data-reader-theme='dark-gray']` như report §2.3 gợi ý, người chọn preset tối trên OS sáng sẽ thấy `#4FC2A8` trên `#F5F4EF` ở trang chủ (~2:1, rớt AA). Hướng xử lý: token riêng `--reader-primary`, `--reader-primary-foreground`, `--reader-primary-soft` khai báo theo preset, rồi `.reader-page { --primary: var(--reader-primary); ... }`. Sheet được portal ra ngoài `.reader-page` và đang dùng `bg-background` (token site), nên vẫn nhất quán.
2. **`font-serif` có 38 chỗ dùng trong 27 file**, phần lớn là tiêu đề h1/h2 (`font-serif text-xl font-semibold`). Khi đổi `--font-content` sang Source Serif 4, mọi tiêu đề giao diện thành serif, trong khi thiết kế muốn tiêu đề UI là Plus Jakarta 800. P1 đổi biến; các phase sau phải bỏ `font-serif` khỏi tiêu đề UI (hoặc P2 làm một lần cho các component dùng chung). Planner cần chốt.
3. **Map font cũ phải làm ở 3 nơi, không chỉ Zod:** schema (`readerSettingsSchema.font`), `BOOT_SCRIPT` (hiện `indexOf<0 → default`, nên `inter` sẽ thành `source-serif-4` trong khi React ra `plus-jakarta-sans`, gây nháy chữ và làm test parity `boot-script.test` fail nếu có fixture font cũ), `reader.css` (`data-reader-font`). Thiếu map thì `userPreferencesSchema.reader` (`.catch(undefined)`) **bỏ cả khối** cài đặt đồng bộ của user.
4. **Integration test sẽ vỡ:** `packages/api/src/routes/me.int.test.ts:94` dùng `font: 'inter'` và kiểm round-trip `toEqual` (dòng 135, 140). Sau khi map thì kết quả là `plus-jakarta-sans`. Cần đổi fixture sang font mới (có thể thêm một case legacy riêng).
5. `site-layout.tsx` đã 207 dòng, P3 thêm thanh tab nên bắt buộc tách file.
6. Thang bo góc trong `@theme` đổi thì **27 chỗ `rounded-md`** đổi theo ngay ở P1 (md 6→12px); không test nào kiểm bo góc.
7. Font package có trên npm (5.3.0, đã xác minh qua unpkg). Tên family: `'Plus Jakarta Sans Variable'`, `'Source Serif 4 Variable'`. File preload: `plus-jakarta-sans-{latin,vietnamese}-wght-normal.woff2`, `source-serif-4-{latin,vietnamese}-wght-normal.woff2`. Source Serif 4 có thêm `opsz.css`/`standard.css`; phải import `wght.css` + `wght-italic.css` để khớp file preload.

---

## P1: Tokens + font

### 1. Inventory

| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| `styles/tokens.css` | 127 | nguồn chuẩn token, light/dark, 6 preset đọc, `--cover-*`, `--radius`, `--font-*` | sửa (giá trị mới, +`--primary-soft`, `--band`, `--warning-soft`, `--warning-foreground`, `--reader-card`, token nhấn cho khu đọc, `--cover-fg` #f6f1e7, font, bỏ `--font-reader-inter`, thêm `--font-reader-literata`; sửa comment "terracotta") |
| `styles/token-values.ts` | 130 | bản sao TS của các giá trị hex, `CONTRAST_PAIRS`, `resolvedScopes()` | sửa (giá trị, cặp §2.4, cặp khu đọc, scope preset phải có nhấn light/dark); có thể vượt 200 dòng |
| `styles/tokens.test.ts` | 78 | parity CSS↔TS + tương phản | sửa nhẹ (fixture drift dòng 67–73 dùng hex cũ nhưng độc lập, giữ được) |
| `styles/app.css` | 122 | import font, `@theme inline`, base, typography editor | sửa (import 2 font mới, bỏ be-vietnam/inter; `--color-*` mới; thang radius xs..2xl; `--font-sans/serif`) |
| `styles/reader.css` | 117 | biến khu đọc, `data-reader-font` | sửa (`literata` thành tuỳ chọn, `plus-jakarta-sans` → `var(--font-ui)`, bỏ `be-vietnam-pro`/`inter`; nhấn theo preset trong `.reader-page`) |
| `routes/__root.tsx` | 75 | preload font, boot script, shell | sửa `PRELOAD_FONTS` (4 import `?url`) |
| `lib/boot-script.ts` | 57 | script inline đọc enum từ `READER_FONTS` | sửa (thêm map alias font cũ; hiện dài 1038/1536 ký tự, còn dư khoảng 500) |
| `lib/boot-script.test.ts` | 143 | parity script ↔ `applyReaderSettings` | sửa (fixture `font:'inter'` dòng 67 thì đổi; thêm fixture legacy `be-vietnam-pro`/`inter`; dòng 119 `'literata'` → `'source-serif-4'`) |
| `lib/reader/settings.ts` | 104 | parse/apply/sync localStorage | có thể không đổi (map nằm ở schema; `field(shape.font, …)` dùng được với preprocess/transform) |
| `lib/reader/settings.test.ts` | 75 | test parse | sửa dòng 21–25 (`font:'inter'` hiện được giữ nguyên; sau map thì ra `plus-jakarta-sans`) |
| `lib/contrast.ts` / `.test.ts` | 57 / 52 | tính WCAG | giữ; test dùng hex cũ làm fixture toán học, không phụ thuộc token |
| `lib/cover-palette.ts` / `.test.ts` | 47 / 50 | hash slug → `--cover-N`, cỡ tiêu đề bìa theo cqw | giữ ở P1; `coverTitleClass` có thể đổi ở P2 (test kiểm `13/11/9/7cqw`, `^text-xl `) |
| `packages/shared/src/schemas/reader.ts` | 105 | `READER_FONTS`, schema, `DEFAULT_READER_SETTINGS.font='literata'` | sửa (enum mới, mặc định `source-serif-4`, map legacy) |
| `packages/shared/src/schemas/reader.test.ts` | 130 | 10 test | thêm test map legacy và test enum mới |
| `packages/shared/src/schemas/preferences.test.ts` | ~50 | 7 test | thêm case: `reader.font:'inter'` được map, không bị drop |
| `packages/api/src/routes/me.int.test.ts` | — | round-trip prefs | sửa fixture dòng 94 |
| `components/reader/reader-settings-sheet.tsx` | 244 | `FONT_LABELS: Record<ReaderFont,…>` dòng 37–42 | sửa 4 dòng (typecheck bắt buộc) |
| `packages/shared/messages/vi.json` | 478 | `reader_settings_font_*` dòng 258–261 | sửa (+2 key, bỏ 2) |
| `apps/web/package.json` | 53 | deps font | +`@fontsource-variable/plus-jakarta-sans` 5.3.0, +`@fontsource-variable/source-serif-4` 5.3.0; bỏ `@fontsource/be-vietnam-pro`, `@fontsource-variable/inter`; `pnpm-lock.yaml` đổi theo |
| `e2e/layout.spec.ts` | 57 | 4 test; 2 test font | sửa (xem mục 2) |
| `docs/design-guidelines.md` | 108 | dòng 17, 29–32, 47–53, 72, 86 nhắc đất nung, Be Vietnam, Inter, Literata | để P9 (ghi nhận) |
| `docs/project-spec.md` | — | dòng 251, 263 (font) | để P9 |

### 2. Test liên quan

| File | Số test | Phụ thuộc style/tên |
| --- | --- | --- |
| `styles/tokens.test.ts` | 6 (`it.each` mở thành 8 scope) | mỗi `--x: #hex;` trong TS phải có **nguyên văn** trong CSS (một dòng một khai báo, chữ thường); số `--cover-N:` phải bằng `COVER_PALETTE_SIZE`=10; đủ 6 selector `[data-reader-theme='…']`; mọi cặp ≥ ngưỡng ở mọi scope |
| `lib/boot-script.test.ts` | 7 (+16 fixture parity) | `'data-reader-font': 'literata'` (dòng 119), fixture `font:'inter'`, độ dài < 1536 |
| `lib/reader/settings.test.ts` | 8 | `font:'inter'` được giữ (dòng 21–25) |
| `lib/cover-palette.test.ts` | 6 | slot cố định `tien-hiep`→2, `ngon-tinh`→3; class cqw |
| `lib/contrast.test.ts` | 7 | không phụ thuộc token |
| shared `reader.test.ts` / `preferences.test.ts` | 10 / 7 | `font:'comic-sans'` bị từ chối (giữ) |
| api `me.int.test.ts` | — | round-trip `font:'inter'` (**vỡ**) |
| `e2e/layout.spec.ts` | 4 | test 3: preload `literata-*-wght-normal`, `be-vietnam-pro-*-400-normal` → đổi sang `plus-jakarta-sans-*-wght-normal`, `source-serif-4-*-wght-normal`, giữ `crossorigin`; test 4: `be-vietnam-pro` có tải, `/noto-serif\|inter-/` không tải → đổi thành `plus-jakarta-sans` có tải, `/literata\|noto-serif/` không tải (regex `inter-` cũ cũng khớp nhầm `…-inter-…`) |
| `e2e/reader-settings.spec.ts` | 7 | `--reader-font-size` 19px khi reset, `--reader-column` 60ch/68ch, `data-reader-theme`: **giữ**, không kiểm tên font |

### 3. Cần bảo vệ bằng test
`readerSettingsSchema` (enum mới + map legacy), `DEFAULT_READER_SETTINGS`, `userPreferencesSchema` (legacy không bị drop), `BOOT_SCRIPT` (parity với legacy, giữ giới hạn cỡ), `parseStoredSettings`, `applyReaderSettings`, `TOKEN_VALUES`/`CONTRAST_PAIRS`/`COVER_CONTRAST_PAIRS`/`resolvedScopes()`, tương phản nhấn khu đọc theo từng preset.

### 4. Trùng lặp / phụ thuộc rủi ro
- Giá trị hex nằm ở 2 nơi (`tokens.css` ↔ `token-values.ts`); test chỉ so chuỗi, **không so scope**: đặt nhầm khối vẫn qua test.
- `resolvedScopes()` cho preset = `{...light, ...reader[preset]}`: preset tối được kiểm với nhấn light. Phải đưa token nhấn khu đọc vào `reader[preset]` để test bắt được lỗi `#0E6B5B` trên `#2B2B2B`.
- Mặc định khu đọc khai báo 3 lần: `:root` light/dark trong `tokens.css`, `reader.css :root` (19px/1.8/1em), `DEFAULT_READER_SETTINGS`. `--reader-card` mới cũng phải có ở `:root` light (ivory) và dark (dark-gray).
- Tên `--muted` trong code là nền (`--s2` #ECEAE3), còn `--muted` của canvas là chữ phụ, dễ nhầm khi chép. `--accent` code ≠ `--accent` canvas.
- `--card`/`--popover` tách khỏi `--background`: `dialog.tsx:56`, `sheet.tsx:55`, `button.tsx:15` (outline) dùng `bg-background`, nên phải chuyển sang `bg-card` ở P2.
- Focus `ring-ring/70` / `outline-ring/70` trên nền mới: tính tay khoảng 3.2:1 (light, trên `#F5F4EF`) và 4.7:1 (dark). Sát ngưỡng 3:1; nên thêm cặp kiểm hoặc dùng ring đặc.
- `READER_FONTS` chỉ được dùng ở `boot-script.ts`, `reader-settings-sheet.tsx` và export trong `packages/shared/src/index.ts`. Không có seed hay route nào ghi font.
- Hex `#a8432a` trong `packages/{api,core}/**/*.int.test.ts`, `core/images/cover.test.ts` chỉ là màu ảnh PNG giả, **không** liên quan token.

### 5. File > 200 dòng bị đụng
`reader-settings-sheet.tsx` (244, sửa 4 dòng, không tách ở P1). `token-values.ts` dự kiến vượt 200: cân nhắc tách `styles/token-contrast-pairs.ts`.

### 6. i18n (P1)
| Key | Giá trị |
| --- | --- |
| `reader_settings_font_source_serif_4` (mới) | `Source Serif 4` |
| `reader_settings_font_plus_jakarta_sans` (mới) | `Plus Jakarta Sans` |
| `reader_settings_font_be_vietnam_pro`, `reader_settings_font_inter` | xoá |

Sau khi sửa `vi.json` phải chạy `pnpm i18n:compile`.

---

## P2: Component dùng chung

### 1. Inventory + số file import

| Path | Dòng | Import ở (số file) | Hành động |
| --- | --- | --- | --- |
| `components/ui/button.tsx` | 61 | 34 (`<Button` ≥ 72 lần: outline 20, ghost 13, sm 9, icon 5, lg 1, destructive 2 (`chapter-list`, `moderation/confirm-dialog`), icon-sm 2) | sửa: pill, cao 44 (`default`), CTA 48–52, `destructive` = viền + chữ (hiện `bg-destructive text-white`; dark `#F2877C`+trắng rớt AA), disabled 0.6 |
| `ui/badge.tsx` | 45 | 10 (`<Badge` 23: secondary 10, outline 8, destructive 1) | sửa → nhãn trạng thái cao 24, bo 6, 11/700; thêm variant soft/warning/AI/18+ |
| `ui/input.tsx` | 20 | 6 | sửa: h 46, bo 12, `bg-card`, lỗi viền 2px |
| `ui/textarea.tsx` | 17 | 4 | sửa tương tự input |
| `ui/select.tsx` | 172 | 4 | sửa trigger (`data-[size=default]:h-9`), content |
| `ui/checkbox.tsx` | 26 | 4 | sửa nhẹ (`rounded-[4px]` cố định) |
| `ui/dialog.tsx` | 144 | 7 | `rounded-lg bg-background` → bo xl 24, `bg-card`, bóng dialog §2.5 |
| `ui/sheet.tsx` | 132 | 3 (2 ở reader, 1 editor) | `bg-background` → `bg-card`, bo cạnh trên sheet mobile |
| `ui/dropdown-menu.tsx` | 225 | 2 (`site-layout`, `library/shelf-menu`) | bo góc, nền popover; tên menuitem giữ nguyên |
| `ui/label.tsx` | 18 | 11 | 13/700 |
| `story-cover.tsx` | 99 | 5 (`story-card`, `library-item`, `cover-upload`, `write/index`, `stories.$storyKey.index`) | sửa: gáy sách (≈5cqw), chữ cái lớn mờ `aria-hidden`, tiêu đề sans 800 (hiện `font-serif font-medium`), bo 12; ảnh thật cũng có gáy |
| `story-cover.test.tsx` | 50 | 4 test | thêm test gáy + chữ cái mờ |
| `story/story-card.tsx` | 63 | 1 (`story-grid`) | sửa: thêm dạng hàng + dạng lưới |
| `story/story-grid.tsx` | 22 | 4 (`index`, `tags.$tagSlug`, `authors.$username`, `search/search-results`) | có thể đổi cột |
| `story/story-meta.tsx` | 42 | 1 (`stories.$storyKey.index`) | để P5 (hàng số liệu lớn) |
| `story/story-labels.ts` | 14 | 7 | thêm map status → variant nhãn |
| **mới** `components/section-heading.tsx` | — | thay `HomeSection` (`routes/index.tsx:75`) và các `<h2 font-serif>` | tạo |
| **mới** chip (`ui/chip.tsx` hoặc variant của badge) | — | chip thể loại trang chủ (`routes/index.tsx` 59–65, `Badge asChild` + `<a>`) | tạo (chấm `--cover-N` 8px, `aria-hidden`) |
| Tab group / thanh tiến độ | — | P5–P7 mới dùng | YAGNI ở P2, tạo khi phase cần |

### 2. Test liên quan
- `story-cover.test.tsx` (4): `role="img"`, `aria-label="Bìa truyện …"`, **chuỗi `'Kiếm Đạo Độc Tôn</p>'` và `'Lão Mặc</p>'`** (đổi thẻ `<p>` là vỡ), `var(--cover-N)` trong `style`, `<img>` có `srcset` 300w/600w, `width=600 height=900`, `loading`, `fetchPriority`, escape HTML.
- `cover-palette.test.ts`: `coverTitleClass` (13/11/9/7cqw, bản dự phòng `text-xl`). Đổi thang cỡ chữ bìa thì phải sửa test.
- e2e `stories.spec.ts:25,34`: `getByRole('img', {name:'Bìa truyện …'})` + `toContainText(title)`. Chữ cái mờ nằm trong img: textContent vẫn chứa tiêu đề, **qua**.
- e2e `catalog.spec.ts:103`: `link 'Tiên hiệp'.first()` (chip thể loại vẫn phải là `<a>` có tên = tên tag; chấm màu `aria-hidden`).
- e2e `search.spec.ts`: `region 'Truyện'`/`'Tác giả'` lấy tên từ `<h2 id>` qua `aria-labelledby`. Tiêu đề mục mới phải nhận `id` và **không** gộp chữ "Xem tất cả" vào tên region.
- e2e còn lại phụ thuộc tên nút/dialog (16 locator dialog, 7 menu/menuitem). Đổi style không đổi tên, nhưng sau P2 nên chạy toàn bộ e2e.
- **Rủi ro chéo P3:** nút cao 44 + pill padding ở header 360px có thể làm `header-mobile.spec.ts` (không tràn ngang) fail trước khi P3 làm lại header. Placeholder `AccountMenu` `h-9 w-32` (`site-layout.tsx:103`) phải theo chiều cao nút mới để không nhảy layout.

### 3. Cần bảo vệ bằng test
`StoryCover` (bìa chữ: gáy, chữ cái `aria-hidden`, tên img; bìa ảnh: gáy, fallback onError), `StoryCard` (hai dạng: link tên = tiêu đề, nhãn AI/18+, meta), map status → nhãn (`story-labels.ts`), `buttonVariants`/`badgeVariants` (tuỳ chọn: snapshot class), tiêu đề mục (`aria-labelledby` chỉ trỏ h2).

### 4. Trùng lặp / rủi ro
- 15 chỗ `<h2 className="font-serif text-xl font-semibold">` lặp ở `authors.$username`, `settings` ×2, `stories.$storyKey.index` ×2, `chapter-list`, `cover-upload`, `search-results` ×2, `static-page`, `index` (HomeSection). Component tiêu đề mục gom được các chỗ này, nhưng chỉ sửa trong phạm vi phase.
- Không còn chỗ nào dùng `buttonVariants`/`badgeVariants` ngoài `ui/`: đổi biến thể an toàn về type.
- Chỉ 4 chỗ hard-code màu: `bg-black/50` (overlay dialog/sheet), `text-white` (button/badge destructive).
- `StoryCover` có 5 cỡ dùng (48–232px); gáy và padding nên theo `cqw` (đã có `@container`).

### 5. File > 200 dòng
`ui/dropdown-menu.tsx` (225): mã vendor shadcn, chỉ sửa class, không tách.

### 6. i18n (P2)
| Key gợi ý | Giá trị |
| --- | --- |
| `section_see_all` | `Xem tất cả` |

Nhãn trạng thái dùng lại key có sẵn: `story_status_*` (Đang ra/Hoàn thành/Tạm ngưng), `chapter_status_*` (Nháp/Hẹn giờ/Đã đăng/Bị ẩn), `story_card_ai`, `story_card_mature`.

---

## P3: Layout

### 1. Inventory

| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| `components/site-layout.tsx` | 207 | `SiteLayout` + `SiteHeader`, `HeaderSearch`, `AccountMenu`, `SiteFooter` | sửa + **tách** (gợi ý: `site-header.tsx`, `site-account-menu.tsx`, `site-footer.tsx`, `mobile-tab-bar.tsx`); thêm prop ẩn thanh tab |
| `components/auth-ui.tsx` | 70 | `AuthPage` (bọc `SiteLayout`), `TextField`, `SubmitButton`, `FormMessage`, `textLinkClass` | sửa nhẹ (h1 bỏ `font-serif`, form theo input mới) |
| `components/not-found.tsx` | 57 | `NotFoundPage`/`ErrorPage` (bọc `SiteLayout`); đăng ký ở `router.tsx` + `notFoundComponent` của 4 route | sửa style |
| `components/static-page.tsx` | 35 | terms/content-policy | sửa style |
| `routes/__root.tsx` | 75 | shell; `QueryClient` ở shell để `SiteLayout` chạy được trong trang lỗi | thường không đổi ở P3 |
| `e2e/header-mobile.spec.ts` | 101 | 5 lần chạy (360/390 × 2 + tablet 640/768) | giữ; thêm test thanh tab |
| `e2e/layout.spec.ts` | 57 | banner/contentinfo/404 | giữ |
| **mới** `e2e/tab-bar.spec.ts` (hoặc thêm vào header-mobile) | — | hiện ở `<md`, `aria-current`, ẩn ở trang đọc/trang truyện | tạo |

**Route dùng / không dùng site layout**

| Dùng `SiteLayout` (trực tiếp hoặc qua `AuthPage`/`StaticPage`/`NotFoundPage`) | Không dùng |
| --- | --- |
| `index`, `search`, `library`, `settings`, `moderation`, `authors.$username`, `tags.$tagSlug`, `stories.$storyKey.index` (**phải ẩn thanh tab**), `write/index`, `write/stories/new`, `write/stories/$publicId/index`, `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `terms`, `content-policy`, 404/lỗi | `stories.$storyKey.chapter-{$number}` (`.reader-page`, `ReaderNav` fixed), `write/stories/$publicId/chapters/$number` (`WriterGate` + `ChapterEditor` có header sticky riêng), `api/$`, sitemap, robots |

Ẩn thanh tab nên dùng **prop** (`<SiteLayout tabBar={false}>`), không dò path: 404 của route chương cũng render `NotFoundPage` trong `SiteLayout`.

### 2. Test e2e phải giữ
- `layout.spec`: `banner` hiện; `contentinfo` chứa "Novel Hub"; link "Đăng nhập"/"Đăng ký" **trong banner**; 404 trả status 404, heading "Không tìm thấy trang", link "Về trang chủ" href `/`.
- `header-mobile.spec` (360, 390): không tràn ngang (`scrollWidth ≤ clientWidth`) ở `/` và trang chương; trong banner có link "Tìm kiếm" href `/search`, "Đăng nhập", "Đăng ký"; nút `Tài khoản: {LONG_NAME}` (tên đúng chuỗi, hiện tại = sr-only "Tài khoản: " + span truncate); menu có menuitem "Viết truyện", "Tủ truyện", "Cài đặt", "Đăng xuất"; bấm "Viết truyện" thì tới `/write`. Ở 640/768: nút tài khoản hiện, không tràn.
- `search.spec:104`: `searchbox 'Tìm kiếm'` ở header desktop (viewport Playwright mặc định 1280×720), gõ Enter thì tới `/search?q=`.
- `library.spec:103`: `menuitem 'Tủ truyện'` (desktop).
- Footer: link "Điều khoản" `/terms`, "Quy định nội dung"; `nav aria-label="Thông tin"`.
- Không e2e nào dùng locator `link` không giới hạn vùng với tên "Trang chủ/Khám phá/Tủ truyện/Viết/Tôi", nên thanh tab không gây lỗi strict-mode ở các test hiện có. Logo mới (ô chữ "N") phải `aria-hidden` để tên link logo vẫn là "Novel Hub".

### 3. Cần bảo vệ bằng test
Thanh tab: `nav "Điều hướng chính"`, 5 link, `aria-current="page"` đúng tab (`/` cần `activeOptions.exact`; `/library` có search params `shelf,page` nên cần `includeSearch:false`), ẩn ở ≥ md, ẩn ở trang truyện/đọc/editor, tab "Tôi" (khách `/sign-in`, đã đăng nhập `/settings`). Header: tên nút tài khoản, link tìm kiếm mobile, searchbox desktop. Không tràn ngang 360px khi có thanh tab.

### 4. Rủi ro
- **Cache CDN:** HTML SSR phải giống nhau cho mọi người. Tab "Tôi" phụ thuộc phiên, nên SSR render bản khách (hoặc placeholder) rồi đổi sau `useMe()`, giống `AccountMenu`. `aria-current` theo path thì ổn (cùng URL cùng HTML).
- Link công khai dùng `reloadDocument`/`<a>` để lấy HTML từ CDN; thanh tab phải theo cùng quy ước.
- Thanh tab fixed đáy cao 72 + `env(safe-area-inset-bottom)`: `main` cần `pb` ở `<md` để không che footer/nội dung; 5 tab × 72px = 360px vừa khít khung 360.
- Header hiện `max-w-5xl`, `h-14`; thiết kế là 1240/76px. Nút settings `lg:inline-flex` hiện có không còn trong §5 (nav chỉ gồm Tủ truyện, Viết truyện). Tháo đi thì "Cài đặt" vẫn còn trong menu tài khoản (e2e kiểm ở đó).
- `AccountMenu` hiện chữ đầy đủ + chevron; thiết kế là nút tròn 42px chữ cái đầu. Tên truy cập vẫn phải đúng `Tài khoản: {displayName}` (dùng sr-only như hiện tại, chữ cái đầu `aria-hidden`).

### 5. File > 200 dòng
`site-layout.tsx` (207): tách bắt buộc. Các route `settings.tsx` (207), `moderation.tsx` (203) dùng `SiteLayout` nhưng P3 không phải sửa.

### 6. i18n (P3)
| Key gợi ý | Giá trị | Ghi chú |
| --- | --- | --- |
| `layout_main_nav` | `Điều hướng chính` | aria-label thanh tab |
| `nav_home` | `Trang chủ` | **đã có** (dòng 53, hiện không dùng ở đâu) |
| `nav_explore` | `Khám phá` | mới |
| `layout_library` | `Tủ truyện` | dùng lại |
| `nav_write` | `Viết` | mới (khác `layout_write` "Viết truyện") |
| `nav_me` | `Tôi` | mới |

Dùng lại: `app_name`, `layout_search`, `layout_search_placeholder`, `layout_sign_in/up`, `layout_account_menu`, `layout_write`, `layout_settings`, `layout_moderation`, `layout_sign_out`, `layout_footer_copyright`, `layout_footer_nav`, `layout_terms`, `layout_content_policy`, `notfound_*`, `error_page_*`.

---

## Câu hỏi mở
1. Tiêu đề UI đang dùng `font-serif` (38 chỗ): P1/P2 đổi hàng loạt sang sans 800, hay để từng phase trang tự đổi (giữa chừng tiêu đề sẽ là Source Serif)?
2. Ẩn thanh tab trên trang truyện ngay ở P3 (khi trang truyện chưa có CTA dính đáy, phải tới P5) hay đợi P5?
3. Nhấn theo preset đọc: chấp nhận token `--reader-primary*` scope trong `.reader-page` thay cho ghi đè `--primary` trong `[data-reader-theme]` (lý do: phát hiện 1)?

**Status:** DONE_WITH_CONCERNS
**Summary:** Đã scout xong inventory, test, rủi ro và i18n cho P1–P3. Có 3 rủi ro chính: ghi đè `--primary` theo preset sẽ lan ra toàn site vì `data-reader-theme` nằm trên `<html>` ở mọi trang; map font cũ phải làm ở cả boot script, reader.css và Zod, và `me.int.test.ts` sẽ vỡ; `font-serif` đang dùng cho 38 tiêu đề.
