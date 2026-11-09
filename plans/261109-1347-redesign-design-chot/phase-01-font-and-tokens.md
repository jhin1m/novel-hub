---
phase: 1
title: "Font và token màu"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Font và token màu

**Status:** pending

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`, monorepo TypeScript (TanStack Start, Hono, Drizzle). Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, sau khi sửa chạy `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- Không đổi schema DB, Docker, env, CI. Không gradient, không nền tím, không serif hay chữ nghiêng ở giao diện.
- Brief: `plans/reports/brief-261109-1347-redesign-design-chot-report.md`.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Đổi font giao diện sang Be Vietnam Pro, chỉ khai báo tên font qua `--font-ui`. Bỏ tông tím ở `--cover-7`, `--cover-8`. Thêm giai đoạn mới vào spec để các phase sau đánh checkbox.

## Requirements

- `@fontsource/be-vietnam-pro` 5.3.0 (pin đúng version, user đã đồng ý) thay `@fontsource-variable/plus-jakarta-sans`. Weight 400, 500, 600, 700, 800.
- `body` đổi từ `font-medium` sang `font-normal` (board dùng 15px/400). Trang đọc giữ weight cũ: `.reader-page { font-weight: 500; }` trong `reader.css`; `.reader-column` vẫn 400.
- Source Serif 4 chỉ còn cho nội dung chương. Giới thiệu truyện chuyển sang font giao diện. Trang đọc không đổi gì ngoài nhãn font; editor và xem trước revision giữ serif vì là nội dung chương.
- `--cover-7`, `--cover-8` không còn tím, đạt ≥ 5:1 với `--cover-fg`. Số màu giữ nguyên để slot của tag không đổi.

## Key Insights

- Import `NNN.css` đầy đủ, không dùng `vietnamese-500.css` lẻ vì file lẻ không có `unicode-range`. Trình duyệt tự lọc nên `latin-ext` gần như không tải.
- Package có export `./files/*`, nên `?url` như các font hiện tại dùng được.
- Preload 170 KB cho 5 weight sẽ cạnh tranh LCP; chỉ preload 400 và 700, mỗi weight 2 subset.
- Sau khi giới thiệu truyện sang sans, trang chủ và trang truyện không còn dùng Source Serif, nên preload serif phải rời `__root` về route đọc. `e2e/layout.spec.ts` đang đếm đúng 4 preload ở trang chủ: vẫn là 4, đổi tên file. Editor mất preload serif, chấp nhận vì là trang riêng tư và font vẫn tải bằng `swap`.

## Related Code Files

| File | Việc | Cỡ | Test bị ảnh hưởng |
|------|------|----|--------------------|
| `apps/web/package.json`, `pnpm-lock.yaml` | Thêm package mới, gỡ package cũ | nhỏ | |
| `apps/web/src/styles/app.css` | 5 import, sửa comment, `body` `font-normal`, comment dòng ~134 | nhỏ | |
| `apps/web/src/styles/tokens.css` | `--font-ui`, `--cover-7`, `--cover-8` | nhỏ | `tokens.test.ts` (11) |
| `apps/web/src/styles/token-values.ts` | Hai màu bìa mới | nhỏ | `tokens.test.ts` |
| `apps/web/src/routes/__root.tsx` | `PRELOAD_FONTS` chỉ còn 4 file UI | nhỏ | `e2e/layout.spec.ts` |
| `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx` | Thêm preload 2 file Source Serif vào `head` | nhỏ | |
| `apps/web/src/components/story/story-synopsis.tsx` | Bỏ `font-serif` | 1 dòng | |
| `packages/shared/messages/vi.json` | `reader_settings_font_plus_jakarta_sans`: "Be Vietnam Pro" | 1 dòng | |
| `apps/web/src/styles/reader.css` | Thêm weight 500 cho `.reader-page`, sửa comment dòng 35 | nhỏ | |
| `apps/web/e2e/layout.spec.ts:38-41,59` | 4 preload đều là Be Vietnam Pro, bỏ Source Serif khỏi trang chủ | nhỏ | |
| `apps/web/e2e/layout-polish.spec.ts:190` | `"Be Vietnam Pro` | 1 dòng | |
| `docs/project-spec.md` mục 5 | Thêm giai đoạn và 9 checkbox | nhỏ | |

Giữ nguyên: khóa `plus-jakarta-sans` trong `packages/shared/src/schemas/reader.ts`, `LEGACY_READER_FONTS`, selector trong `reader.css`; chúng trỏ về `--font-ui` nên tự thành Be Vietnam Pro.

## Implementation Steps

1. `docs/project-spec.md` mục 5, sau "Giai đoạn R", thêm "### Giai đoạn RD: Đưa design đã chốt vào code (user chốt 2026-11-09)", dòng nguồn trỏ brief, 9 checkbox `[ ]` trùng tên 9 phase trong `plan.md`.
2. Sửa `package.json` rồi `pnpm install`.
3. Trong `app.css`, thay import Plus Jakarta bằng `@fontsource/be-vietnam-pro/{400,500,600,700,800}.css`, sửa comment đầu file.
4. `tokens.css`: `--font-ui: 'Be Vietnam Pro', system-ui, sans-serif;`. Đây là nơi duy nhất ghi tên font trong CSS.
5. `--cover-7: #a8431f` (đất nung, 5,35:1), `--cover-8: #5c5346` (nâu đá, 6,71:1). Sửa cả `token-values.ts`.
6. `__root.tsx`: import `@fontsource/be-vietnam-pro/files/be-vietnam-pro-{latin,vietnamese}-{400,700}-normal.woff2?url`, `PRELOAD_FONTS` chỉ còn 4 file này. Sửa comment.
7. Route đọc chương: trong `head` thêm `links` preload 2 file Source Serif (cùng `as`, `type`, `crossOrigin` như `__root`). Merge với kết quả của `seo()`, không ghi đè `meta`.
8. `grep -rn "font-black\|font-light\|font-thin\|font-extralight" apps/web/src`: weight 900, 300 trở xuống không còn file; đổi sang 800 hoặc 400 nếu có.
9. Sửa nhãn trong `vi.json`, `pnpm i18n:compile`. Sửa e2e.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | Trang chủ preload đúng 4 file Be Vietnam Pro, có `crossorigin` | `e2e/layout.spec.ts` |
| Critical | Trang đọc preload 2 file Source Serif, trang chủ thì không | thêm vào `e2e/layout.spec.ts` |
| High | Chữ giao diện computed `"Be Vietnam Pro` | `e2e/layout-polish.spec.ts` |
| High | Mọi `--cover-N` đạt AA với `--cover-fg` | `tokens.test.ts` (đã có) |

## Interface Checklist

- [ ] `PRELOAD_FONTS` (`__root.tsx`)
- [ ] `--font-ui`, `--cover-7`, `--cover-8`
- [ ] `TOKEN_VALUES.cover` (`token-values.ts`)

## Dependency Map

Không phụ thuộc phase nào. Mọi phase sau dùng font và checkbox spec được thêm ở đây.

## Success Criteria

- [ ] Không còn `plus-jakarta-sans` trong `package.json` và lockfile; `grep -rn "Plus Jakarta" apps/web/src` không ra kết quả ngoài nhãn cũ đã đổi
- [ ] Tên font chỉ xuất hiện ở `--font-ui` trong CSS
- [ ] Trang đọc giữ bố cục, cột chữ, weight; chữ giao diện theo `--font-ui`, nhãn font trong bảng cài đặt là "Be Vietnam Pro"
- [ ] Gate xanh

## Risk Assessment

- Đổi font đổi chiều rộng chữ, có thể làm tràn header 768px: `e2e/layout.spec.ts` có test không cuộn ngang, chạy lại.
- FOUT lâu hơn vì font tĩnh: giữ `font-display: swap` mặc định.
