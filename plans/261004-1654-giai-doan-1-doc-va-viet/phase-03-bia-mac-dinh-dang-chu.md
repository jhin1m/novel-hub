---
phase: 3
title: "Phase 3: Bìa mặc định dạng chữ"
status: completed
priority: P1
effort: "0.75d"
dependencies: [2]
---

# Phase 3: Bìa mặc định dạng chữ

Spec checkbox: `Bìa mặc định dạng chữ khi tác giả không có bìa.`

## Context Links

- Spec mục 8 "Khu khám phá": bìa tỷ lệ 2:3; bìa mặc định gồm tên truyện, bút danh, màu nền sinh từ tag chính; lưới toàn bìa mặc định vẫn phải chỉnh tề
- Spec mục 4: bìa lưu WebP 600×900 và 300×450
- Phase 1: `apps/web/src/styles/tokens.css`, `token-values.ts` (`TOKEN_VALUES`), `tokens.test.ts` (`CONTRAST_PAIRS`, đối chiếu chuỗi, không parse CSS), `lib/contrast.ts`, `--font-serif`
- Phase 2: `AuthorStoryView` (`coverUrl`, `mainTag.slug`), `coverImageUrl()` ở `packages/shared/src/cover.ts`, trang `/write` và `/write/stories/$publicId`

## Overview

- Một component `StoryCover` dùng cho mọi nơi hiện bìa (phase 10 dùng trong `StoryCard`, trang truyện).
- Có `coverUrl` → `<img>` với `srcset` 300w/600w. Không có → bìa chữ SSR thuần CSS, không JS, không ảnh.
- Màu nền chọn từ bảng màu khai báo trong tokens, theo hash ổn định của slug tag chính.
- Gắn vào `/write` (lưới truyện của tôi) và khu bìa của trang sửa truyện.

## Key Insights

- Bìa chữ là HTML/CSS nên render ở SSR giống hệt cho mọi người, cache CDN được, không cần sinh ảnh.
- Bảng màu là token (`--cover-0` … `--cover-9` + `--cover-fg`), không hardcode trong component. Đã tính tương phản với chữ `#FBF8F3`: mọi màu ≥ 5.3:1 (AA cho cả bút danh cỡ nhỏ). Giá trị đã duyệt ở validate (cover-0 đổi sang đỏ son để không trùng tông màu nhấn).
- Chọn màu: FNV-1a 32-bit trên `mainTagSlug` → `% COVER_PALETTE_SIZE`. Hash ổn định giữa server và client (không dùng `Math.random`, không phụ thuộc locale), nên không lệch hydrate. Truyện cùng tag chính cùng màu là đúng ý spec; số tag lớn hơn bảng màu thì có tag trùng màu, chấp nhận được.
- Cỡ chữ tiêu đề theo container query (`@container` + đơn vị `cqw`), nên cùng một component đẹp ở thẻ 150px lẫn trang truyện 300px; tiêu đề dài (tới 150 ký tự) giảm cỡ theo nấc độ dài và `line-clamp`.
- `<img>` có `width=600 height=900` để chống nhảy layout; ảnh lỗi tải thì rơi về bìa chữ (state ở client, SSR luôn render `<img>` khi có URL).
- Test component chạy bằng `react-dom/server` `renderToStaticMarkup` trong môi trường node của Vitest, không cần jsdom hay thư viện test mới.

## Requirements

**Functional**

- `StoryCover` props:
  - `title: string`, `authorName: string` (bút danh = `display_name`), `mainTagSlug: string`, `coverUrl: string | null`;
  - `sizes?: string` (mặc định `(min-width: 768px) 200px, 45vw`), `priority?: boolean` (ảnh đầu màn hình: `loading="eager"`, `fetchpriority="high"`), `className?: string`.
- Có ảnh: `src` = bản 600, `srcSet` = `{300} 300w, {600} 600w`, `alt` = `m.cover_alt({ title })`, `decoding="async"`, mặc định `loading="lazy"`.
- Bìa chữ:
  - khung `aspect-[2/3]`, bo góc nhỏ, nền `var(--cover-N)`, chữ `var(--cover-fg)`;
  - tiêu đề font serif (Literata), đậm vừa, `text-wrap: balance`, `overflow-wrap: anywhere`, tối đa 6 dòng;
  - một đường kẻ mảnh trang trí;
  - bút danh font sans, cỡ nhỏ, 1 dòng, cắt `…`;
  - `role="img"` + `aria-label` = `m.cover_alt({ title })`, phần chữ bên trong `aria-hidden`.
- `/write`: lưới thẻ (2 cột mobile, 4–5 cột desktop) dùng `StoryCover`; trang sửa: `CoverUpload` (phase 2) hiện `StoryCover` hiện tại khi chưa chọn file mới.

**Non-functional**

- Không JS cần thiết để hiển thị bìa chữ; không tải ảnh/font thêm ngoài Literata/Be Vietnam Pro đã preload.
- Mọi cặp `--cover-N`/`--cover-fg` đạt AA 4.5:1, kiểm bằng `tokens.test.ts` trên scope `TOKEN_VALUES.cover` (giá trị đối chiếu chuỗi với `tokens.css`).

## Architecture

```
StoryCover({ title, authorName, mainTagSlug, coverUrl, ... })
  ├─ coverUrl && !failed → <img src=coverImageUrl(url,600) srcSet=…300w, …600w width=600 height=900>
  └─ else → <div role="img" class="@container aspect-[2/3]" style={{ background: `var(--cover-${i})` }}>
               i = coverPaletteIndex(mainTagSlug)            // FNV-1a % COVER_PALETTE_SIZE
               <p class={coverTitleClass(title)}>{title}</p>  // nấc cỡ chữ theo độ dài
               <hr/> <p>{authorName}</p>
```

```ts
// apps/web/src/lib/cover-palette.ts
export const COVER_PALETTE_SIZE = 10; // phải bằng số biến --cover-N trong tokens.css (có test)
export function fnv1a32(input: string): number;
export function coverPaletteIndex(tagSlug: string): number; // 0..COVER_PALETTE_SIZE-1
export function coverTitleClass(title: string): string;     // ≤20 / ≤45 / ≤90 / >90 ký tự → 4 nấc cqw
// apps/web/src/components/story-cover.tsx
export interface StoryCoverProps {
  title: string; authorName: string; mainTagSlug: string; coverUrl: string | null;
  sizes?: string; priority?: boolean; className?: string;
}
export function StoryCover(props: StoryCoverProps): JSX.Element;
```

Bảng màu đề xuất (chữ `--cover-fg: #FBF8F3`):

| Token | Màu | Tên gợi nhớ | Tương phản |
|---|---|---|---|
| `--cover-0` | `#8A2F3C` | đỏ son | 7.8 | <!-- Updated: Validation Session 1 - đổi từ đỏ gạch #8C3B2E vì trùng tông màu nhấn đất nung -->
| `--cover-1` | `#7A4E2D` | nâu đất | 6.7 |
| `--cover-2` | `#7D6420` | vàng đồng | 5.3 |
| `--cover-3` | `#4F5D2F` | rêu | 6.7 |
| `--cover-4` | `#2F5D50` | lục bảo | 7.1 |
| `--cover-5` | `#2E5266` | lam khói | 7.9 |
| `--cover-6` | `#2C3E66` | chàm | 10.0 |
| `--cover-7` | `#5B3A64` | tím mơ | 8.9 |
| `--cover-8` | `#7E3B54` | hồng trầm | 7.5 |
| `--cover-9` | `#3A3632` | xám than | 11.3 |

Bảng màu dùng chung cho light và dark (bìa là "vật thể", không đổi theo theme).

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `apps/web/src/styles/tokens.css` | modify | `--cover-0..9`, `--cover-fg` trong `:root` |
| `apps/web/src/styles/{token-values.ts,tokens.test.ts}` | modify | scope `cover` (`--cover-0..9`, `--cover-fg`); cặp `--cover-N`/`--cover-fg`; số khoá `--cover-N` trong `TOKEN_VALUES.cover` = `COVER_PALETTE_SIZE` |
| `apps/web/src/lib/cover-palette.ts` (+ `.test.ts`) | create | |
| `apps/web/src/components/story-cover.tsx` (+ `.test.tsx`) | create | test bằng `renderToStaticMarkup` |
| `apps/web/src/components/cover-upload.tsx` | modify | hiện `StoryCover` khi chưa chọn file |
| `apps/web/src/routes/write/index.tsx` | modify | lưới bìa |
| `packages/shared/messages/vi.json` | modify | `cover_alt` |
| `apps/web/e2e/stories.spec.ts` | modify | kiểm bìa chữ |
| `docs/design-guidelines.md` | modify | mục "Bìa mặc định": bảng màu, quy tắc chọn màu, cách thêm màu |

## Implementation Steps

1. Thêm token bảng màu đã duyệt (gồm `--cover-0` `#8A2F3C`) vào `tokens.css` và scope `cover` của `TOKEN_VALUES`.
2. `cover-palette.ts`: `fnv1a32` (offset `0x811c9dc5`, prime `0x01000193`, `Math.imul`, `>>> 0`), `coverPaletteIndex`, `coverTitleClass`. Unit test: giá trị cố định cho vài slug (`tien-hiep`, `ngon-tinh`, chuỗi rỗng), luôn trong khoảng, gọi lặp cho cùng kết quả; 4 nấc độ dài.
3. `token-values.ts`: scope `cover`; `tokens.test.ts`: thêm cặp bìa, test đếm khoá (đối chiếu chuỗi có sẵn của phase 1 tự kiểm `tokens.css`). <!-- Red Team: theo cách test hằng TS của phase 1 -->
4. `story-cover.tsx` theo Requirements. Container: `@container` trên khung; tiêu đề dùng class `text-[length:Ncqw]` (kiểm cú pháp Tailwind v4 lúc cook). Fallback ảnh lỗi: `useState(false)` + `onError`.
5. `story-cover.test.tsx`:
   - không có `coverUrl` → markup chứa tiêu đề, bút danh, `var(--cover-i)` đúng index, không có `<img`;
   - có `coverUrl` → `srcset` chứa `-300.webp 300w` và `-600.webp 600w`, có `width="600"`;
   - tiêu đề chứa `<b>` → bị escape.
   Nếu Vitest không biên dịch được TSX với cấu hình hiện tại, thêm `oxc`/`esbuild` `jsx: 'automatic'` vào `vitest.config.ts` (thay đổi cấu hình test, ghi vào báo cáo cook).
6. Gắn vào `/write` và `CoverUpload`. Chuỗi `cover_alt` vào `vi.json`, `pnpm i18n:compile`.
7. E2E: trong `stories.spec.ts`, truyện vừa tạo (chưa có bìa) hiện `getByRole('img', { name: 'Bìa truyện <tiêu đề>' })` ở `/write` và chứa chữ tiêu đề.
8. Duyệt mắt: đăng nhập tài khoản seed có nhiều truyện (hoặc tạo 8 truyện với tiêu đề dài/ngắn khác nhau), xem lưới ở 375px và 1280px, light và dark; tiêu đề 150 ký tự không tràn khung; chụp màn hình gửi user nếu cần.
9. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox 2 của Giai đoạn 1 trong spec.

## Function / Interface Checklist

- [x] `fnv1a32(input): number`
- [x] `coverPaletteIndex(tagSlug): number`, `COVER_PALETTE_SIZE`
- [x] `coverTitleClass(title): string`
- [x] `StoryCover(props: StoryCoverProps)`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | 10 cặp `--cover-N`/`--cover-fg` đạt 4.5:1; số biến = `COVER_PALETTE_SIZE` | unit `tokens.test.ts` |
| High | `coverPaletteIndex` ổn định, trong khoảng, giá trị cố định cho slug mẫu | unit |
| High | Không ảnh → bìa chữ đúng màu, có tiêu đề, bút danh, không `<img>`; có ảnh → `srcset` 2 cỡ, `width/height` | unit (render tĩnh) |
| High | Tiêu đề chứa HTML bị escape | unit |
| Medium | `coverTitleClass` 4 nấc theo độ dài | unit |
| High | `/write` hiện bìa chữ của truyện mới tạo (role `img`, tên đúng) | e2e |
| Medium | Lưới toàn bìa chữ chỉnh tề ở mobile/desktop, tiêu đề dài không tràn | thủ công |

## Dependency Map

- Cần: phase 1 (tokens, test tương phản, font), phase 2 (`AuthorStoryView`, `coverImageUrl`, `/write`).
- Phase 10 dùng `StoryCover` trong `StoryCard`, trang truyện, trang tác giả, trang tag, trang chủ (`priority` cho hàng đầu).
- Phase 12 dùng trong tủ truyện; phase 11 trong kết quả tìm kiếm.
- Phase 16: OG image của truyện không có bìa dùng ảnh OG mặc định, không render bìa chữ thành ảnh (ngoài phạm vi).

## Success Criteria

- [x] Truyện không có bìa hiện bìa chữ đúng tỷ lệ 2:3, màu theo tag chính, có tiêu đề và bút danh
- [x] Truyện có bìa dùng `srcset` 300/600, không nhảy layout
- [x] Test tương phản và test component xanh; lưới bìa chữ được duyệt mắt
- [x] Gate 5 lệnh xanh; checkbox 2 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Container query/`cqw` không hỗ trợ trình duyệt cũ | Thấp × Thấp | Đặt cỡ chữ `rem` làm giá trị trước, `cqw` ghi đè sau |
| Nhiều tag phổ biến trùng màu | Trung bình × Thấp | Bảng 10 màu; nếu user thấy đơn điệu, tăng lên 12 (test đếm tự kiểm) |
| Vitest không biên dịch TSX | Trung bình × Thấp | Step 5: thêm tuỳ chọn JSX vào cấu hình test |
| Hydrate lệch do hash khác | Thấp × Trung bình | Hash thuần số nguyên 32-bit, cùng code server/client; có test giá trị cố định |

Rollback: chỉ component và token; revert commit, `/write` quay về danh sách chữ của phase 2.

## Security Considerations

- Tiêu đề và bút danh render qua React (escape), không `dangerouslySetInnerHTML`.
- Màu lấy từ biến CSS theo index số, không đưa chuỗi người dùng vào `style`.
- `coverUrl` chỉ đến từ server (`cover_url` do core ghi), không nhận URL tuỳ ý từ client.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Bảng 10 màu bìa: dùng nguyên văn, trừ `--cover-0` đổi `#8C3B2E` (đỏ gạch, hue 8°) → `#8A2F3C` (đỏ son, hue 351°, 7.77:1) vì đỏ gạch trùng tông màu nhấn đất nung `#A8432A` (hue 12°).
2. Bìa chữ không hiện tag chính.

## Next Steps

Phase 4: editor Tiptap và autosave; trang sửa truyện thêm danh sách chương.
