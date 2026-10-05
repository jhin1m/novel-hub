# Cook phase 15: Báo cáo vi phạm và hàng chờ mod

Ngày 2026-10-05. Phase: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-15-bao-cao-hang-cho-mod.md`.

## Đã làm

- **Shared** `packages/shared/src/schemas/reports.ts`: `USER_REPORT_REASONS`, `REPORT_REASONS`, `REPORT_STATUSES`, `MODERATION_ACTIONS`, `reportCreateSchema`, `moderationActionSchema` (discriminated union theo `action`), `reportListQuerySchema`; `LIMITS.reportDetailMax` 1000, `LIMITS.modNoteMax` 500.
- **Policies** `core/policies/moderation.ts`: `canModerate` (mod/admin + active), `canModerateUser` (không tự xử mình, không đụng admin, chỉ admin đụng mod). Comment `policies/user.ts` dịch sang tiếng Anh, trỏ tới `banUser`.
- **Reports** `core/reports/*`: `createReport` (target tra theo khoá công khai, chỉ target nhìn thấy được; advisory lock theo (reporter, target); trùng open → `created: false`), `listReports` (ngữ cảnh dịch sang publicId/slug/number/username, kể cả nội dung ẩn/xoá; báo cáo `duplicate` dịch chương khớp + %; `detail` hỏng → bỏ phần khớp).
- **Moderation** `core/moderation/*`: `applyModerationAction` một transaction; ẩn/khôi phục truyện, chương (khoá story → chapter, `recomputeStoryCounters`), mute/unmute, `banUser`/`unbanUser` (status + xoá session + log + outbox, không chạm `stories`), `mergeTag` (khoá hai tag theo id, chuyển `story_tags` bỏ trùng, `main_tag_id`, **làm phẳng chuỗi**: mọi tag trỏ vào nguồn trỏ thẳng sang đích; outbox story `updated` kèm `previousTagSlugs`), dismiss/resolve; có `reportId` thì báo cáo đó + mọi báo cáo open cùng target → `resolved`.
- **API**: `POST /api/v1/reports` (requireAuth → rateLimit('report') → validate), `GET /api/v1/moderation/reports`, `POST /api/v1/moderation/actions` (requireRole mod/admin + core). Mã lỗi mới `INVALID_STATE` 409.
- **Web**: `ReportButton`/`ReportDialog` (trang truyện, cuối chương, trang tác giả; SSR giống nhau, hành vi chỉ ở client), `/moderation` (`ssr: false`, `noindex`, `no-store`, lọc trạng thái/lý do, phân trang, tab "Gộp tag", xác nhận trước khi khoá/gộp), link "Kiểm duyệt" trong menu tài khoản cho mod/admin.
- **Docs** `docs/moderation-guide.md`.

## Test

- Unit: schema reports, policy (bảng role × status × tự xử), route 401/403/400/429.
- Int core: ban/unban (session, log, outbox, stories không đổi, rollback), quyền, INVALID_STATE, ẩn chương (bộ đếm, outbox, đăng lại bị từ chối), ẩn/khôi phục truyện, song song với đăng chương (không deadlock), resolve báo cáo, gộp tag (kind, đã gộp, bỏ trùng, main tag, làm phẳng, event); reports (trùng, song song, target ẩn → 404, dịch ngữ cảnh, regex không lộ UUID ngoài `reportId`, lọc, phân trang).
- Int API: báo cáo 201/200/404 → hàng chờ → ẩn chương 200/409, 403, 404.
- E2E `apps/web/e2e/moderation.spec.ts`: người đọc báo cáo chương → mod mở `/moderation` từ menu → "Ẩn chương" → chương 404, báo cáo `resolved`, `content_events` chưa xử lý có `hidden`.
- `jobsForChange` cho user banned/unbanned đã có test từ phase 9/11 (`content/hooks.test.ts`).

Gate (sau khi sửa theo review): `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test` 576 ✓, `pnpm test:int` 291 ✓ (S3 skip như cũ), `pnpm test:e2e` 63 ✓.

## Review

`code-reviewer-261005-1747-phase-15-moderation-review-report.md` (7.5/10, 0 Critical). Đã sửa H1 (luật quyền áp cả cho nội dung của mod/admin và báo cáo về chính mình), M1 (deadlock gộp tag ↔ sửa truyện: tag khoá `no key update`, story khoá theo id; test xen kẽ tất định), M2 (test rollback ẩn/gộp), L1, L2, L5, L6. Không sửa L3, L4 (lý do trong report review).

## Lệch plan

- Khách bấm "Báo cáo" → `/sign-in` không kèm `?redirect=` (trang đăng nhập chưa hỗ trợ redirect; theo đúng mẫu `LibraryButton`). Thêm redirect cần kiểm chống open redirect, để việc riêng nếu cần.
- Đăng chương vào truyện `hidden_by_mod`: giữ hành vi phase 5 (chương đăng được, truyện vẫn ẩn), không "từ chối"; test phase 5 đã phủ.
- Link "Kiểm duyệt" chỉ nằm trong menu tài khoản (không thêm nút ở thanh header) để không làm tràn header mobile.
- Thêm file nhỏ `core/moderation/log-action.ts` (ghi `moderation_actions`, type lỗi) và `core/testing/moderation-fixture.ts`.

## Chưa làm

- Bước 9 smoke thủ công với worker thật (ban → trang/tìm kiếm mất nội dung, bỏ ban → trở lại): chưa chạy. Đường đi đã phủ bằng test: outbox event user (int), `jobsForChange` user (unit), purge/search-sync theo event user (phase 9/11).
- Gộp tag nguồn không còn truyện nào: không có event để purge trang tag cũ đang cache (ContentChange không có entity `tag`); trang cũ hết hạn theo TTL. Ghi trong hướng dẫn mod.

## Câu hỏi mở

- Có cần hỗ trợ `?redirect=` ở `/sign-in` để người báo cáo quay lại đúng trang không?
- Luật "mod không tác động mod/admin, không tự xử mình" đã áp cả cho nội dung (ẩn/khôi phục truyện, chương) theo hướng hạn chế; đóng báo cáo chỉ cấm khi về chính mình. User xác nhận hoặc đổi.
