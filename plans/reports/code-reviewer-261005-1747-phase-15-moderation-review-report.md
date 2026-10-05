# Code review phase 15: báo cáo vi phạm và hàng chờ mod

Reviewer: subagent `code-reviewer` (2026-10-05). Subagent không được ghi file nên lead lưu lại. Điểm: **7.5/10**. Critical: 0.

## Findings và xử lý

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| H1 | High | Luật "không tự xử mình / mod không đụng mod, admin" chỉ áp cho hành động lên user; mod tự khôi phục truyện của mình, tự bỏ qua báo cáo về mình, ẩn nội dung admin | **Đã sửa**: `lockStory` (`core/moderation/content-visibility.ts`) áp `canModerateUser` lên tác giả; `closeReport` cấm đóng báo cáo về chính mình/nội dung của mình (báo cáo về nội dung mod/admin khác vẫn đóng được, để không kẹt hàng chờ); `applyModerationAction` cấm dùng `reportId` về chính mình. Test int mới |
| M1 | Medium | Deadlock gộp tag ↔ sửa truyện (`FOR UPDATE` trên tag chặn khoá key-share của FK) | **Đã sửa**: tag khoá `no key update`, story bị ảnh hưởng khoá theo id trước khi ghi. Test xen kẽ tất định: thất bại (deadlock) với khoá cũ, xanh với bản sửa |
| M2 | Medium | Chỉ ban có test rollback; e2e chưa xác minh | **Đã sửa**: test rollback cho ẩn truyện, ẩn chương, gộp tag. E2E thực tế đã chạy (63/63) trước và sau sửa |
| L1 | Low | `ReportButton` khi `me` lỗi bật mà không làm gì | **Đã sửa**: disabled |
| L2 | Low | Card luôn hiện nút khoá/ẩn kể cả khi server sẽ từ chối | **Đã sửa**: `canActOn` (gương của `canModerateUser`) ẩn nút; thêm `role` vào `StoryContext.author` |
| L3 | Low | Race đăng nhập song song với ban có thể để lại một session | Không sửa: `sessionMiddleware` + `createSessionCreateBefore` coi user bị ban là khách |
| L4 | Low | `openCounts` lọc `target_id` không kèm `target_type` | Không sửa: bảng nhỏ |
| L5 | Low | Bỏ ban về `active`, mất trạng thái mute trước đó | **Đã ghi** vào `docs/moderation-guide.md` và comment `unbanUser` |
| L6 | Low | `banUser`/`mergeTag`... export nhưng bỏ qua kiểm quyền | **Đã ghi** comment chỉ `applyModerationAction` gọi |

## Không regression

Đăng chương, `canReadChapter`, `publicStoryWhere`, catalog, trang đọc giữ nguyên. `/api/v1` chỉ thêm route. Không lộ UUID ngoài `reportId`.

## Câu hỏi mở

- Luật quyền với nội dung của mod/admin: lead chọn áp như với tài khoản (hướng hạn chế hơn), riêng đóng báo cáo chỉ cấm tự xử. Cần user xác nhận nếu muốn khác.
