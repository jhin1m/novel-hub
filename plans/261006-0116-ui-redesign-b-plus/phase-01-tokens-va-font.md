---
phase: 1
title: "Tokens và font"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Tokens và font

## Overview

Đổi bảng màu sang B+ (nền ngà ấm, thẻ trắng, nhấn mòng két), thêm token mới (`--primary-soft`, `--band`, `--warning-soft`, `--warning-foreground`, `--reader-card`, `--reader-primary*`), thang bo góc mới, thay font giao diện/nội dung bằng Plus Jakarta Sans + Source Serif 4, đổi enum font trang đọc kèm map giá trị cũ. Không đổi bố cục trang nào.

Nguồn: brainstorm cuối §2, §3, §8 (phần e2e được phép sửa); scout-01 mục P1; research-01 §1–3 (bỏ khuyến nghị map `inter → source-serif-4` và "giữ `ring-ring/70`" của research, theo quyết định [auto] trong `plan.md`).

## Requirements

- Giá trị màu đúng bảng brainstorm §2.1 (light/dark), §2.2 (`--cover-fg: #f6f1e7`), §2.3 (6 preset + `--reader-card`).
<!-- Updated: Red Team 2026-10-06 - --reader-card cho trạng thái không preset -->
- `--reader-card` khai báo cả ở `:root` light (`#f3ecdd`, giá trị ngà) và `:root` dark (`#363636`, giá trị xám tối), trong cả `tokens.css` lẫn `token-values.ts` light/dark. Lý do: không chọn preset = theo OS (brainstorm §2.3: light → ngà, dark → xám tối); boot script bỏ `data-reader-theme` khi không có theme (`lib/boot-script.ts:43`), "Khôi phục mặc định" cũng vậy (`lib/reader/use-reader-settings.ts:119`) → mọi khách và mọi e2e đọc ở trạng thái này; thiếu biến thì rail, pill "Chương N", khối lời nhắn mất nền.
- Nhấn khu đọc: token `--reader-primary`, `--reader-primary-foreground`, `--reader-primary-soft` khai báo ở `:root` light (bộ light), `:root` dark (bộ dark) và từng `[data-reader-theme]` (white/ivory/sepia/soft-green → light `#0e6b5b`/`#ffffff`/`#ddefea`; dark-gray/oled-black → dark `#4fc2a8`/`#0b1f1a`/`#17332c`). **Không** đặt `--primary` trong `[data-reader-theme]`.
- `.reader-page` (trong `reader.css`) ánh xạ lại: `--primary: var(--reader-primary)`, `--primary-foreground: var(--reader-primary-foreground)`, `--primary-soft: var(--reader-primary-soft)`, `--ring: var(--reader-primary)`. Sheet portal ra ngoài `.reader-page` nên vẫn dùng token site.
- Mọi cặp tương phản §2.4 + cặp khu đọc (`READER_CONTRAST_PAIRS`) đạt ngưỡng ở **mọi** scope (`light`, `dark`, `reader:*`); scope `light`/`dark` chính là trạng thái mặc định không preset.
- Font: `READER_FONTS = ['source-serif-4', 'literata', 'noto-serif', 'plus-jakarta-sans']`, mặc định `source-serif-4`; giá trị cũ `be-vietnam-pro`, `inter` → `plus-jakarta-sans` ở cả Zod, `BOOT_SCRIPT`, `reader.css`.
- `userPreferencesSchema.reader` (`.optional().catch(undefined)`, `packages/shared/src/schemas/preferences.ts`) không được bỏ khối cài đặt có font cũ.
- Preload đúng 4 file; Literata, Noto Serif chỉ tải khi người đọc chọn (người đã lưu `literata` từ trước vẫn tải Literata: chấp nhận, xem dòng Reject trong `plan.md` Red Team).
<!-- Updated: Red Team 2026-10-06 - body 15/500 -->
- Thân chữ giao diện: `body` 15px / 500 (brainstorm §3: body 15/500). Chỉ đặt cho `body` trong `app.css`; không khai báo thang `--text-*` (các phase sau dùng class cỡ chữ trực tiếp như hiện tại). Khu đọc (`--reader-font-size`) và editor (`text-lg`/class riêng) không bị ảnh hưởng vì có cỡ chữ riêng.
- Không thêm dependency nào ngoài 2 package font; pin `5.3.0` chính xác như các font hiện có.

## Architecture

```
tokens.css (nguồn chuẩn hex)  ⇄  token-values.ts (bản sao TS)  →  tokens.test.ts (parity chuỗi + contrast theo scope)
                                        └─ token-contrast-pairs.ts (mới: CONTRAST_PAIRS, READER_CONTRAST_PAIRS, COVER_CONTRAST_PAIRS)
app.css @theme inline: --color-* (thêm primary-soft, band, warning-*, reader-card, reader-primary*), --radius-xs..2xl, --font-sans/serif
reader.css: :root[data-reader-font=…] → --reader-font; .reader-page remap --primary/--ring → --reader-primary*
shared/schemas/reader.ts: LEGACY_READER_FONTS + migrateLegacyReaderFont() → z.preprocess(…, z.enum(READER_FONTS))
boot-script.ts: nhúng LEGACY_READER_FONTS (JSON) → map trước khi kiểm allowlist
```

Luồng dữ liệu font: localStorage `nh:reader` / `users.preferences.reader` → (boot: map alias → allowlist → `data-reader-font`) và (React: `readerSettingsSchema` preprocess → enum) → cùng giá trị `plus-jakarta-sans`, không nháy.

## Related Code Files

- **Modify:** `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/styles/{tokens.css,token-values.ts,tokens.test.ts,app.css,reader.css}`, `apps/web/src/routes/__root.tsx`, `apps/web/src/lib/{boot-script.ts,boot-script.test.ts}`, `apps/web/src/lib/reader/settings.test.ts`, `apps/web/src/components/reader/reader-settings-sheet.tsx` (chỉ `FONT_LABELS`), `packages/shared/src/schemas/{reader.ts,reader.test.ts,preferences.test.ts}`, `packages/api/src/routes/me.int.test.ts`, `packages/shared/messages/vi.json`, `apps/web/e2e/layout.spec.ts`
- **Create:** `apps/web/src/styles/token-contrast-pairs.ts`
- **Delete:** không

## File inventory

| Path | Dòng hiện tại | Việc |
| --- | --- | --- |
| `apps/web/src/styles/tokens.css` | 127 | giá trị mới light/dark/preset, token mới (gồm `--reader-card` ở `:root` light/dark), `--cover-fg`, font vars (`--font-reader-literata` mới, bỏ `--font-reader-inter`), bỏ `--radius`, sửa comment "terracotta" |
| `apps/web/src/styles/token-values.ts` | 130 | giá trị mới; `light`/`dark` thêm `--reader-card`; `reader[preset]` thêm `--reader-card`, `--reader-primary*`; chuyển các mảng cặp sang file mới để < 200 dòng |
| `apps/web/src/styles/token-contrast-pairs.ts` | mới | `CONTRAST_PAIRS` (§2.4), `READER_CONTRAST_PAIRS`, `COVER_CONTRAST_PAIRS` |
| `apps/web/src/styles/tokens.test.ts` | 78 | import cặp từ file mới; kiểm thêm `READER_CONTRAST_PAIRS` ở mọi scope |
| `apps/web/src/styles/app.css` | 122 | import font (dòng 9–17), `@theme inline` màu mới + radius (dòng 49–52), comment dòng 5–8, `body` 15/500 (dòng 60–61) |
| `apps/web/src/styles/reader.css` | 117 | `data-reader-font` (dòng 28–39), remap nhấn trong `.reader-page` (dòng 14) |
| `apps/web/src/routes/__root.tsx` | 75 | 4 import `?url` + `PRELOAD_FONTS` (dòng 5–21) |
| `apps/web/src/lib/boot-script.ts` | 57 | map alias font trong chuỗi `BOOT_SCRIPT` |
| `apps/web/src/lib/boot-script.test.ts` | 143 | fixture `font:'inter'` (dòng ~67), dòng 119 `'literata'` → `'source-serif-4'`, thêm fixture legacy |
| `apps/web/src/lib/reader/settings.test.ts` | 75 | dòng 21–25: `inter` → kỳ vọng `plus-jakarta-sans` |
| `packages/shared/src/schemas/reader.ts` | 105 | enum, `LEGACY_READER_FONTS`, preprocess, `DEFAULT_READER_SETTINGS.font` |
| `packages/shared/src/schemas/reader.test.ts` | 130 | test enum mới + map legacy |
| `packages/shared/src/schemas/preferences.test.ts` | ~50 | case `reader.font: 'inter'` không bị drop |
| `packages/api/src/routes/me.int.test.ts` | — | dòng 94 `font: 'inter'` → `'plus-jakarta-sans'` |
| `apps/web/src/components/reader/reader-settings-sheet.tsx` | 244 | chỉ `FONT_LABELS` dòng 37–42 (không tách ở phase này; tách ở phase 7) |
| `packages/shared/messages/vi.json` | 478 | dòng 258–261 font labels |
| `apps/web/e2e/layout.spec.ts` | 57 | test preload (dòng 26–42), test font tuỳ chọn (dòng 44–57) |
| `apps/web/package.json` | 53 | +2 font, −2 font |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| Mọi `--x: #hex;` trong TS có nguyên văn trong CSS; đủ 10 `--cover-N`, 6 preset | unit | `styles/tokens.test.ts` | giữ |
| Cặp §2.4 (background/foreground … card/ring) đạt ngưỡng ở light, dark | unit | `styles/tokens.test.ts` | sửa |
| <!-- Updated: Red Team 2026-10-06 - chạy cặp khu đọc ở mọi scope --> Mọi scope (`light`, `dark`, `reader:*`): reader-bg/fg, bg/muted, card/fg, card/muted, bg/reader-primary, card/reader-primary, reader-primary/-foreground, reader-primary-soft/reader-primary ≥ 4.5; biến thiếu = vi phạm (`lib/contrast.ts:39`) | unit | `styles/tokens.test.ts` | mới |
| 10 cover vs `--cover-fg #f6f1e7` ≥ 4.5 | unit | `styles/tokens.test.ts` | giữ |
| Enum mới parse được; `comic-sans` bị từ chối | unit | `shared/schemas/reader.test.ts` | sửa |
| `be-vietnam-pro`, `inter` → `plus-jakarta-sans`; `toString` (khoá prototype) bị từ chối | unit | `shared/schemas/reader.test.ts` | mới |
| Prefs lưu `reader.font: 'inter'` → giữ khối reader, font `plus-jakarta-sans` | unit | `shared/schemas/preferences.test.ts` | mới |
| Boot script ↔ `applyReaderSettings` parity, có fixture `inter`/`be-vietnam-pro`; chuỗi < 1536 ký tự | unit | `lib/boot-script.test.ts` | sửa |
| `parseStoredSettings` map font cũ | unit | `lib/reader/settings.test.ts` | sửa |
| PATCH prefs round-trip | int | `packages/api/src/routes/me.int.test.ts` | sửa fixture |
| HTML `/` preload 4 file `plus-jakarta-sans-*`/`source-serif-4-*-wght-normal`, có `crossorigin` | e2e | `e2e/layout.spec.ts` | sửa |
| `/` tải `plus-jakarta-sans`, không tải `literata`/`noto-serif` | e2e | `e2e/layout.spec.ts` | sửa |
| Reset về 19px, `--reader-column` 60ch/68ch | e2e | `e2e/reader-settings.spec.ts` | giữ |

## Function/interface checklist

- [ ] `READER_FONTS` (enum mới, thứ tự như Requirements), `type ReaderFont`
- [ ] `LEGACY_READER_FONTS: Readonly<Record<string, ReaderFont>>` (export, dùng chung Zod + boot)
- [ ] `migrateLegacyReaderFont(value: unknown): unknown` (dùng `Object.hasOwn`)
- [ ] `readerSettingsSchema.font = z.preprocess(migrateLegacyReaderFont, z.enum(READER_FONTS))`
- [ ] `DEFAULT_READER_SETTINGS.font = 'source-serif-4'`
- [ ] `BOOT_SCRIPT` map alias trước `indexOf`
- [ ] `TOKEN_VALUES`, `resolvedScopes()` (preset mang theo `--reader-*` mới), `CONTRAST_PAIRS`, `READER_CONTRAST_PAIRS`, `COVER_CONTRAST_PAIRS`
- [ ] `PRELOAD_FONTS` (4 phần tử)

## Dependency map

- **Cần từ trước:** không.
- **Phase sau dùng:** P2 (`bg-card`, `bg-primary-soft`, `bg-warning-soft`, `text-warning-foreground`, radius `xs..2xl`, `--cover-fg`), P3 (`font-serif` = Source Serif cho ô logo), P4 (`bg-band`), P6 (`--reader-card`, remap nhấn `.reader-page`), P7 (enum font cho nút chọn font), P8/P10 (`--band`, `--warning-*`), P12 (tài liệu token).

## Implementation Steps

1. `pnpm --filter @novel-hub/web add -E @fontsource-variable/plus-jakarta-sans@5.3.0 @fontsource-variable/source-serif-4@5.3.0`; `pnpm --filter @novel-hub/web remove @fontsource/be-vietnam-pro @fontsource-variable/inter`. Xác nhận file tồn tại: `ls apps/web/node_modules/@fontsource-variable/{plus-jakarta-sans,source-serif-4}/files | grep -E '(latin|vietnamese)-wght-(normal|italic)'`.
2. `packages/shared/src/schemas/reader.ts`: enum mới; thêm `LEGACY_READER_FONTS = { 'be-vietnam-pro': 'plus-jakarta-sans', inter: 'plus-jakarta-sans' }` và `migrateLegacyReaderFont`; `font: z.preprocess(migrateLegacyReaderFont, z.enum(READER_FONTS))`; mặc định `source-serif-4`; sửa comment nếu nhắc font cũ. Kiểm `packages/shared/src/index.ts` đã re-export (nếu export liệt kê tên thì thêm `LEGACY_READER_FONTS`).
3. Test shared: `reader.test.ts`, `preferences.test.ts` theo ma trận. Chạy `pnpm --filter @novel-hub/shared test`.
4. `lib/boot-script.ts`: thêm `A=${JSON.stringify(LEGACY_READER_FONTS)}` vào chuỗi, trong vòng enum: `v=r[k];if(k==='font'&&A.hasOwnProperty(v))v=A[v];`. Cập nhật docblock. `boot-script.test.ts`: fixture legacy + dòng 119 + giữ assert độ dài < 1536.
5. `lib/reader/settings.test.ts` dòng 21–25. Kiểm `field(shape.font, …)` trong `settings.ts` vẫn typecheck với preprocess (input type `unknown`); nếu không, gọi `readerSettingsSchema.shape.font.safeParse` như cũ — không sửa logic khác.
6. `tokens.css`: viết lại khối `:root`, `@media (prefers-color-scheme: dark) :root`, 6 `[data-reader-theme]` theo bảng §2.1/§2.3 + token nhấn khu đọc + `--reader-card` ở `:root` light/dark (hex chữ thường, một khai báo một dòng); `--cover-fg: #f6f1e7`; `--font-ui: 'Plus Jakarta Sans Variable', system-ui, sans-serif`; `--font-content: 'Source Serif 4 Variable', Georgia, serif`; `--font-reader-literata: 'Literata Variable', Georgia, serif`; giữ `--font-reader-noto-serif`; bỏ `--font-reader-inter`, `--radius`. Comment đầu file: nhấn mòng két.
7. `token-values.ts` khớp từng giá trị; tạo `token-contrast-pairs.ts` (chuyển `CONTRAST_PAIRS`, `COVER_CONTRAST_PAIRS`, thêm `READER_CONTRAST_PAIRS`); sửa import ở `tokens.test.ts`. Thêm cặp §2.4: card/muted-foreground, secondary/muted-foreground, band/foreground, band/muted-foreground, card/primary, primary-soft/primary, primary-soft/foreground, card/destructive, warning-soft/warning-foreground, card/input (3), card/ring (3).
8. `app.css`: thay import font (giữ literata `wght` + `wght-italic`, noto-serif); thêm `--color-primary-soft`, `--color-band`, `--color-warning-soft`, `--color-warning-foreground`, `--color-reader-card`, `--color-reader-primary`, `--color-reader-primary-foreground`, `--color-reader-primary-soft`; radius `--radius-xs: 6px; --radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-xl: 24px; --radius-2xl: 28px`; `body` thêm `text-[15px] font-medium`. Comment dòng 5–8: font tuỳ chọn là Literata/Noto Serif.
9. `reader.css`: `:root[data-reader-font='literata'] { --reader-font: var(--font-reader-literata) }`; `plus-jakarta-sans`, `be-vietnam-pro`, `inter` → `var(--font-ui)` (hai cái sau ghi comment "giá trị cũ còn lưu ở máy"); `source-serif-4` dùng mặc định `--font-content`. Thêm remap nhấn vào `.reader-page`.
10. `__root.tsx`: thay 4 import `?url` (`plus-jakarta-sans-{latin,vietnamese}-wght-normal.woff2`, `source-serif-4-{latin,vietnamese}-wght-normal.woff2`), sửa comment.
11. `reader-settings-sheet.tsx` `FONT_LABELS` 4 khoá mới; `vi.json`: thêm 2 key, xoá 2 key; `pnpm i18n:compile`.
12. `me.int.test.ts:94` → `'plus-jakarta-sans'`.
13. `layout.spec.ts`: danh sách preload mới; test font tuỳ chọn đổi tên "(Literata, Noto Serif)", kỳ vọng tải `plus-jakarta-sans`, không tải `/literata|noto-serif/`.
14. Chạy `pnpm test:e2e -- header-mobile layout` sớm (body 15/500 đổi bề rộng chữ header), rồi gate.

## Accessible name phải giữ

`banner`, `contentinfo`; dialog "Cài đặt hiển thị", slider "Cỡ chữ", nút "Khôi phục mặc định", radio preset ("Sepia", "Xám tối", "Đen OLED", "Hẹp"); `data-reader-theme`, `data-reader-width`, `--reader-font-size` (19px khi reset), `--reader-column` (60ch hẹp desktop, 68ch mobile), script inline áp trước khi vẽ.

## i18n

| Key | Giá trị |
| --- | --- |
| `reader_settings_font_source_serif_4` (mới) | Source Serif 4 |
| `reader_settings_font_plus_jakarta_sans` (mới) | Plus Jakarta Sans |
| `reader_settings_font_be_vietnam_pro`, `reader_settings_font_inter` | xoá |

## Success Criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] `apps/web/package.json` chỉ còn 4 package font: literata, noto-serif, plus-jakarta-sans, source-serif-4 (pin `5.3.0`)
<!-- Updated: Red Team 2026-10-06 - tiêu chí grep loại fixture test -->
- [ ] `rg -n 'be-vietnam-pro|Be Vietnam|Inter Variable|a8432a|terracotta' apps/web/src packages/shared/src --glob '!*.test.ts'` chỉ còn: khai báo alias legacy trong `packages/shared/src/schemas/reader.ts` (`LEGACY_READER_FONTS`) và selector giá trị cũ trong `apps/web/src/styles/reader.css` (có comment). Fixture legacy trong `*.test.ts` (`boot-script.test.ts`, `settings.test.ts`, `reader.test.ts`, `preferences.test.ts`) **phải giữ** (chứng minh map)
- [ ] `rg -n -- '--reader-card' apps/web/src/styles/tokens.css` có trong `:root` light, `:root` dark và 6 preset
- [ ] `grep -n "\-\-primary:" apps/web/src/styles/tokens.css` chỉ nằm trong `:root` light/dark
- [ ] Mọi file code đụng tới ≤ 200 dòng (trừ `reader-settings-sheet.tsx` giữ 244, tách ở phase 7)

## Risk Assessment

| Rủi ro | Khả năng × tác động | Giảm thiểu |
| --- | --- | --- |
| Test token chỉ so chuỗi, đặt hex nhầm khối vẫn qua | M × M | token nhấn khu đọc đưa vào `reader[preset]` để contrast test theo preset bắt được; tự soát khối dark/preset |
| `z.preprocess` đổi input type thành `unknown`, `hc` client/`field()` lỗi type | L × M | bước 5 kiểm typecheck; output type không đổi |
| Bo góc `md` 6 → 12px đổi ngay 27 chỗ `rounded-md` | H × L | chấp nhận (thiết kế muốn), không test nào kiểm bo góc |
| Tiêu đề UI còn `font-serif` (= Source Serif) tới khi phase sở hữu file đổi (2–11) | H × L | chấp nhận: không test nào kiểm font tiêu đề, branch overnight; mỗi phase trang đổi trong file của mình, phase 11 quét nốt (red team #3) |
| `body` 15/500 làm chữ header rộng/hẹp khác, tràn ngang 360 | L × M | bước 14 chạy `header-mobile` sớm; Plus Jakarta Sans hẹp hơn Be Vietnam Pro (đo: "Đăng nhập" 70 vs 74px) |
| Tên file font trong package khác dự kiến | L × H | bước 1 `ls` xác nhận trước khi sửa `__root.tsx` |

**Rollback:** revert các file trên + `pnpm install` lại lockfile cũ; không có migration. Khi đã deploy production: Cloudflare "Purge Everything" sau khi web (mới hoặc bản rollback) healthy, vì HTML cache trỏ asset/font đã đổi hash (bước vận hành ghi vào tài liệu ở phase 12).

## Ngoài phạm vi phase

Không đổi component (`ui/*`), không bỏ `font-serif` ở tiêu đề (mỗi phase trang tự làm), không đổi bố cục reader settings (phase 7), không sửa docs (phase 12), không khai báo thang `--text-*`.
