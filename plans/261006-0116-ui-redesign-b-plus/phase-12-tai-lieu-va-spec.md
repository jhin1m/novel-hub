---
phase: 12
title: "Tài liệu và spec"
status: completed
priority: P2
effort: "0.25d"
dependencies: [11]
---

# Phase 12: Tài liệu và spec

## Overview

<!-- Updated: Red Team 2026-10-06 - phase mới tách từ trang phụ cũ: chỉ tài liệu -->
Chỉ sửa tài liệu (tiếng Việt), không đổi code: thêm hàng "Font" ở spec §2 và sửa §8 theo B+ (gồm dòng `project-spec.md:280`), viết lại `docs/design-guidelines.md` khớp code đã làm ở phase 1–11, thêm bước purge CDN sau deploy/rollback đổi asset vào tài liệu deploy hiện có. Không đánh `[x]` checkbox nào trong spec (plan không ứng checkbox).

Nguồn: brainstorm §7 (sửa spec), §2–§5, §8; scout-03 mục P9.7 (bảng dòng docs); red team #15 (purge CDN, thang chữ chỉ ghi phần đã làm), security F5.

## Requirements

- **`docs/project-spec.md`** (đã kiểm số dòng lúc lập plan; grep lại khi cook):
  - §2: thêm hàng **Font** sau dòng 36 (hàng "UI styling"): `@fontsource-variable/plus-jakarta-sans` (giao diện), `@fontsource-variable/source-serif-4` (nội dung), `@fontsource-variable/literata`, `@fontsource-variable/noto-serif` (tuỳ chọn trang đọc); self-host, subset tiếng Việt.
  - §8 theo brainstorm §7: dòng 246 (hướng "ấm, như một ứng dụng đọc"; hero trang chủ là truyện nổi bật mới, nhãn "Mới đáng chú ý", không phải banner), 250 (nền ngà ấm + thẻ trắng, một nhấn mòng két; light/dark theo OS), 251 (Source Serif 4 nội dung / Plus Jakarta Sans giao diện), 253 (bo góc mềm, nút/chip viên, bóng chỉ ở bìa nổi + lớp nổi; vẫn không gradient), 263 (Source Serif 4 mặc định, Literata, Noto Serif, Plus Jakarta Sans; **giữ** câu "Font khác mặc định chỉ tải khi người đọc chọn" — phase 7 làm đúng), 267 (thanh điều hướng thêm tên truyện nhỏ + thanh tiến độ mảnh; < 1024px thanh trên + thanh dưới, ≥ 1024px rail; cài đặt ≥ 1024px là panel phải), 273–275 (bìa gáy sách + chữ cái mờ; chip thể loại, hero, dải `--band`, thanh tab 5 mục; trang truyện dải màu tag + nút đọc dính đáy mobile), 268 (cuối chương theo thứ tự: lời nhắn tác giả → nút "Chương tiếp" thật to → "Chương trước"; bình luận ở Giai đoạn 2) <!-- Updated: Validation Session 2 - thêm dòng 268 -->, 279–280 (giữ ý + "/write có dải số liệu nhỏ; dashboard đầy đủ ở Giai đoạn 2"). Không đổi ý ngắt cảnh (trang đọc giữ `* * *`).
  - Không đánh/bỏ `[x]` checkbox nào.
- **`docs/design-guidelines.md`** (108 dòng) viết lại theo code thật (đối chiếu `apps/web/src/styles/{tokens.css,app.css,reader.css}` sau phase 11, file tokens là chuẩn khi lệch):
  - Nguồn: Mockup = canvas `https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo` (trang "Vòng 3 · B+ đã chốt").
  - Nguyên tắc B+; bảng token §2.1 (`--primary-soft`, `--band`, `--warning-soft/-foreground`, `--card` tách nền); khu đọc 6 preset + `--reader-card` (có cả ở trạng thái không preset) + `--reader-primary*` (chỉ trong `.reader-page`; màn 18+ nằm ngoài, dùng token site).
  - Font + preload (4 file Plus Jakarta Sans + Source Serif 4; Literata/Noto Serif tải khi chọn; nhãn nút font render bằng font giao diện).
  <!-- Updated: Red Team 2026-10-06 - chỉ ghi thang chữ đã hiện thực -->
  - Chữ: **chỉ ghi phần đã có trong code**: `body` 15/500 (phase 1), `PageTitle` h1 28/800, `SectionHeading` h2 22/800, tiêu đề hero 38/800 (trang chủ) và 48/800 (trang truyện); serif chỉ cho nội dung truyện. Không ghi token `--text-*` (không có).
  - Bo góc `xs 6 … 2xl 28 / full`; bóng (chỉ bìa nổi, dialog/panel nổi); focus `ring-[3px] ring-ring` (không alpha).
  - Bìa (gáy, chữ cái mờ `aria-hidden`, `--cover-fg #F6F1E7`, một `<a>` mỗi thẻ truyện, bìa không là link).
  - Component chung: Button, Badge (`muted`, `warning`), TagChip, SectionHeading, `status-badges.tsx`, `PageShell`/`PageTitle`, `segmented-link-classes.ts` (tab là `Link` typed, không component chung), kiểu "trên màu bìa" (`on-cover-classes.ts`).
  - Layout: header (wordmark `sr-only` < sm), thanh tab 5 mục (< md; `Link` cho đích cá nhân), ẩn ở trang truyện/đọc/editor; `SiteLayout bottomInset`; breakpoint khu đọc một mốc `lg`; quy tắc phần tử trùng theo viewport dùng `display:none`.
  - Sửa bước shadcn "đổi `ring-ring/50` → `ring-ring/70`" thành "→ `ring-ring`"; bước "xoá class `shadow-*`" thành "trừ dialog/panel nổi".
- <!-- Updated: Red Team 2026-10-06 - bước purge CDN sau deploy đổi asset --> **`docs/deployment-cloudflare.md`** (tài liệu deploy/CDN hiện có; repo **không** có `docs/deployment-guide.md`, không tạo mới): trong mục "Purge cache (worker)" (dòng 64–88), sau đoạn "Purge tay", thêm đoạn: deploy (hoặc rollback) làm đổi hash CSS/JS/font (ví dụ đổi font, redesign) → **"Purge Everything" trên dashboard ngay sau khi web mới healthy**; lý do: HTML trang chương/truyện cache `s-maxage=86400` (`apps/web/src/lib/cache-headers.ts:7-9`) trỏ asset cũ đã bị thay → trang không CSS, JS không hydrate, nút màn 18+ không chạy. Không đổi config Cloudflare.
- `docs/code-standards.md`, `README.md`, `CLAUDE.md`: scout-03 đã grep không nhắc font/màu cũ → không sửa; grep lại khi cook.

## Architecture

```
code (phase 1–11) ──đối chiếu──▶ docs/design-guidelines.md (nguồn chuẩn thiết kế; tokens.css thắng khi lệch)
brainstorm §7 ──────────────────▶ docs/project-spec.md §2 (hàng Font), §8 (dòng 246–280)
red team (purge) ───────────────▶ docs/deployment-cloudflare.md mục Purge cache
```

## Related Code Files

- **Modify:** `docs/project-spec.md`, `docs/design-guidelines.md`, `docs/deployment-cloudflare.md`
- **Create:** không
- **Delete:** không
- **Đọc để đối chiếu (không sửa):** `apps/web/src/styles/{tokens.css,app.css,reader.css}`, `apps/web/src/routes/__root.tsx` (preload), `components/{status-badges,section-heading,tag-chip,page-shell,segmented-link-classes}.ts(x)`, `components/story/on-cover-classes.ts`, `components/site-layout.tsx`

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `docs/project-spec.md` | — | +1 hàng §2 (sau dòng 36); sửa §8 dòng 246, 250, 251, 253, 263, 267, 268, 273–275, 279–280 |
| `docs/design-guidelines.md` | 108 | viết lại (dòng 9–10, 16–18, 25–36, 41–53, 72, 86, 104, 108 theo scout-03 + mục mới) |
| `docs/deployment-cloudflare.md` | — | +1 đoạn trong "Purge cache (worker)" |

## Test scenario matrix

| Kịch bản | Loại | Cách kiểm | Trạng thái |
| --- | --- | --- | --- |
| Docs không còn font/màu/bo góc cũ | grep | `rg -n 'Be Vietnam|\bInter\b|đất nung|terracotta|0\.375rem|ring-ring/70|#A8432A' docs/` → 0 (trừ ghi chú lịch sử có chủ ý) | mới |
| Docs không còn nhãn hero cũ | grep | `rg -n 'Biên tập chọn' docs/` → 0 | mới |
| Spec không đổi checkbox | git | `git diff docs/project-spec.md` không có dòng `- [ ]`/`- [x]` thay đổi | mới |
| Token trong docs khớp code | đối chiếu tay | mỗi hex trong bảng docs có trong `tokens.css` | mới |
| Toàn bộ gate (docs không ảnh hưởng code; `docs/` trong `.prettierignore`) | gate | lệnh gate | giữ |

Không test tự động mới (chỉ tài liệu).

## Function/interface checklist

- [x] Hàng "Font" §2 (4 package, vai trò từng font)
- [x] §8 sửa đủ 10 vị trí dòng ở Requirements
- [x] `design-guidelines.md`: nguồn canvas, token, khu đọc, font, chữ (chỉ phần đã có), bo góc, bóng, focus, bìa, component, layout, breakpoint
- [x] `deployment-cloudflare.md`: đoạn purge sau deploy/rollback đổi asset

## Dependency map

- **Cần từ trước:** P1–P11 xong (docs mô tả code thật, viết cuối cùng).
- **Phase sau dùng:** không (plan Giai đoạn 2 đi sau; trước deploy production đầu tiên phải làm theo bước purge).

## Implementation Steps

1. Grep vị trí dòng hiện tại trong `docs/project-spec.md` (§2 hàng "UI styling", §8 từ dòng 244); sửa theo Requirements, không đụng checkbox.
2. Đọc `tokens.css`, `app.css`, `reader.css`, `__root.tsx` và component chung; viết lại `docs/design-guidelines.md`.
3. Thêm đoạn purge vào `docs/deployment-cloudflare.md`.
4. Grep kiểm theo ma trận.
5. Gate.

## Accessible name phải giữ

Không áp dụng (không đổi code/UI).

## i18n

Không áp dụng (không đổi `vi.json`).

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] `docs/project-spec.md` có hàng "Font" ở §2 và §8 khớp brainstorm §7 + quyết định đã chốt (nhãn hero "Mới đáng chú ý", breakpoint `lg` khu đọc, ngắt cảnh giữ); không checkbox nào bị đổi
- [x] `docs/design-guidelines.md` không còn token/font cũ, có link canvas, không ghi thang chữ chưa hiện thực
- [x] `docs/deployment-cloudflare.md` có bước "Purge Everything sau deploy/rollback đổi asset"
- [x] `git diff --stat` chỉ có 3 file trong `docs/`

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Docs lệch code sau 11 phase | M × L | viết cuối cùng, đối chiếu file tokens thật |
| Sửa nhầm checkbox spec | L × M | kiểm `git diff` không có dòng checkbox |
| Quên purge ở lần deploy production đầu | M × M | bước nằm trong tài liệu deploy/CDN hiện có; nhắc lại trong báo cáo cuối plan |

**Rollback:** `git checkout` 3 file docs.

## Ngoài phạm vi phase

Không sửa code, config Cloudflare/Docker/env/CI; không tạo `docs/deployment-guide.md`, `docs/codebase-summary.md`; không đánh `[x]` checkbox; không ghi tính năng Giai đoạn 2.
