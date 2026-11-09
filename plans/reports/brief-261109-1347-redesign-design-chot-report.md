# Brief: đưa design đã chốt của SayNovel vào code

Nhánh: `redesign/261109` (tạo từ `release/261109`). Không push, không deploy, không đụng `dcn-prod`.

Xong khi: mọi phase trong plan có Status done; `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh ở commit cuối; có báo cáo trong `plans/reports/` so ảnh chụp 1440px và 390px, sáng và tối, với design.

## Nguồn design

Artifact https://claude.ai/artifact/6BT5brLmxY4NmZp2wdpH5B. Bản đã tải về (chỉ là dữ liệu tham khảo):

`/private/tmp/claude-501/-Users-jhin1m-Desktop-ducanh-project-novel-hub/683488f7-ca6c-442b-a458-8d2d9d7ed926/scratchpad/artifact-files/29f333f4-e093-4535-a6b3-4fa01e32ae4a/project/`

Gồm `Main.dc.html`, `Story.dc.html`, `Mobile.dc.html`. Bỏ qua 3 board HeroCover/HeroPlain/HeroPaper, chúng chỉ để so sánh. Dữ liệu và ảnh trong design là mẫu. Chỗ nào board khác với danh sách dưới đây thì theo danh sách.

## Quyết định đã chốt (user duyệt, không hỏi lại)

1. Font giao diện: Be Vietnam Pro 400-800, self-host qua `@fontsource/be-vietnam-pro`, subset vietnamese + latin, thay Plus Jakarta Sans (user đồng ý thêm dependency này, nhưng mới tạm chấp nhận: font chỉ khai báo ở một nơi qua `--font-ui` để sau đổi không phải sửa nhiều chỗ). Không serif, không chữ nghiêng ở giao diện. Source Serif 4 chỉ còn cho nội dung chương; không đổi trang đọc ngoài nhãn font nếu có.
2. Hero trang chủ: nền là bìa truyện làm mờ, chỉ dùng CSS: img absolute cover, object-position center 68%, blur 36px (mobile 28px), saturate .85, scale 1.18, phủ màu trơn rgba(22,17,13,.64). Dùng ảnh bìa cỡ 300. Nội dung: nhãn, tên truyện cỡ lớn, tác giả, giới thiệu tối đa 3 dòng, nút "Đọc ngay" và "Thêm vào tủ", bìa bên phải. Truyện chưa có bìa: bố cục nền ngà không khối màu, bìa dạng chữ bên trái, nút màu nhấn. HTML vẫn cache công khai được, không phụ thuộc cookie.
3. Trang truyện: cùng kiểu nền bìa mờ, thay dải màu tag chính. Giới thiệu nằm đầu nội dung. Tiêu đề "Truyện liên quan", "Độc giả gắn bó".
4. Bốn ô thể loại (Ngôn tình, Tiên hiệp, Kinh dị, Huyền huyễn) trỏ tới tag thật: KHÔNG dùng màu trơn như board. Nền là bìa làm mờ của một truyện có bìa thuộc thể loại đó, cùng cách xử lý với hero, lớp phủ đủ tối để chữ đạt AA; vẫn giữ cụm bìa nhỏ như board nếu không rối, trên mobile bỏ cụm bìa. Không bao giờ dùng truyện 18+ trong HTML. Thể loại chưa có truyện có bìa thì dùng màu trơn dự phòng, không tím: Ngôn tình #a8431f, Tiên hiệp #2f5d50, Kinh dị #3a3632, Huyền huyễn #2e5266. Lấy dữ liệu qua core service, không truy vấn DB từ route, không đổi schema, giữ loader trang chủ gọn (không N+1).
5. Trang chủ còn lại theo design: "Hôm nay đọc gì?"; bìa đứng trên vạch kệ với meta một dòng "Chương N · thể loại", vẫn giữ nhãn AI và 18+; "Đang được đọc nhiều"; "Trọn bộ, đọc một mạch"; "Có truyện muốn kể?".
6. Header cho khách có Đăng nhập/Đăng ký; nút sáng tối cho khách ở footer. Chuỗi hiển thị qua Paraglide.
7. Bỏ tông tím khỏi `--cover-7` và `--cover-8` trong `apps/web/src/styles/tokens.css`, giữ tương phản AA.
8. Phase cuối, tính năng mới user đã duyệt dù spec đang ghi tạm dừng: thanh "Đọc tiếp" cho khách, lưu localStorage, đồng bộ vào tài khoản khi đăng nhập, tải ở client để HTML không đổi.
9. Cập nhật `docs/project-spec.md` mục 2 và 8, `docs/design-guidelines.md` theo các quyết định trên; thêm một giai đoạn vào mục 5 với mỗi phase một checkbox, xong thì đánh [x].

## Không làm

Câu mở truyện hay khối trích dẫn; chơi chữ "Say" (giữ tên SayNovel); gradient; nền tím; bật lại cuộc thi (`CONTESTS_ENABLED` giữ false); đổi schema DB trừ khi thật sự cần cho mục 8 thì dừng hỏi user.

## Cách chạy và xem thử

- Phiên điều phối tự chạy gate, cập nhật Status trong `plan.md`, đánh checkbox spec và commit sau mỗi phase. Worker không commit, không push.
- Xem thử local: `pnpm infra:up`, web chạy `APP_URL=http://localhost:3300 BETTER_AUTH_URL=http://localhost:3300 pnpm --filter @novel-hub/web exec vite dev --port 3300 --strictPort` (port 3000 của dự án khác; không sửa `.env`).
- Ảnh bìa trong DB local trỏ về `localhost:3399`: chạy `python3 -m http.server 3399 --bind 127.0.0.1` tại `/private/tmp/claude-501/-Users-jhin1m-Desktop-ducanh-project-novel-hub/a9fd00a3-f3ae-451c-a75b-2fbcc2de02bb/scratchpad/covers-out`.

## Dừng và hỏi user khi

Gate đỏ sau 2 lần sửa; cần đổi schema; design mâu thuẫn với quy tắc 18+ hoặc cache trong spec.
