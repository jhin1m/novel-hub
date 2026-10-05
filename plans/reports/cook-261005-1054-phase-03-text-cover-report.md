# Cook report: Phase 3, bìa mặc định dạng chữ

Ngày: 2026-10-05 · Mode: `--auto` · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-03-bia-mac-dinh-dang-chu.md`

## Đã làm

- `apps/web/src/styles/tokens.css`, `token-values.ts`: bảng `--cover-0..9` + `--cover-fg` (giá trị đã duyệt, `--cover-0` = `#8a2f3c`), scope `TOKEN_VALUES.cover`, `COVER_CONTRAST_PAIRS`, `coverBackgrounds()`.
- `tokens.test.ts`: 10 cặp bìa/chữ ≥ 4.5:1; số biến `--cover-N` ở TS và CSS = `COVER_PALETTE_SIZE`; scope cover nằm trong kiểm đối chiếu chuỗi.
- `apps/web/src/lib/cover-palette.ts` (+ test): `fnv1a32` (đúng test vector chuẩn), `coverPaletteIndex`, `coverTitleClass` (4 nấc 20/45/90; cỡ `rem` dự phòng, `cqw` trong `supports-[width:1cqw]`; đếm theo code point).
- `apps/web/src/components/story-cover.tsx` (+ test `renderToStaticMarkup`): ảnh `srcset` 300w/600w, `width/height`, `priority`; bìa chữ `role="img"` + `aria-label`, chữ bên trong `aria-hidden`, `line-clamp-6`, `text-balance`, `wrap-anywhere`. Ảnh lỗi → bìa chữ: nhớ URL lỗi (URL mới được thử lại) + kiểm `complete && naturalWidth === 0` khi mount cho ảnh SSR lỗi trước hydrate.
- `cover-upload.tsx`: hiện `StoryCover` khi chưa chọn file; prop mới `authorName`; giữ dòng "Chưa có bìa" dưới bìa chữ.
- `/write`: danh sách → lưới bìa 2/3/4/5 cột, khung `max-w-5xl`, link tiêu đề phủ cả thẻ (`after:inset-0`). Trang sửa truyện truyền `authorName` từ `useMe()`.
- `vi.json`: đổi key `cover_current_alt` → `cover_alt` (dùng chung mọi bìa); đã `pnpm i18n:compile`.
- E2E `stories.spec.ts`: bìa chữ (role `img`, tên "Bìa truyện …", chứa tiêu đề) ở trang sửa và `/write`.
- `docs/design-guidelines.md`: mục "Bìa mặc định" (bảng màu, quy tắc chọn màu, cách thêm màu).

Không đổi `vitest.config.ts`: Vitest biên dịch TSX sẵn. Không thêm dependency.

## Kiểm chứng

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (218), `pnpm test:int` (97 + 1 skipped S3), `pnpm test:e2e` (10/10): xanh, chạy lại sau khi sửa theo review.
- Build web: CSS sinh đủ rule `cqw` (trong `@supports`), `container-type`, `overflow-wrap:anywhere`, `text-(--cover-fg)`.
- Duyệt mắt (render tĩnh 10 bìa với CSS đã build, 375px và 1280px, light và dark): lưới đều; tiêu đề 137 ký tự cắt `…` ở dòng 6, không tràn; bút danh dài cắt 1 dòng.

## Review

`code-review-261005-1054-phase-03-text-cover-report.md`: 8.5/10, không có Critical/High/Medium.
- L2 (preview có viền, ảnh đã lưu không có): đã bỏ viền preview.
- L3 (`fetchpriority="auto"` thừa): đổi thành `undefined`.
- L1 (viền bìa ở dark): đã duyệt ảnh dark, khung vẫn rõ kể cả xám than; spec muốn tối giản, nên không thêm ring.
- L4: xem câu hỏi mở.

## Câu hỏi mở

1. 9 thể loại seed chỉ rơi vào 7 ô màu (`huyen-huyen`/`kiem-hiep` cùng ô 4, `kinh-di`/`tu-tien` cùng ô 5; ô 0, 1, 7 không dùng). Plan chấp nhận trùng màu khi chọn bằng hash thuần. Muốn gán cố định màu cho các thể loại tuyển sẵn thì cần user quyết.
