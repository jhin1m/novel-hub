# Hướng dẫn kiểm duyệt

Dành cho tài khoản `mod` và `admin`. Trang hàng chờ: `/moderation` (link "Kiểm duyệt" trong menu tài khoản, chỉ hiện với mod/admin).

## Hàng chờ báo cáo

- Lọc theo trạng thái (Đang chờ / Đã xử lý / Đã bỏ qua) và theo lý do. Mới nhất lên trước, 20 báo cáo mỗi trang.
- Mỗi báo cáo hiện mục bị báo cáo (truyện, chương, tài khoản hoặc bình luận) kèm link tới trang thật, trạng thái hiện tại (đã ẩn, tác giả đã xoá, tác giả đang bị khoá...), mô tả của người báo, người báo ("Hệ thống" với báo cáo tự động) và số báo cáo đang chờ cho cùng mục.
- Người dùng báo cáo được truyện, chương, tài khoản, bình luận với 5 lý do: vi phạm bản quyền, đạo văn, spam, nội dung cấm, gắn nhãn sai. Mỗi người chỉ có một báo cáo đang chờ cho mỗi mục; có giới hạn tần suất (`RATE_LIMITS.report` trong `packages/shared/src/rate-limits.ts`).
- Báo cáo không bao giờ tự ẩn nội dung; mod quyết định.

## Hành động

Mọi hành động ghi vào `moderation_actions` (ai, lúc nào, mục nào, ghi chú) trong cùng transaction với thay đổi. Bấm hành động từ một báo cáo đang chờ thì báo cáo đó và mọi báo cáo đang chờ khác của cùng mục chuyển sang "Đã xử lý".

| Hành động | Ý nghĩa | Đảo lại |
| --- | --- | --- |
| Ẩn truyện | Truyện và mọi chương biến mất khỏi trang công khai, tìm kiếm; tác giả vẫn viết, đăng chương nhưng truyện vẫn ẩn tới khi mod khôi phục | Khôi phục truyện |
| Ẩn chương | Chương trả 404, bộ đếm chương/chữ của truyện tính lại; tác giả không đăng lại được chương này | Khôi phục chương |
| Ẩn bình luận | Bình luận và cả nhánh trả lời của nó (nếu là bình luận gốc) biến mất khỏi khu bình luận; không báo cáo thêm được | Khôi phục bình luận |
| Cấm bình luận | Tài khoản vẫn đọc, theo dõi được nhưng không đăng bình luận (ô nhập thay bằng thông báo bị hạn chế) | Bỏ cấm bình luận |
| Khoá tài khoản | Đăng xuất ngay mọi phiên, không đăng nhập lại được; mọi truyện, chương, trang tác giả biến mất khỏi trang và tìm kiếm. Không sửa dữ liệu truyện | Mở khoá tài khoản |
| Gộp tag | Tab "Gộp tag": mọi truyện gắn tag cũ chuyển sang tag mới, URL tag cũ chuyển hướng 301 sang tag mới | Không có nút hoàn tác; sửa tay theo mục "Hoàn tác gộp tag thủ công" |
| Bỏ qua / Đánh dấu đã xử lý | Đóng một báo cáo mà không đổi nội dung | — |

Quyền: mod tác động lên reader và author; admin thêm cả mod. Không ai khoá được admin hay tự xử mình. Luật này áp cả cho nội dung: mod không ẩn/khôi phục truyện, chương, bình luận của mod khác hay của admin (để admin làm), không ai xử truyện của chính mình. Báo cáo về nội dung của mod/admin khác vẫn đóng được (bỏ qua, đánh dấu đã xử lý); báo cáo về chính mình hoặc nội dung của mình thì không. Mod bị cấm bình luận hoặc bị khoá thì mất quyền kiểm duyệt. Trang chỉ hiện các nút được phép.

Trang công khai được Cloudflare cache: sau khi ẩn hoặc khoá, worker purge cache và đồng bộ tìm kiếm qua outbox, thường trong vòng một phút. Worker dừng thì nội dung cũ còn trên CDN tới khi worker chạy lại.

## Bình luận

- Bình luận chương hai cấp: bình luận gốc và một cấp trả lời (trả lời một trả lời được gắn vào bình luận gốc). Văn bản thuần, tối đa 2.000 ký tự, không sửa được; người viết tự xoá được bình luận của mình.
- Người đăng phải đã xác thực email và không bị cấm bình luận; có giới hạn tần suất (`RATE_LIMITS.comment`, tài khoản mới chặt hơn).
- Bình luận của tài khoản bị khoá không hiện (không xoá dữ liệu, mở khoá là hiện lại). Bình luận gốc bị ẩn hoặc bị xoá thì cả nhánh trả lời không hiện.
- Hàng chờ hiện 200 ký tự đầu của bình luận bị báo cáo, người viết, chương và truyện chứa nó. Bình luận người viết đã xoá không khôi phục được.
- Bình luận tải ở trình duyệt khi người đọc cuộn gần cuối chương, không nằm trong HTML được cache, nên ẩn bình luận có tác dụng ngay, không cần purge CDN.

## Lưu ý

- **Mở khoá tài khoản:** tài khoản về trạng thái bình thường; nếu trước khi bị khoá họ đang bị cấm bình luận thì phải cấm lại. Chương hẹn giờ của tác giả đã quá giờ trong lúc bị khoá sẽ được đăng ngay ở lần quét kế tiếp (tối đa khoảng 60 giây), có thể đăng dồn nhiều chương.
- **Gộp tag:** chọn đúng tag đích trước khi xác nhận. Tag nào đã gộp vào tag nguồn trước đó cũng chuyển thẳng sang tag đích (không tạo chuỗi chuyển hướng nhiều bước). Gộp tag phổ biến sinh nhiều job purge, worker xử lý dần. Tag nguồn không còn truyện nào thì trang tag cũ có thể còn trong cache CDN tới khi hết hạn.
- **Báo cáo trùng lặp tự động:** chỉ bắt được chương chép gần nguyên văn (độ giống ước tính từ 70%). Chép rồi sửa nhiều (giống dưới khoảng 50%) gần như không bị phát hiện, cần người đọc báo cáo. Báo cáo tự động hiện "Giống N% với chương này" kèm link chương gốc. Bỏ qua một cặp trùng thì lần đăng lại có sửa nhẹ của cùng cặp sẽ không bị báo lại.
- Mô tả của người báo và ghi chú của mod là văn bản thuần, không ai ngoài mod/admin thấy. Tác giả không biết ai đã báo cáo.

## Hoàn tác gộp tag thủ công

Gộp tag là thao tác một chiều trên giao diện. Nếu gộp nhầm, admin có quyền vào Postgres sửa tay dựa trên bản ghi trong `moderation_actions`: với `action = 'merge_tag'`, cột `note` là JSON ghi đủ những gì đã đổi (ghi chú của mod nằm trong trường `note` của JSON).

| Trường | Ý nghĩa |
| --- | --- |
| `source`, `target` | Tag nguồn và tag đích (`id`, `slug`) |
| `repointedTags` | Các tag bị trỏ sang tag đích: tag nguồn (`previousCanonicalId = null`) và các tag đã gộp vào tag nguồn trước đó (`previousCanonicalId` = id tag nguồn) |
| `storyIds` | Mọi truyện bị đổi tag hoặc tag chính |
| `removedStoryTags` | Các dòng `story_tags` đã xoá (`storyId`, `tagId` cũ) |
| `addedTargetStoryIds` | Truyện được thêm tag đích do gộp (truyện không có ở đây đã có sẵn tag đích từ trước) |
| `mainTagChanges` | Truyện bị đổi `main_tag_id`, kèm giá trị cũ (`previousMainTagId`) |

Các bước, chạy trong **một transaction** (`begin; ... commit;`), thay `:log_id` bằng id dòng log:

```sql
begin;
-- Bản ghi gộp
create temp table m on commit drop as
  select note::jsonb as r from moderation_actions where id = :log_id and action = 'merge_tag';

-- 1. Trả các tag về chỗ cũ (tag nguồn thành tag chuẩn lại, tag con trỏ về tag nguồn)
update tags t set canonical_id = (x->>'previousCanonicalId')::uuid
  from m, jsonb_array_elements(m.r->'repointedTags') x where t.id = (x->>'id')::uuid;

-- 2. Gỡ tag đích khỏi truyện chỉ có nó nhờ gộp
delete from story_tags st using m, jsonb_array_elements_text(m.r->'addedTargetStoryIds') s
  where st.story_id = s::uuid and st.tag_id = (m.r->'target'->>'id')::uuid;

-- 3. Gắn lại tag cũ
insert into story_tags (story_id, tag_id)
  select (x->>'storyId')::uuid, (x->>'tagId')::uuid from m, jsonb_array_elements(m.r->'removedStoryTags') x
  on conflict do nothing;

-- 4. Trả tag chính
update stories st set main_tag_id = (x->>'previousMainTagId')::uuid
  from m, jsonb_array_elements(m.r->'mainTagChanges') x where st.id = (x->>'storyId')::uuid;
commit;
```

Sau đó:

- Ghi lại việc đã hoàn tác (ai, lúc nào, log id nào) ngoài hệ thống; hiện chưa có hành động mod "hoàn tác gộp tag" để ghi vào `moderation_actions`.
- Chạy `pnpm search:reindex` để tài liệu tìm kiếm của các truyện trong `storyIds` lấy lại tag cũ.
- Purge cache CDN: `pnpm cdn:purge -- --story <publicId>` cho từng truyện bị ảnh hưởng (lấy `public_id` từ `stories` theo `storyIds`), và purge trang `/tags/<slug>` của tag nguồn, tag đích, các tag con trên dashboard Cloudflare (trang tag nguồn đang cache phản hồi 301).

Truyện mà tác giả đã sửa tag sau khi gộp: kiểm tra từng truyện trước khi chạy bước 2–4, vì các bước trên ghi đè lựa chọn mới của tác giả. Một truyện vượt quá 10 tag sau bước 3 thì sửa tay.

