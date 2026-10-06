---
phase: 1
title: "Bình luận chương hai cấp"
status: done
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Bình luận chương hai cấp

## Context Links

- Spec: §5 Gđ2 checkbox 1, §7 (muted không đăng bình luận, rate limit, báo cáo), §8 "Cuối chương … bình luận thêm ở Giai đoạn 2", §10 (`comments.paragraph_id` để sẵn)
- Scout: `reports/scout-261006-0225-backend-report.md` §1, §4–7; `reports/scout-261006-0225-frontend-tests-report.md` §2, §8, §12
- Research: `research/researcher-01-comments-follows-notifications-ratings.md` §1 (bỏ phần Redis đếm, linkify, sửa bình luận)

## Overview

Bình luận dưới mỗi chương: gốc + một cấp trả lời, tải ở client khi cuộn tới cuối chương. Người đăng: email đã xác thực, không bị mute. Tự xoá được bình luận của mình; mod ẩn/khôi phục qua báo cáo. Checkbox 1 **chưa** `[x]` (phase 2 làm nốt bình luận theo đoạn).

## Key Insights

- Bảng `comments` có sẵn (`packages/db/src/schema/community.ts:36-61`): `parent_id` self-FK không ràng buộc cấp, `status` text default `'visible'`, index (chapter_id, created_at). Thiếu CHECK độ dài, index cho keyset gốc/trả lời.
- Rate limit action `comment` đã có (`packages/shared/src/rate-limits.ts:92-99`, tài khoản mới chặt hơn).
- `findReadableChapterRef(db, publicId, number)` (`packages/core/src/reader/readable-chapter-ref.ts:17`) là cổng duy nhất: chương đọc được mới cho đọc/đăng bình luận.
- `muted` chưa chặn gì (`core/src/moderation/user-status.ts:55-56` ghi "Muting only blocks comments").
- Báo cáo chưa có target `comment` (`shared/src/schemas/reports.ts:24`); `TargetContext` switch ở `apps/web/src/components/moderation/report-target-context.tsx:71-104`.
- Trang đọc không dùng `SiteLayout`, HTML cache 1 ngày → mọi thứ bình luận ở client. Chèn sau `<ChapterEnd>` (`routes/stories.$storyKey.chapter-{$number}.tsx:133-143`), dùng token `reader-*`.
- E2E tạo user đã xác thực bằng `signUpVerified` (`apps/web/e2e/helpers/accounts.ts`), mod bằng SQL (`moderation.spec.ts:41`).

## Requirements

**Functional**
- Danh sách gốc mới nhất trước, 20/trang, keyset `(created_at, id)`; mỗi gốc kèm `replyCount` và tối đa 3 trả lời cũ nhất; "Xem thêm phản hồi" tải tiếp 20/lần.
- Đăng gốc hoặc trả lời. Trả lời một trả lời → server gắn vào gốc của nó (`parent_id` luôn là gốc).
- Tổng số bình luận hiển thị ở tiêu đề khu ("Bình luận (N)"): đếm gốc + trả lời đang hiện.
- Tự xoá (xoá mềm `status = 'deleted'`); gốc bị xoá/ẩn → cả nhánh không hiện.
- Không hiện bình luận của tài khoản `banned`.
- Báo cáo bình luận (lý do như hiện có), target `{type:'comment', commentId}`; mod `hide_comment` / `restore_comment` từ hàng chờ, ghi `moderation_actions`. Mod không tự xử bình luận của mình, không xử bình luận của mod/admin khác (`canModerateUser`), không đóng báo cáo về bình luận của mình (`targetOwnerId`). <!-- Red Team: mod self-guard -->
- `commentId` (UUID) là ngoại lệ có chủ đích của quy tắc "báo cáo chỉ dùng khoá công khai" (`shared/src/schemas/reports.ts:49`): bình luận không có khoá công khai nào khác; UI không hiển thị nó. Sửa doc comment ở đó; test "rejects internal ids" vẫn từ chối dạng `{type:'comment', id}` trần. <!-- Red Team: report target shape -->
- Khách thấy danh sách + link đăng nhập; chưa xác thực thấy lời nhắc xác thực; muted thấy thông báo bị hạn chế (không hiện ô nhập).

**Non-functional**
- HTML trang đọc không đổi (không cookie, không bình luận). Không request API nào khi người đọc chưa cuộn tới gần cuối chương.
- Body: trim, chuẩn NFC, bỏ ký tự điều khiển (giữ `\n`), gộp > 2 dòng trống liên tiếp, 1–`LIMITS.commentMax` (2.000) ký tự; render bằng text node + `whitespace-pre-line`, không `dangerouslySetInnerHTML`.
- Mọi chuỗi qua Paraglide (`comment_*`).

## Architecture

```
reader route ──(sau ChapterEnd)──> <ChapterComments publicId number />
   └─ IntersectionObserver → useChapterComments (infinite) ── GET /api/v1/comments?story&chapter&cursor
      CommentComposer ── POST /api/v1/comments {publicId, chapterNumber, parentId?, body}
      CommentItem ── DELETE /api/v1/comments/:id · ReportButton target {type:'comment', commentId}
      "Xem thêm phản hồi" ── GET /api/v1/comments/:id/replies?cursor

Hono comments sub-app → core/comments/* → findReadableChapterRef + canPostCommunityContent
/moderation → applyModerationAction {action:'hide_comment'|'restore_comment', commentId}
```

- Migration (`pnpm db:generate`, tên gợi ý `comment_threads`): CHECK `char_length(body) between 1 and 2000`; thay index `(chapter_id, created_at)` bằng `comments_chapter_roots_idx (chapter_id, created_at desc, id desc) where parent_id is null`; `comments_parent_idx (parent_id, created_at, id)` thay index `parent_id` cũ. `status` vẫn text + Zod (`COMMENT_STATUSES = ['visible','deleted','hidden_by_mod']`).
- Cursor: chuỗi base64url của `{createdAt micros, id}` — chép cách `core/src/reading/history.ts:28-33` so sánh tuple micro giây.
- **Từ vựng nhật ký mod** <!-- Red Team: moderation log vocab -->: `MODERATION_ACTIONS` hiện vừa là body của `POST /moderation/actions` vừa là kiểu `action` của `logModerationAction` (`core/src/moderation/log-action.ts:8-19`, test 1:1 ở `shared/src/schemas/reports.test.ts:43-58`). Phase này tách `MODERATION_LOG_ACTIONS` = `MODERATION_ACTIONS` ∪ action chỉ-ghi-log (phase 8, 9 thêm vào đây), `logModerationAction` nhận `ModerationLogAction`; `ModerationTarget.type` thêm `comment` (phase 4 thêm `rating`, phase 9 thêm `contest`). One-click action mới (`hide_comment`/`restore_comment`) vẫn vào `MODERATION_ACTIONS` + `ACTION_LABELS` + case `dispatch`.
- **Guard mod** <!-- Red Team: mod self-guard -->: `setCommentHidden` khoá dòng comment, đọc người viết (id, role), gọi `canModerateUser(actor, author)` như `lockStory` (`core/src/moderation/content-visibility.ts:12-38`); `targetOwnerId` (`core/src/moderation/resolve-reports.ts:8-26`) thêm nhánh `comment` → `comments.user_id`.
- **Mã lỗi** <!-- Red Team: error codes -->: theo quy ước hiện có (`packages/api/src/lib/core-errors.ts:5-26`) dùng lại `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE`; mã mới duy nhất của phase: `USER_MUTED` (403). Email chưa xác thực chặn ở middleware `requireVerifiedEmail` (`EMAIL_NOT_VERIFIED`), core trả `FORBIDDEN` làm lớp phòng thủ.
- DTO trả về client: `{ id, body, createdAt, author: {username, displayName}, isOwn, replyCount?, replies? }` — không lộ user id; `id` comment là UUID nhưng UI không hiển thị.

## Related Code Files

| Hành động | File |
|---|---|
| Modify | `packages/db/src/schema/community.ts` (CHECK, index) + migration mới trong `packages/db/drizzle/` |
| Modify | `packages/shared/src/limits.ts` (`commentMax: 2000`) |
| Create | `packages/shared/src/schemas/comment.ts` (+ `.test.ts`): `COMMENT_STATUSES`, `commentCreateSchema`, `commentListQuerySchema`, `commentRepliesQuerySchema`, `commentIdParamSchema`, DTO types; re-export ở `src/index.ts` |
| Modify | `packages/shared/src/schemas/reports.ts` (+ `reports.test.ts`): target `comment` {commentId}; action `hide_comment`, `restore_comment`; `MODERATION_LOG_ACTIONS` + type `ModerationLogAction`; doc comment khoá công khai |
| Modify | `packages/core/src/moderation/log-action.ts` (`ModerationLogAction`, `ModerationTarget.type` + `comment`), `moderation/resolve-reports.ts` (`targetOwnerId` comment) |
| Create | `packages/core/src/policies/community.ts` (+ `.test.ts`): `canPostCommunityContent(user)` |
| Create | `packages/core/src/lib/plain-text.ts` (+ test): `normalizePlainText(raw, max)` dùng chung cho bình luận, review (phase 4), mô tả cuộc thi (phase 9) |
| Create | `packages/core/src/comments/comment-cursor.ts` (+ test) |
| Create | `packages/core/src/comments/create-comment.ts`, `list-comments.ts`, `list-replies.ts`, `delete-comment.ts`, `comments.int.test.ts` |
| Create | `packages/core/src/moderation/comment-visibility.ts`: `setCommentHidden(tx, actor, commentId, hidden, note)` |
| Modify | `packages/core/src/moderation/apply-action.ts` (dispatch), `reports/create-report.ts` (`resolveVisibleTarget` comment), `reports/list-reports.ts` + `reports/report-context.ts` (DTO comment: excerpt ≤ 200 ký tự, chương, truyện, tác giả + status), `core/src/index.ts` |
| Create | `packages/api/src/routes/comments.ts` (+ `comments.int.test.ts`) |
| Modify | `packages/api/src/app.ts` (mount `/comments`), `lib/core-errors.ts` (`USER_MUTED` 403) |
| Create | `apps/web/src/lib/comments.ts` (hook), `apps/web/src/lib/use-near-viewport.ts` (IntersectionObserver, dùng lại ở phase 4) |
| Create | `apps/web/src/components/comments/chapter-comments.tsx`, `comment-list.tsx`, `comment-item.tsx`, `comment-composer.tsx` (+ `comment-item.test.tsx` kiểu `renderToStaticMarkup`) |
| Modify | `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx` (chèn `<ChapterComments>` sau `<ChapterEnd>`), `components/reader/chapter-end.tsx` (bỏ dòng doc "Comments come later") |
| Modify | `apps/web/src/components/report/report-dialog.tsx` (tiêu đề cho comment), `components/moderation/report-target-context.tsx`, `components/moderation/report-actions.ts` (+ test) |
| Modify | `packages/shared/messages/vi.json` (`comment_*`, `moderation_action_hide_comment`, `moderation_target_comment`, `error_user_muted`, …) |
| Create | `apps/web/e2e/comments.spec.ts` |
| Modify | `docs/moderation-guide.md` (mục bình luận) |

## Function / Interface Checklist

- [x] `canPostCommunityContent(user: PolicyUser): boolean` — `emailVerified && status === 'active'`
- [x] `normalizePlainText(raw: string, max: number): string | null` — null khi rỗng hoặc vượt giới hạn
- [x] `createComment(db, actor, input) → Result<CommentDto, 'NOT_FOUND'|'INVALID_STATE'|'USER_MUTED'|'FORBIDDEN'>` (`INVALID_STATE` = parent không thuộc chương/không visible)
- [x] `listChapterComments(db, viewer|null, {publicId, number, cursor}) → Result<{total, items, nextCursor}, 'NOT_FOUND'>`
- [x] `listCommentReplies(db, viewer|null, {commentId, cursor}) → Result<{items, nextCursor}, 'NOT_FOUND'>` — join gốc → chương → truyện → users và chạy `canReadChapter`; gốc phải là gốc (`parent_id is null`), `visible`, người viết không bị ban; sai bất kỳ điều kiện nào → `NOT_FOUND` <!-- Red Team: replies readability -->
- [x] `deleteComment(db, actor, commentId) → Result<void, 'NOT_FOUND'|'FORBIDDEN'>` (chủ bình luận; mod dùng action ẩn)
- [x] `setCommentHidden(...)` trả `ModerationTarget` `{type:'comment', id}` để `resolveReportsFor` đóng báo cáo
- [x] Route: `GET /comments`, `POST /comments` (`requireVerifiedEmail` → `rateLimit(deps,'comment')` → `validate`), `GET /comments/:id/replies`, `DELETE /comments/:id` (`requireAuth`)

## Implementation Steps

1. Shared: `commentMax`, schema `comment.ts`, mở rộng `reports.ts` (target + action, discriminated union). Unit test schema.
2. DB: sửa `community.ts`, `pnpm db:generate`, kiểm SQL sinh ra (CHECK, drop/create index), `pnpm db:migrate`.
3. Core: policy cộng đồng → `normalizePlainText` → cursor → create/list/replies/delete. `createComment` trong transaction: `findReadableChapterRef`; nếu `parentId` thì đọc parent cùng `chapter_id`, đang `visible`, lấy `coalesce(parent.parent_id, parent.id)` làm gốc; kiểm policy (chưa xác thực → `FORBIDDEN` làm lớp phòng thủ sau middleware; muted → `USER_MUTED`). Danh sách join `users` lọc `status <> 'banned'` và `comments.status = 'visible'`; trả lời của gốc ẩn/xoá không trả. `total` = một `count(*)` (gốc visible + trả lời visible có gốc visible). Gốc và trả lời 3 đầu lấy bằng 2 query (gốc trang hiện tại, rồi `row_number() over (partition by parent_id order by created_at, id) <= 3`).
4. Moderation: tách `MODERATION_LOG_ACTIONS`, mở rộng `ModerationTarget`; `setCommentHidden` (khoá dòng, `canModerateUser`, đổi `visible` ↔ `hidden_by_mod`; không động vào `deleted`), `targetOwnerId` comment, dispatch, `resolveVisibleTarget` (comment còn tồn tại, chương đọc được), DTO ngữ cảnh cho hàng chờ.
5. API: sub-app `comments` dạng chain, mount, mã lỗi + message i18n key. Int test: khách GET được; POST khách 401, chưa xác thực 403 `EMAIL_NOT_VERIFIED`, muted 403 `USER_MUTED`, chương nháp/ẩn 404 `NOT_FOUND`, replies của gốc thuộc chương bị ẩn 404, trả lời cấp 2 bị gắn về gốc, xoá của người khác 403, rate limit 429.
6. Web: hook (key `['comments', publicId, number]` cho danh sách — không đặt dưới `me` vì là dữ liệu công khai; `isOwn` tính theo session nên invalidate khi đăng nhập/xuất bằng cách thêm `me?.id` vào key), `useNearViewport`, component. Composer: textarea + đếm ký tự + nút "Gửi" (pill `default`), trạng thái theo `useMe` (khách / chưa xác thực / muted / ok). Thêm mới thì invalidate danh sách; xoá dùng `ConfirmDialog` hiện có. Khu dùng `reader-*` token, nằm trong `.reader-column` bên trong `<main inert={gated}>`, nên chương 18+ còn bị màn cảnh báo thì khu bình luận cũng bị khoá và không tải (observer không chạy khi `gated`).
7. Moderation UI: `case 'comment'` (trích đoạn + `ChapterLine` + `StoryLine` + người viết), action ẩn/khôi phục + nhãn, test `report-actions`.
8. i18n, `pnpm i18n:compile`. Doc moderation-guide.
9. E2E `comments.spec.ts` (xem ma trận). Chạy gate.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `normalizePlainText`: NFC, trim, ký tự điều khiển, 3+ dòng trống, rỗng → null, 2.001 ký tự → null |
| Unit | cursor encode/decode, cursor hỏng → coi như trang đầu hoặc lỗi 400 (chọn 400 `VALIDATION_ERROR`) |
| Unit | `canPostCommunityContent` 4 tổ hợp verified × status; `reportTargetSchema` nhận comment |
| Int (core) | gốc/trả lời/keyset 25 gốc → 2 trang; trả lời cấp 2 gắn về gốc; gốc ẩn → nhánh ẩn, total giảm; user banned → biến mất; chương hidden_by_mod → `NOT_FOUND` (cả list lẫn replies); xoá người khác → `FORBIDDEN`; mod ẩn bình luận của chính mình hoặc của admin → `FORBIDDEN`; mod không `dismiss_report` được báo cáo về bình luận của mình |
| Int (api) | mã lỗi/status như bước 5; `hide_comment` qua `/moderation/actions` đóng báo cáo mở |
| Unit (web) | `CommentItem` render body có `<script>` thành text; nút xoá chỉ khi `isOwn` |
| E2E | user xác thực đăng gốc + trả lời, reload vẫn thấy, tự xoá; khách thấy link đăng nhập; mod ẩn bình luận bị báo cáo → người đọc không còn thấy; trang chương không có `Set-Cookie` và không request `/api/v1/comments` trước khi cuộn |

## Dependency Map

- Cần: `findReadableChapterRef`, `rateLimit` middleware, `requireVerifiedEmail`, `applyModerationAction`, `ConfirmDialog`, `ReportButton`, `useMe`.
- Cung cấp cho sau: `canPostCommunityContent` (phase 2, 4), `useNearViewport` (phase 4), cấu trúc `components/comments/*` + hook (phase 2), mẫu thêm target báo cáo (phase 4).

## Todo List

- [x] Shared schema + limits + reports
- [x] Migration
- [x] Core service + policy + moderation
- [x] Hono sub-app + mã lỗi
- [x] UI khu bình luận + moderation
- [x] i18n + docs
- [x] Test unit/int/e2e, gate xanh

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] Bình luận hai cấp hoạt động end-to-end, muted bị chặn, mod ẩn/khôi phục được
- [x] HTML trang chương không đổi (vẫn `public`, không cookie); API bình luận chỉ gọi khi gần cuối chương
- [x] Checkbox 1 spec **giữ** `[ ]`

## Risk Assessment

- Trả lời đếm sai khi gốc ẩn → test int bắt buộc cho `total`.
- IntersectionObserver không kích hoạt khi chương rất ngắn (khu đã nằm trong viewport lúc tải) → observer vẫn báo intersect ngay lần đầu; kiểm trong e2e với chương ngắn.
- Spam: rate limit có sẵn + muted + báo cáo; chưa có lọc từ khoá (ngoài phạm vi).

## Security Considerations

- Body không bao giờ thành HTML; Zod giới hạn trước khi chạm DB; CHECK DB làm lớp hai.
- Quyền xoá kiểm ở core (chủ bình luận); mod chỉ qua `applyModerationAction` (`canModerate`).
- Không trả user id, email; `isOwn` tính phía server.

## Next Steps

Phase 2: bình luận theo đoạn dùng lại hook, composer, list với tham số `paragraphId`.

## Implementation Log

### 2026-10-06 — cook --auto
Gate xanh: `pnpm typecheck`, `lint`, `format:check`, `test` (713), `test:int` (318, 1 skip S3), `test:e2e` (96). Checkbox 1 spec **giữ** `[ ]` (phase 2 làm nốt). Migration `0003_comment_threads.sql`.

Lệch so với plan (tất cả `[auto]`, sáng user duyệt):
- [auto] `normalizePlainText` đặt ở `packages/shared/src/plain-text.ts` (không phải `core/lib`): Zod `commentCreateSchema` và bộ đếm ký tự của form dùng chung; phase 4, 9 import từ `@novel-hub/shared`. Lý do: một nguồn chuẩn hoá cho API và form.
- [auto] Cursor dạng `${micros}_${uuid}` (như `historyCursorSchema`), không base64url; Zod regex chặn cursor hỏng → 400 `VALIDATION_ERROR`. Lý do: tiền lệ history, không cần mã lỗi mới.
- [auto] `createComment` không bọc transaction (ghi trong JSDoc): gốc bị ẩn giữa chừng thì trả lời mới ẩn theo. Lý do: `findReadableChapterRef` nhận `Db`, không có lợi ích thực.
- [auto] Index gốc khai báo tăng dần `(chapter_id, created_at, id) where parent_id is null`, quét ngược cho "mới nhất trước" (khớp `ORDER BY … DESC` mặc định NULLS FIRST, index DESC sinh `NULLS LAST` thì không khớp).
- [auto] `total` chỉ tính ở trang đầu (`null` ở trang sau) — reviewer L5, tránh đếm lại cả chương mỗi trang.
- [auto] `CommentContext.id` (UUID) trả cho mod để gửi action `hide_comment`; UI không hiển thị.
- [auto] Văn bản chỉ gồm ký tự vô hình (zero-width) coi như rỗng; `U+2028/2029` → xuống dòng.
- [auto] Test web thuần (`comment-body.test.tsx`) thay cho `comment-item.test.tsx`: vitest gốc không có alias `@/`, không đổi config.

Review (`code-reviewer`): 0 Critical, 1 High (alias test — sửa bằng tách module thuần), 2 Medium (map `USER_MUTED`; trùng trả lời sau khi xoá — dedupe + `startCursor` trong query key), 5 Low (đều sửa: trả lời mới hiện ngay, thông báo lỗi riêng cho bình luận, không báo cáo được trả lời trong nhánh ẩn, ký tự vô hình, đếm total).

Câu hỏi mở:
- Chương 18+: API bình luận đọc/đăng không kiểm `preferences.showMature` (màn cảnh báo chỉ ở client, như HTML chương). Giữ hay yêu cầu bật 18+ mới được đăng?
- `e2e/library.spec.ts:59` ("continue reading") fail 1 lần khi tester chạy full suite, chạy riêng 3/3 xanh, full suite lần 2 xanh: flaky dưới tải, không liên quan bình luận.
