# Đọc tiếp cho khách: merge localStorage, CLS, giới hạn storage (2026-11-09)

Nguồn: MDN Web Locks, MDN Storage quotas, WebKit blog 10218 (đã fetch). Phần khác = kinh nghiệm/thiết kế, ghi rõ "suy luận".

## 1. Merge khách -> tài khoản
- Thời điểm gọi: một nơi duy nhất, client, khi có session + có bản local chưa sync (effect ở root layout/hook session). Phủ cả email lẫn OAuth redirect vì đều kết thúc bằng "trang load với session mới"; không gắn vào callback đăng nhập (suy luận).
- Idempotent đa tab: `navigator.locks.request('rp-merge', {ifAvailable:true}, cb)`; cb nhận null => tab khác đang chạy, bỏ qua. Web Locks cùng origin, baseline từ 2022, chỉ HTTPS (MDN). Fallback không có `navigator.locks`: cứ gọi, vì server idempotent.
- Idempotency thật nằm ở server: endpoint kiểu upsert "chỉ ghi nếu `updated_at` client > bản server" (không +1, không append). Gọi 2 lần = không đổi. Lock chỉ giảm request thừa.
- Xoá local: chỉ sau khi API trả 2xx. Nên xoá có điều kiện: nếu local đã bị đọc tiếp thay đổi trong lúc request (so `updatedAt`), giữ lại. Sau đăng nhập, khi đã có session, ghi tiến độ đi thẳng API (đã có `reading_progress`), local chỉ còn là cache khách.
- Offline/lỗi: giữ local, không retry vòng; thử lại lần mount/đăng nhập tiếp theo (và event `online`). Không queue phức tạp (YAGNI).
- "Mới hơn thắng": server so `scroll`/`updated_at` per story. Rủi ro lệch đồng hồ client: dùng timestamp client chỉ để so với server cho cùng story; chặn `updatedAt` > now+vài phút (clamp về server now) để máy lệch tương lai không đè vĩnh viễn. Thay thế đơn giản hơn: tiến độ khách chỉ merge nếu server chưa có hàng cho story đó HOẶC chương khách > chương server (so theo số chương, không cần đồng hồ). Khuyến nghị cách sau + clamp (suy luận).
- Giới hạn payload: Zod trên server: tối đa N mục (đề xuất ≤20), mỗi mục `storyPublicId` (8 ký tự), `chapterNumber` int, `scrollPct` 0-100, `updatedAt` số; body < vài KB; rate limit sẵn có theo user. Không tin client cho `story_id`: tra theo public_id, bỏ qua truyện không tồn tại/không đọc được (`canReadChapter`, 18+).

## 2. CLS với HTML cache công khai
- HTML giống nhau cho mọi người => bắt buộc giữ chỗ. Cách: slot có chiều cao cố định (min-height = chiều cao thanh) luôn render ở SSR, rỗng/ẩn nội dung; không dùng `display:none` -> hiện (gây dịch). Hoặc slot position:fixed/overlay đáy trang thì không gây CLS.
- Inline script trong `<head>` (đã có pattern theme/reader settings): đọc localStorage, nếu có bản ghi thì `document.documentElement.dataset.resume='1'`. CSS: `[data-resume] .resume-slot{...}`. Giữ chỗ trước khi paint, kể cả khi chưa hydrate. Khách không có bản ghi: slot không chiếm chỗ (không dịch vì không từng chiếm).
- Script chỉ set 1 attribute, KHÔNG chèn text/DOM do React quản lý. Nội dung thanh (tên truyện, chương) render sau hydrate trong React từ state client: SSR và render đầu client cùng ra "rỗng", rồi `useEffect`/`useSyncExternalStore` (getServerSnapshot=null) cập nhật. Tránh mismatch: không đọc localStorage trong render. Attribute trên `<html>` do script đặt: thêm `suppressHydrationWarning` trên `<html>` nếu React/Start so attribute.
- Chiều cao slot cố định kể cả font chưa load; nội dung 1 dòng truncate. Fade-in opacity nội dung, không đổi layout.
- Chưa xác minh bằng đo thực: nên Lighthouse/CLS trace sau khi làm.

## 3. Storage
- Safari: dữ liệu script-writable (localStorage) bị xoá sau 7 ngày dùng Safari không tương tác với site (WebKit, MDN). Cookie server-set được miễn. Web app thêm vào Home Screen không bị tính (WebKit). => Khách Safari không quay lại trong 7 ngày sẽ mất; chấp nhận, ghi rõ là best-effort. Không đáng thêm cookie (HTML cache không đổi, cookie gửi mọi request, CF cache key).
- Quota ~5 MiB/origin localStorage (MDN); dữ liệu của ta vài KB, không đáng lo. Vẫn `try/catch` mọi `getItem/setItem/JSON.parse` (private mode có thể khác quota/xoá khi đóng, MDN; Safari cũ ném lỗi). Lỗi => coi như không có, không crash. Validate shape khi đọc (Zod/guard), dữ liệu có thể bị sửa/cũ phiên bản (đặt key có version `rp:v1`).
- Nhiều truyện hay một? Khuyến nghị lưu map nhỏ tối đa ~10-20 truyện (key theo publicId), UI thanh chỉ hiện 1 mục gần nhất. Lý do: merge trọn lịch sử khách vào `reading_progress` không tốn thêm (đã per story); chi phí code gần bằng một truyện. Nếu muốn tối giản tuyệt đối (YAGNI): một truyện, nhưng mất tiến độ các truyện khác khi đăng nhập. Chọn map, cắt LRU theo `updatedAt`.
- Ghi: debounce giống ghi tiến độ hiện có; không ghi mỗi scroll event; thêm `storage` event nếu cần đồng bộ thanh giữa tab (tuỳ chọn).

## Xếp hạng khuyến nghị
1. Map ≤20 truyện + merge một endpoint upsert idempotent + `ifAvailable` lock + slot cố định + data attribute từ head script.
2. Một truyện duy nhất (đơn giản hơn, mất dữ liệu).
Hạn chế nghiên cứu: không đo CLS thực, không kiểm tra Safari private hiện hành, không đọc code repo hiện tại (endpoint progress có sẵn hay không).

## Câu hỏi chưa giải quyết
- Endpoint ghi `reading_progress` hiện có hỗ trợ batch/so sánh `updated_at`? Cần endpoint mới hay mở rộng?
- Truyện/chương 18+ của khách: có merge không (khách chưa bật 18+ nên thực tế không có bản ghi)?
- Có sync ngược (server -> thanh) khi đã đăng nhập, hay thanh luôn đọc API?
