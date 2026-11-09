# So ảnh design đã chốt với trang chạy local (1440px/390px, sáng/tối)

Ngày 2026-11-09, nhánh `redesign/261109`, commit `1461f83`. Phase 8 của `plans/261109-1347-redesign-design-chot/`.

**Kết luận:** bố cục, thứ tự khu, font, màu và token khớp design. Có một lệch lớn dùng chung cho mọi trang (khung nội dung hẹp hơn 64px) và ba lệch ở chế độ tối do token `--band`. Không sửa code trong phase này, nên không cần chạy gate. Các lệch tìm được ghi ở dưới để user quyết; phần đã có kiểm chéo độc lập trên mã nguồn và board.

## 1. Lệch do plan chọn, chờ user xác nhận

Không phải lỗi của phase. Gồm 6 dòng của phase 8 và các dòng "quyết định diễn giải" trong `plan.md`.

| Điểm | Board | Code | Lý do | Ảnh/ghi chú |
|------|-------|------|-------|-------------|
| Ô thể loại | Màu trơn | Bìa mờ, màu trơn là dự phòng | Brief mục 4 | `home-1440-light`, `tiles-fallback-*` |
| Nhãn trên hero | `#efe6d4` | `--cover-fg` `#f6f1e7` | AA khi ảnh sáng | Cũng áp cho breadcrumb, dòng thể loại, nhãn số liệu trang truyện |
| Header khách dưới 768px | Chỉ nút tìm kiếm | Thêm nút tròn tài khoản | Trang truyện không có thanh tab | `home-390-light` |
| Số liệu trang truyện | "đánh giá" | "ra chương" | Spec mục 8 | Truyện mẫu không đủ dữ liệu tần suất nên ảnh chỉ có 3 số |
| Kệ Truyện nổi bật, Truyện mới cần độc giả | Không có | Có khi có dữ liệu | Tính năng trong spec | Local chỉ có Truyện nổi bật; **chưa so được trực quan** kệ Truyện mới cần độc giả vì DB local không có dữ liệu cho khu này |
| Thanh Đọc tiếp cho khách | Có | Chưa có | Phase 9 chụp bổ sung | Vì vậy khu "Hôm nay đọc gì?" của khách nằm cao hơn board 79px |
| Dải "Truyện mới đáng chú ý" | Không có | Đã bỏ, nhãn ở hero | Đúng board | |
| Khóa font đọc `plus-jakarta-sans` | Không nói | Giữ khóa, đổi nhãn | Không đổi `users.preferences` | |
| Đồng bộ tiến độ khách | Không nói | Chưa làm; plan chọn chỉ ghi khi chưa có hoặc chương local lớn hơn | Tránh mất tiến độ thật | Thuộc phase 9, chưa kiểm được ở đây |

## 2. Ba điểm được yêu cầu đối chiếu

### 2.1. Vạch ngăn `--band` ở mục lục, chế độ tối

| Theme | Vạch | Nền | Tương phản đo được |
|-------|------|-----|--------------------|
| Sáng | `#efe6d4` | `--card` `#ffffff` | 1,24:1 |
| Tối | `#161a18` | `--card` `#181c1a` | **1,02:1** |

Xác nhận con số 1,02:1. Ở tối, vạch không thấy được, danh sách như không có vạch ngăn (`probe-toc-dark.png`). Code: `apps/web/src/components/story/story-chapter-list.tsx:87`. Làm đúng phase 6 ("vạch ngăn `--band` như board"), nhưng board chỉ có bản sáng.

![TOC sáng](../261109-1347-redesign-design-chot/visuals/probe-toc-light.png)
![TOC tối](../261109-1347-redesign-design-chot/visuals/probe-toc-dark.png)

Cùng gốc, phát hiện thêm khi đo:

| Chỗ | Tương phản tối | Sáng | File |
|-----|----------------|------|------|
| Rãnh tab bảng xếp hạng so với thẻ | 1,02:1 | 1,24:1 | `apps/web/src/components/home/home-rankings.tsx:79` |
| Tab đang chọn so với rãnh | 1,02:1 | 1,24:1 | `apps/web/src/components/home/home-rankings.tsx:90` |
| Dải "Có truyện muốn kể?" so với nền trang | 1,06:1 | 1,12:1 | `apps/web/src/components/home/home-write-band.tsx:38` (nhánh đang hiển thị; `:60` là nhánh cuộc thi, đang tắt vì `CONTESTS_ENABLED` false) |

Ở tối, tab đang chọn chỉ còn phân biệt bằng màu chữ và độ đậm; vẫn dùng được, nhưng mất hình viên của board.

Gợi ý nếu sửa: dùng `--border` (`#2c322f`) hoặc `--shelf-line` (`#3a413d`) cho vạch mục lục ở tối. Rãnh tab cần một bước nền khác `--card`.

### 2.2. Tiêu đề "Độc giả gắn bó" 22/700 cạnh "Truyện liên quan" 26/700

Đo được đúng 22px/700 và 26px/700, cả sáng và tối. **Khớp board** (`Story.dc.html` ghi 22px và 26px), nên không phải lỗi triển khai. Chỗ khác board là `line-height` 1,25 và `letter-spacing` -0,025em (board không đặt, thừa kế 1,5 và normal).

Hai cỡ chữ cạnh nhau là chủ ý của board: "Độc giả gắn bó" nằm trong thẻ, "Truyện liên quan" nằm ngoài thẻ. Nếu user thấy lệch nhịp thì đổi `apps/web/src/components/nominations/top-readers.tsx:29`. Ảnh: `probe-sidebar-light.png`, `probe-sidebar-dark.png`.

### 2.3. Viền nút hero khi hover trên bìa gần trắng

Lấy mẫu điểm ảnh trên nút viền "Thêm vào tủ" ở hero. Bìa trắng là ảnh thay tạm `#fafaf8` qua `page.route`, không đổi DB. Kết quả trang chủ và trang truyện như nhau.

| Bìa | Trạng thái | Viền so với nền ngoài | Viền so với nền trong nút | Chữ so với nền trong nút |
|-----|------------|-----------------------|---------------------------|--------------------------|
| Trắng `#fafaf8` | Thường | 4,78:1 | 4,78:1 | 5,09:1 |
| Trắng `#fafaf8` | Hover | 4,78:1 | 3,89:1 | **4,14:1** |
| Sáng nhất local (`5jf83zj4`) | Thường | 5,84:1 | 5,91:1 | 6,34:1 |
| Sáng nhất local (`5jf83zj4`) | Hover | 5,84:1 | 4,67:1 | 5,01:1 |

Viền vẫn rõ ở mọi trường hợp (trên 3:1). Riêng khi hover trên bìa gần trắng, chữ xuống **4,14:1, dưới AA 4,5:1**, do lớp `hover:bg-(--cover-fg)/10` (`apps/web/src/components/story/on-cover-classes.ts:15`). Bìa thật sáng nhất hiện có vẫn đạt AA, nên đây là trường hợp biên. `tokens.test.ts` chỉ bảo đảm 4,5:1 cho trạng thái thường.

![Hover bìa trắng](../261109-1347-redesign-design-chot/visuals/probe-hover-story-white-hover.png)

## 3. Lệch phát hiện thêm

### 3.1. Lệch lớn: khung nội dung hẹp hơn board 64px

| Phần tử (1440) | Board | Code |
|----------------|-------|------|
| Lề trái nội dung | x = 100 | x = 132 |
| Chiều rộng nội dung | 1240 | 1176 |
| Ô thể loại | 298 | 282 |
| Bìa kệ "Vừa có chương mới" | 181×272 | 178×267 |
| Bìa kệ "Trọn bộ" | 153×230 | 144×216 |
| Thẻ bảng xếp hạng | 370 | 320 |
| Tiêu đề "Đang được đọc nhiều" | 1 dòng, cao 34 | **2 dòng, cao 67** |
| Thẻ nội dung trang truyện | 916 | 852 |

Gốc: board không reset `box-sizing`, nên `max-width: 1240px` và padding 32 mỗi bên cho 1240px nội dung, còn thẻ `flex: 1 1 320px` có padding 24 và viền 1 thành 370 (320 + 48 + 2). Tailwind dùng `border-box`, nên cùng số đó cho 1176 và 320.

Đây là lệch cần quyết định vì đụng mọi trang. Các chỗ đặt khung (dưới `apps/web/src/`):

- `components/site-header.tsx:24`, `components/site-footer.tsx:18`, `components/page-shell.tsx:24`
- `components/home/home-featured-hero.tsx:53`, `components/home/home-write-band.tsx:61`, `components/story/story-hero.tsx:75`
- `routes/index.tsx:88`, `routes/index.tsx:92`, `routes/stories.$storyKey.index.tsx:82`, `routes/write/index.tsx:22`

`home-write-band.tsx:61` là nhánh cuộc thi, hiện không render. Nhánh đang hiển thị (`home-write-band.tsx:39`) có cùng kiểu lệch: `max-w-[760px]` cho 696px nội dung thay vì 760px, chưa thấy khác vì chữ hiện vừa một dòng.

Muốn khớp board: `max-w-[1304px]` ở các chỗ trên và `flex-[1_1_370px]` ở `components/home/home-rankings.tsx:68`. Khi đó phải sửa cả kiểm tra ở `components/page-shell.test.tsx:16`.

### 3.2. Lệch nhỏ

| Khu | Board | Code | File |
|-----|-------|------|------|
| Nút "Đọc ngay" (hero) | 15px | 16px, rộng hơn 5px | `components/home/home-featured-hero.tsx:93` |
| Nút hero "Thêm vào tủ", "Theo dõi", "Đề cử" | Không icon | Có icon, rộng hơn 16-24px | `components/story/story-hero.tsx`, `components/home/home-featured-hero.tsx:102` |
| "của {tác giả}" ở hero trang chủ và trang truyện | "của" 400, tên 700 | Cả dòng 600 | `components/home/home-featured-hero.tsx:75`, `components/story/story-hero.tsx` |
| Đoạn chữ khối "Có truyện muốn kể?" | `#574f45` | `--muted-foreground` `#675f55`, nhạt hơn | `components/home/home-write-band.tsx` |
| H2 trang truyện | `line-height` 1,5, không tracking | 1,25, `-0.025em` | `components/section-heading.tsx` |
| Hàng "Mới nhất" | Bo 16, padding 13/18, nhãn là chữ màu | Bo 28 (`rounded-2xl` của dự án là 28px), padding 12/16, nhãn dạng viên nền màu nhấn | `components/story/story-chapter-list.tsx:74`, `:76` |
| Dòng mục lục | Số "1" 19px | "Chương 1" 14px, dòng cao 49 thay 56 | `components/story/story-chapter-list.tsx:96` |
| Thẻ tác giả | Giới thiệu ngắn | `@username` | `components/story/story-author-card.tsx:19` |
| Độc giả gắn bó | 3 dòng, không phụ đề | Tới 10 dòng, có phụ đề | `components/nominations/top-readers.tsx` |
| Khu đánh giá | "Độc giả nói gì", 2 trích dẫn | "Đánh giá", biểu đồ sao, danh sách review | Tính năng có sẵn |
| Khu "Thảo luận", link "Báo cáo" | Không có | Có | Tính năng trong spec |
| Header trang truyện | Không ô tìm | Có ô tìm (header chung) | `components/site-header.tsx` |
| Nhãn trạng thái bảng xếp hạng | "Trọn bộ" | "Hoàn thành" | `packages/shared/messages/vi.json:129` |
| 390: "Vừa có chương mới" | 1 dòng, không "Xem thêm" | 2 dòng vì có "Xem thêm" cạnh tiêu đề (cao 36 → 72) | `components/home/home-recent-updates.tsx` |
| 390: "Trọn bộ, đọc một mạch" | Board mobile không có khu này | 2 dòng, cùng lý do trên | `components/home/home-recently-completed.tsx:17` |
| 390: thanh tab | Tab chọn chỉ đổi màu; nhãn 12px/600, cách icon 2px | Có viên nền sau icon; nhãn 11px/500, cách 4px. Chiều cao khớp (73) | `components/mobile-tab-bar.tsx:16`, `:33` |
| 390: header | Cao 64, không viền | Cao 65, có viền dưới | `components/site-header.tsx` |

## 4. Ma trận ảnh

Board và ảnh thật cạnh nhau. Dữ liệu trên board là mẫu. Trang truyện dùng đúng truyện trên board ("Hẻm Nhỏ Ở Sài Gòn"). Hero trang chủ lấy truyện thật ("Tiếng Gõ Không Tên").

### Trang chủ 1440

| Board | Sáng | Tối |
|-------|------|-----|
| ![](../261109-1347-redesign-design-chot/visuals/board-home-1440.png) | ![](../261109-1347-redesign-design-chot/visuals/home-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/home-1440-dark.png) |

| Khu | Kết quả | Ghi chú |
|-----|---------|---------|
| Header | Khớp | Cao 73; font, màu giống |
| Hero: nền, lớp phủ, padding, chiều cao | Khớp | Cùng chiều cao section |
| Hero: tiêu đề, giới thiệu, bìa | Khớp | `pt-[.2em]`/`-mt-[.2em]` giữ dấu tiếng Việt, không xê dịch |
| Hero: nhãn | Chờ xác nhận | Mục 1 |
| Hero: nút, dòng tác giả | Lệch nhỏ | Mục 3.2 |
| Thứ tự khu | Khớp | Thêm Truyện nổi bật (mục 1) |
| "Hôm nay đọc gì?", tiêu đề kệ, "Xem thêm", meta kệ | Khớp | |
| Ô thể loại | Chờ xác nhận | Bìa mờ theo brief; rộng 282 do mục 3.1 |
| Kệ bìa, số cột | Khớp | Cùng `minmax(165px,1fr)`; bìa nhỏ hơn do mục 3.1 |
| Bảng xếp hạng | Lệch | Thẻ 320, tiêu đề 2 dòng (mục 3.1); nhãn trạng thái (mục 3.2) |
| Khối "Có truyện muốn kể?" | Khớp bố cục, lệch màu đoạn chữ | Mục 3.2; ở tối xem 2.1 |
| Footer | Khớp | |

### Trang chủ 390

| Board | Sáng | Tối |
|-------|------|-----|
| ![](../261109-1347-redesign-design-chot/visuals/board-home-390.png) | ![](../261109-1347-redesign-design-chot/visuals/home-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/home-390-dark.png) |

| Khu | Kết quả | Ghi chú |
|-----|---------|---------|
| Hero: blur 28, nhãn, tiêu đề 27, bìa 88, giới thiệu | Khớp | Độ cao khác do tên và giới thiệu thật dài khác mẫu |
| Ô thể loại | Khớp cỡ, chữ | Bỏ cụm bìa đúng brief; nền bìa mờ (mục 1) |
| Tiêu đề kệ, kệ cuộn ngang, xếp hạng | Khớp | Trừ tiêu đề 2 dòng (mục 3.2) |
| Thanh tab | Lệch nhỏ | Mục 3.2 |

Ghi chú: ảnh 390 chụp với viewport cao bằng cả trang để thanh tab và nút đọc dính đáy nằm ở cuối, không in đè giữa trang. Ảnh trong kệ cuộn ngang chưa cuộn tới thì chưa tải (`loading=lazy`), là hành vi đúng.

### Trang truyện 1440

| Board | Sáng | Tối |
|-------|------|-----|
| ![](../261109-1347-redesign-design-chot/visuals/board-story-1440.png) | ![](../261109-1347-redesign-design-chot/visuals/story-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/story-1440-dark.png) |

| Khu | Kết quả | Ghi chú |
|-----|---------|---------|
| Hero: nền bìa mờ, lớp phủ, cao 532 (board 533) | Khớp | |
| Bìa 240 xoay -2deg, h1, số liệu, nút Đọc từ đầu | Khớp | "ra chương" xem mục 1 |
| Nút viền, dòng tác giả | Lệch nhỏ | Mục 3.2 |
| Thẻ nội dung: bo 28, padding 40, các khu cách 38, đè hero | Khớp | Rộng 852 (mục 3.1) |
| Thứ tự: Giới thiệu đầu tiên | Khớp | |
| Mục lục | Lệch nhỏ | Giữ tìm kiếm, đảo chiều đúng phase 6; dòng và vạch xem 3.2, 2.1 |
| Truyện liên quan: lưới 3 cột, tiêu đề | Khớp | |
| Độc giả gắn bó | Khớp khung | Nội dung xem 3.2, tiêu đề xem 2.2 |

### Trang truyện 390

Không có board riêng. So với cách xử lý hero của `Mobile.dc.html` và số mobile trong phase 6.

| Sáng | Tối |
|------|-----|
| ![](../261109-1347-redesign-design-chot/visuals/story-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/story-390-dark.png) |

| Số phase 6 | Đo được | Kết quả |
|------------|---------|---------|
| Bìa 132px, không xoay | 132×198 | Khớp |
| h1 28/1.25 700 | 28px/35px/700 | Khớp |
| Nút trên hero cao 44 | 44 | Khớp |
| Nút đọc ở thanh dính đáy | Có, cao 48 | Khớp |
| Thẻ nội dung đè hero, bo trên 28 | Khung `-mt-7 rounded-t-[28px]`; thẻ trong bo 18 | Khớp |
| Blur 28, lớp phủ như hero mobile | `blur-[28px]`, `--hero-scrim` | Khớp |

### Ảnh riêng

| Nội dung | Sáng | Tối | Kết quả |
|----------|------|-----|---------|
| Hero không bìa 1440 | ![](../261109-1347-redesign-design-chot/visuals/home-nocover-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/home-nocover-1440-dark.png) | Khớp brief: nền ngà, không khối màu, bìa chữ trái, nút màu nhấn |
| Hero không bìa 390 | ![](../261109-1347-redesign-design-chot/visuals/home-nocover-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/home-nocover-390-dark.png) | Khớp |
| Trang truyện không bìa 1440 | ![](../261109-1347-redesign-design-chot/visuals/story-nocover-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/story-nocover-1440-dark.png) | Khớp phase 6 |
| Trang truyện không bìa 390 | ![](../261109-1347-redesign-design-chot/visuals/story-nocover-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/story-nocover-390-dark.png) | Khớp phase 6 |
| Ô thể loại dự phòng 1440 | ![](../261109-1347-redesign-design-chot/visuals/tiles-fallback-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/tiles-fallback-1440-dark.png) | Khớp brief: `#a8431f`, `#2f5d50`, `#3a3632`, `#2e5266` |
| Ô thể loại dự phòng 390 | ![](../261109-1347-redesign-design-chot/visuals/tiles-fallback-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/tiles-fallback-390-dark.png) | Khớp |
| Đọc tiếp thành viên 1440 | ![](../261109-1347-redesign-design-chot/visuals/member-continue-1440-light.png) | ![](../261109-1347-redesign-design-chot/visuals/member-continue-1440-dark.png) | Khớp: đè mép hero, tiến độ màu nhấn |
| Đọc tiếp thành viên 390 | ![](../261109-1347-redesign-design-chot/visuals/member-continue-390-light.png) | ![](../261109-1347-redesign-design-chot/visuals/member-continue-390-dark.png) | Khớp |
| Hero bìa trắng (chữ vẫn đọc được) | ![](../261109-1347-redesign-design-chot/visuals/probe-hero-story-white.png) | | Chữ thường đạt 5,09:1 |

## 5. Chế độ tối

Board chỉ có bản sáng, nên **tối được so với token Tối** trong `apps/web/src/styles/tokens.css`, không so với board. Giá trị đo trên trang khớp token: nền `#101312`, thẻ `#181c1a`, chữ `#e8ece9`, màu nhấn `#4fc2a8`, viền `#2c322f`, chữ phụ `#9aa39e`, `--band` `#161a18`. Hero giữ `--cover-fg` và `--hero-scrim` ở cả hai theme. Vấn đề duy nhất là `--band` quá gần `--card` và nền trang (mục 2.1).

## 6. Trang đọc so với `main`

Đo trên bản `main` (`90bbc96`) dựng từ `git archive` trong scratchpad, không đổi nhánh.

| Thông số | 1440 `main` | 1440 nhánh | 390 `main` | 390 nhánh |
|----------|-------------|------------|------------|-----------|
| Cột chữ (x, rộng) | 378,27 / 683,45 | 378,27 / 683,45 | 16 / 358 | 16 / 358 |
| Đỉnh cột | 84 | 84 | 76 | 76 |
| Font | Source Serif 4 | Source Serif 4 | Source Serif 4 | Source Serif 4 |
| Cỡ / dòng / đậm | 19 / 34,2 / 400 | 19 / 34,2 / 400 | 19 / 34,2 / 400 | 19 / 34,2 / 400 |
| Tổng chiều cao trang | 7643 | 7643 | 13009 | 13009 |

**Cột chữ không đổi.** Ảnh: `reader-1440.png`, `reader-1440-main.png`, `reader-390.png`, `reader-390-main.png`.

## 7. Kiểm tra thêm

| Mức | Kịch bản | Kết quả |
|-----|----------|---------|
| Critical | Đủ 8 ảnh toàn trang | Đạt |
| Critical | Tắt JS: hero, ô thể loại, kệ có trong HTML | Đạt: trang chủ 1 h1, 5 nền bìa mờ (hero và 4 ô), 4 link ô, 27 link truyện, đủ tiêu đề khu; trang truyện đủ Giới thiệu, Mục lục (`*-nojs.png`) |
| High | Không lỗi hydration | Đạt, 24 lần tải trang |
| High | Không cuộn ngang ở 390 | Đạt, `scrollWidth` = 390 ở mọi trang đã chụp |
| Medium | Chữ trên hero sáng đọc được | Đạt ở trạng thái thường; hover xem 2.3 |
| | Không gọi `fonts.googleapis.com` | Đạt, 0 request |
| | Cache | Đạt: trang chủ `s-maxage=600`, trang truyện `s-maxage=86400`, không `set-cookie` |

Console chỉ có 401 của `/api/v1/me` khi là khách (đúng), và 4 cảnh báo về font đã preload ở trang chủ 390. Chưa điều tra cảnh báo này; không phải lỗi hydration, font vẫn tải đúng.

`home-1440-nojs.png` trùng từng byte với `home-1440-light.png`. Đã kiểm lại: bản tắt JS tải 0 script (bật JS là 1313), nên đây là ảnh tắt JS thật; HTML của khách render giống hệt sau hydrate.

**Ba việc `plan.md` dời sang phase này:**

| Việc | Kết quả | Giới hạn |
|------|---------|----------|
| LCP | Phần tử LCP là ảnh bìa cỡ 300: bìa nét ở trang chủ 1440, **ảnh nền mờ** ở trang chủ 390 và trang truyện cả 1440, 390. Đo được 72-100ms | Vite dev, ảnh localhost, chưa nói được gì về production. `CoverBackdrop` chủ ý không đặt `fetchPriority`, nên nên đo lại trên staging vì ảnh nền đang là phần tử LCP |
| Mép blur | Không thấy viền sáng ở mép hero trên Chromium và WebKit, sáng và tối | So bằng mắt trên ảnh chụp |
| Safari iOS | Đã chạy WebKit desktop của Playwright ở viewport 390: filter áp đúng (`blur(28px) saturate(0.85)`), bố cục đúng (`story-390-webkit.png`) | **Chưa thử trên thiết bị iOS thật**, nên hiệu năng blur và safe area trên iPhone vẫn chưa được kiểm |

## 8. Môi trường và dữ liệu tạm

- Web `localhost:3300`, ảnh bìa `localhost:3399`, worker đang chạy sẵn. Thư mục `covers-out` còn nguyên, không phải `db:seed`. Redis có sẵn dữ liệu xếp hạng.
- Ảnh board render local từ artifact (version `1794224338-ad75`): `dc-runtime.js` làm `support.js`, 21 ảnh `/_blob/`. Ba file board giống hệt bản trong `design-boards/` (đã `diff` cả ba). Board tải font từ Google, chỉ ở bước render board.
- Đăng nhập bằng tài khoản seed `doc_gia_mau` để chụp thanh Đọc tiếp.
- Sửa tạm DB local: đặt `cover_url = NULL` cho truyện hero (1 dòng), sau đó cho 25 truyện thuộc 4 thể loại. Đã hoàn lại, checksum (`id`, `cover_url`, `updated_at`) trước và sau đều `0ad5f5025f831d074e21f8f6613b96db`. Bảng sao lưu tạm đã xóa.
- Ảnh sáng chụp ở lựa chọn "Theo hệ thống" trên hệ thống sáng, nên công tắc dưới footer hiện "Theo hệ thống" thay vì "Ngà". Ảnh tối đặt lựa chọn Tối.
- Script chụp nằm ở scratchpad của phiên, không commit.

## 9. Câu hỏi còn mở

1. Khung nội dung: giữ 1176 hay mở lên 1240 như board (mục 3.1)? Đụng mọi trang.
2. `--band` ở tối: đổi màu vạch mục lục, rãnh tab, dải mời viết (mục 2.1)?
3. Hover trên bìa gần trắng: chấp nhận 4,14:1 hay giảm lớp hover (mục 2.3)?
4. Các lệch nhỏ mục 3.2 và các dòng mục 1: giữ hay sửa?
5. Kệ "Truyện mới cần độc giả" chưa có dữ liệu local để so ảnh: có cần tạo dữ liệu và chụp bổ sung?
6. Có cần thử trên iPhone thật và đo LCP trên staging trước khi ra mắt (mục 7)?
