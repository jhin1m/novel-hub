# Be Vietnam Pro 5.3.0 + hero blur (2026-11-09)

Nguồn: đọc tarball `npm pack @fontsource/be-vietnam-pro@5.3.0` (OFL-1.1). Phần blur: kiến thức kỹ thuật, KHÔNG xác minh bằng nguồn/thiết bị trong phiên này.

## 1. Font (đã xác minh bằng package)
- Subset có: vietnamese, latin, latin-ext (+ thêm thư mục subset khác ngoài scope). Weight 100-900 + italic.
- Tên CSS: `{weight}.css` (vd `500.css`), `{subset}-{weight}.css` (vd `vietnamese-500.css`, `latin-500.css`, `latin-ext-500.css`). Có `index.css` (400).
- `@font-face`: `font-family: 'Be Vietnam Pro'`, `font-display: swap`, src woff2 + woff fallback.
- `500.css` = 3 @font-face: vietnamese, latin-ext, latin (thứ tự này). Mỗi subset file `vietnamese-500.css` chỉ có 1 face và KHÔNG có unicode-range (nên import lẻ vietnamese-500.css thì face đó claim mọi ký tự; vẫn ok vì thiếu glyph thì lỗi/fallback nhưng latin phải import kèm; cẩn thận thứ tự: import latin SAU hoặc dùng `500.css`). Ghi chú: kiểm tra lại, `latin-500.css` có range riêng trong `500.css` nhưng file lẻ không đảm bảo range -> chỉ tin range trong `NNN.css`.
- unicode-range (trong `500.css`):
  - vietnamese: U+0102-0103 (Ă ă), U+0110-0111 (Đ đ), U+0128-0129 (Ĩ), U+0168-0169 (Ũ), U+01A0-01A1 (Ơ ơ), U+01AF-01B0 (Ư ư), U+0300-0301, 0303-0304, 0308-0309, 0323, 0329 (dấu kết hợp), U+1EA0-1EF9 (ệ ế ạ ...), U+20AB (₫).
  - latin: U+0000-00FF (gồm â ê ô á à ã í ì ú ù ý ò õ...), dấu câu U+2000-206F, U+20AC...
  - latin-ext: U+0100-02BA, U+1E00-1E9F, U+1EF2-1EFF... (không cần cho tiếng Việt; chỉ chồng lấn 1EF2-1EF9, vietnamese đã phủ).
- Kết luận: tiếng Việt cần **vietnamese + latin**. Ă Đ Ơ Ư ệ đều ở vietnamese; â ê ô và chữ không dấu ở latin. latin-ext chỉ cho tên riêng ngoại (Ł, ő...) -> bỏ được; fallback hệ thống nếu gặp.
- Chỉ lấy viet+latin: không có import gộp sẵn; viết CSS tay: copy 2 @font-face (vietnamese, latin) của mỗi weight từ `NNN.css`, trỏ `url('@fontsource/be-vietnam-pro/files/be-vietnam-pro-{subset}-{w}-normal.woff2')`. Hoặc import `NNN.css` đầy đủ (kéo 3 subset, trình duyệt chỉ tải file có ký tự dùng; latin-ext hầu như không tải). Khuyến nghị: import `NNN.css` (KISS, trình duyệt tự lọc), chỉ preload viet+latin.
- Tên woff2 (Vite `?url` qua `@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-500-normal.woff2?url`; kiểm tra `exports` package cho phép subpath `files/*`, chưa xác minh): `be-vietnam-pro-{vietnamese|latin|latin-ext}-{400..800}-normal.woff2`.
- Dung lượng woff2 (byte), 5 weight 400/500/600/700/800:
  - vietnamese: 60.752 (~12KB/weight). latin: 109.564 (~21,9KB/weight). latin-ext: 67.816.
  - viet+latin cả 5 weight ≈ 170KB; 1 weight ≈ 34KB; cả 3 subset ≈ 238KB.
- Preload: chỉ preload latin-500 + latin-700 (hoặc 400 + 600 theo thực dùng) và vietnamese cùng weight; không preload 5 weight (170KB cạnh tranh LCP). Cần `crossorigin` trên `<link rel=preload as=font type=font/woff2>`. Giảm weight dùng thật xuống 3 (400/600/800 hoặc 400/500/700) nếu design cho phép.
- Giữ `font-display: swap` (mặc định); thêm metric fallback (`size-adjust`) để giảm CLS, tùy chọn.

## 2. Hero blur
- Hiệu năng: blur(36px) trên ảnh 300x450 rẻ về bytes nhưng GPU cost theo diện tích hiển thị (ảnh bị phóng to phủ hero rộng). Kernel lớn trên layer lớn có thể giật khi scroll/animate trên mobile cũ -> blur mobile 28px đúng hướng. Giữ phần tử tĩnh: không animate, không `will-change` bừa; tách layer riêng (`transform` sẵn có là đủ). Tránh chồng nhiều lớp filter/backdrop-filter lên cùng vùng.
- LCP: ảnh 300x450 bị kéo to có kích thước hiển thị lớn -> rất có thể là LCP candidate (Chrome tính theo diện tích hiển thị, giới hạn bởi kích thước intrinsic vẫn ảnh upscaled bị "penalised": diện tích LCP của ảnh bị upscale tính theo intrinsic size; nên thường nhỏ hơn text lớn). `alt=""` vẫn tính LCP (ảnh trang trí vẫn là `<img>`; chỉ background-image khác cơ chế, cũng tính). Chưa đo thực tế trong repo.
- Mép sáng: blur lấy mẫu pixel trong suốt ngoài biên ảnh -> viền mờ/sáng nhạt ở 4 cạnh (bán kính ~ 2-3x sigma). `scale(1.18)` phóng to để phần mép bị loãng nằm ngoài hộp `overflow:hidden`. Cần ≥ sigma*~2/chiều nhỏ: ảnh phủ ~ rộng 360px thì margin 18% mỗi bên ~32px < 36px blur nên **mép có thể vẫn còn nhẹ ở mobile cao**; cần đo. Cách chắc: `inset:-10%` hoặc scale lớn hơn, hoặc lớp phủ rgba .64 che bớt (đã có).
- Loading: nền và bìa trước dùng cùng URL -> một request. Đặt `fetchpriority="high"` và `loading="eager"` (không lazy) trên ảnh nền chỉ khi hero trên màn đầu; bìa trước cũng eager, không cần fetchpriority riêng (dedupe theo URL). Thêm `decoding="async"`. Thêm `width/height` (300/450) chống CLS. Ảnh dưới màn đầu thì `loading="lazy"`. Với hero xoay vòng, chỉ slide đầu eager.
- Safari: bug cũ — `overflow:hidden` + `border-radius` không clip con có `filter`/`transform`/animation (con tràn ra góc vuông) trên WebKit. Phòng: container thêm `isolation:isolate` (hoặc `transform: translateZ(0)`), hoặc `clip-path: inset(0 round 16px)`; `mask-image` hack cũ (`-webkit-mask-image: -webkit-radial-gradient(white, black)`) cho bản cũ. Test Safari iOS thật. Cũng: `filter: blur` lớn trong Safari có thể bị render mờ/nhòe thiếu mép (clip bởi bounds layer) -> lý do nên dùng scale.

## Khuyến nghị
1. Import `@fontsource/be-vietnam-pro/{400,500,600,700,800}.css` hoặc cắt còn 3 weight; preload woff2 latin+vietnamese cho 2 weight chính.
2. Hero: container `overflow:hidden; isolation:isolate; clip-path round`, img `inset:-10%` + scale 1.18, `fetchpriority=high` cho slide đầu.

## Câu hỏi chưa giải quyết
- `package.json` exports có cho `files/*.woff2?url` không (chưa kiểm).
- Import `vietnamese-500.css` lẻ không có unicode-range (đã thấy) — latin lẻ có không? chưa kiểm; dùng `500.css` cho chắc.
- Phần blur/Safari chưa kiểm bằng nguồn/đo thực tế; cần test Safari iOS + Lighthouse/CrUX thật.
