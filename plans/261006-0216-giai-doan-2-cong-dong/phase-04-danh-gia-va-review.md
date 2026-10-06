---
phase: 4
title: "Đánh giá và review"
status: pending
priority: P1
effort: "1d"
dependencies: [3]
---

# Phase 4: Đánh giá và review

<!-- Red Team: bỏ cột tổng trên stories (tính bằng GROUP BY lọc ban), review bị ẩn không hồi sinh bằng xoá + đăng lại, guard mod, từ vựng log -->

## Context Links

- Spec: §5 Gđ2 checkbox 3, §4 (`ratings`: mỗi user một đánh giá/truyện, `score` nguyên 1–5), §7 (báo cáo, mod, tài khoản bị ban thì nội dung bị ẩn), §6 (phần động tải ở client)
- Phase 1: `canPostCommunityContent`, `normalizePlainText`, `useNearViewport`, `MODERATION_LOG_ACTIONS`, mẫu guard mod + target báo cáo
- Scout: backend §1 (`ratings` thiếu `id`, `updated_at`, trạng thái), §6; frontend §3 (vị trí trong trang truyện)
- Research: `research/researcher-01-comments-follows-notifications-ratings.md` §3 (bỏ cột tổng, job tính lại, helpful vote)

## Overview

Người đọc chấm 1–5 sao kèm review tuỳ chọn cho một truyện; sửa hoặc xoá được. Trang truyện có khu "Đánh giá" (tải ở client khi cuộn tới): điểm trung bình, số lượt, phân bố 5→1, form của tôi, danh sách review. Mod ẩn/khôi phục review qua báo cáo. Xong phase đánh `[x]` checkbox 3.

## Key Insights

- `ratings` (`packages/db/src/schema/community.ts:64-81`): PK (user_id, story_id), `score smallint CHECK 1..5`, `review text null`, `created_at`, index `story_id`. Không có `id` đơn → `reports.target_id` (uuid) không trỏ được → thêm cột `id uuid unique default uuidv7()`.
- **Không** thêm cột tổng vào `stories`: `updatedAt` của `stories` tự bump mỗi lần update (`packages/db/src/schema/columns.ts:15-19`) và nuôi `lastmod` sitemap, thứ tự `/write`; tổng trên cột còn tính cả người bị ban (trái spec §7). Tổng + phân bố lấy bằng **một** `GROUP BY score` trên đánh giá `visible` của người không bị ban (≤ 5 dòng, có index `story_id`).
- HTML trang truyện cache 1 ngày (`routes/stories.$storyKey.index.tsx`, `PUBLIC_CACHE`) → điểm không vào SSR; khu đánh giá là `<section>` sau mục lục trong `<article>` (:70-115), tải lười bằng `useNearViewport`.
- Chưa có component radio/sao; dùng `<fieldset>` + 5 `<input type="radio">` ẩn trực quan + nhãn icon `Star` (lucide) — không thêm shadcn.

## Requirements

**Functional**
- Đánh giá: đăng nhập + `canPostCommunityContent` (email xác thực, không muted → `USER_MUTED`); truyện công khai có ≥ 1 chương đã đăng (không thì `NOT_FOUND`); không phải tác giả (`FORBIDDEN`).
- `PUT /ratings` `{ publicId, score: 1..5, review?: string ≤ LIMITS.reviewMax (5000) }` tạo hoặc sửa (upsert); review chuẩn hoá bằng `normalizePlainText`, rỗng → `null`. Sửa không đổi `created_at`, cập nhật `updated_at`.
- `DELETE /ratings?story=<publicId>` xoá đánh giá của mình (xoá hẳn dòng).
- **Đánh giá đang bị mod ẩn** (`status = 'hidden_by_mod'`): `PUT` và `DELETE` trả 409 `RATING_HIDDEN` — người viết không tự gỡ trạng thái ẩn bằng cách xoá rồi đăng lại. <!-- Red Team: hidden rating revive -->
- `GET /ratings?story=<publicId>&cursor` (công khai): `{ summary: {count, average (1 chữ số thập phân) | null, distribution: {1..5}}, reviews: [{id, score, review, createdAt, updatedAt, author:{username, displayName}, isOwn}], nextCursor }`; summary và reviews chỉ gồm đánh giá `visible` của người viết không bị ban; `reviews` chỉ gồm mục có `review` khác null, mới cập nhật trước, 10/trang.
- `GET /ratings/mine?story=<publicId>` → đánh giá của tôi (kèm `status`) hoặc `null`; UI hiện "Đánh giá của bạn đang bị ẩn" và khoá form khi `hidden_by_mod`.
- Báo cáo target `{type:'rating', ratingId}`; action one-click `hide_rating` / `restore_rating` (vào `MODERATION_ACTIONS`, `ACTION_LABELS`, `dispatch`); `ModerationTarget.type` thêm `rating`; `targetOwnerId` thêm nhánh `rating` → `ratings.user_id`; `setRatingHidden` gọi `canModerateUser(actor, author)`. <!-- Red Team: mod self-guard, log vocab -->
- Rate limit action mới `rate` (user 10/10 phút, tài khoản mới 5/10 phút, IP 30/10 phút).

**Non-functional**
- Không cột tổng, không job, không khoá `stories`. Mọi số liệu tính lúc đọc.
- Không đổi HTML SSR; không request khi chưa cuộn tới khu.

## Architecture

```
StoryPage <article> … StoryChapterList → <StoryRatings publicId isAuthorView />
  useNearViewport → useStoryRatings (GET /ratings) + useMyRating (GET /ratings/mine, chỉ khi có me)
  RatingSummary (trung bình, số lượt, thanh phân bố bằng div % — không SVG)
  RatingForm (StarInput + textarea + Lưu/Xoá) — trạng thái khách/chưa xác thực/muted/tác giả/bị ẩn
  ReviewList → ReviewItem (+ ReportButton target {type:'rating', ratingId})
core/ratings: upsertRating / deleteRating (đọc dòng cũ FOR UPDATE; hidden → RATING_HIDDEN)
              ratingSummary: SELECT score, count(*) … WHERE story_id AND status='visible' AND author not banned GROUP BY score
moderation: setRatingHidden (khoá dòng rating, canModerateUser, visible ↔ hidden_by_mod)
```

- Migration (gợi ý `ratings_moderation`): `ratings.id uuid not null default uuidv7() unique`, `ratings.status text not null default 'visible'`, `ratings.updated_at timestamptz not null default now()`; index `ratings_story_reviews_idx (story_id, updated_at desc, id desc) where status = 'visible' and review is not null`.
- `RATING_STATUSES = ['visible','hidden_by_mod']` (text + Zod).

## Related Code Files

| Hành động | File |
|---|---|
| Modify | `packages/db/src/schema/community.ts` (ratings) + migration mới |
| Modify | `packages/shared/src/limits.ts` (`reviewMax: 5000`), `rate-limits.ts` (`rate`), `schemas/reports.ts` (+ `reports.test.ts`: target `rating` {ratingId}, action `hide_rating`/`restore_rating`) |
| Create | `packages/shared/src/schemas/rating.ts` (+ test): `RATING_STATUSES`, `ratingUpsertSchema`, `ratingListQuerySchema`, DTO |
| Create | `packages/core/src/ratings/upsert-rating.ts`, `delete-rating.ts`, `list-ratings.ts` (summary + reviews), `my-rating.ts`, `ratings.int.test.ts` |
| Create | `packages/core/src/moderation/rating-visibility.ts`; Modify `apply-action.ts`, `log-action.ts` (`ModerationTarget` + `rating`), `resolve-reports.ts` (`targetOwnerId` rating), `reports/create-report.ts`, `reports/list-reports.ts`, `reports/report-context.ts`, `core/src/index.ts` |
| Create | `packages/api/src/routes/ratings.ts` (+ int test); Modify `app.ts`, `lib/core-errors.ts` (`RATING_HIDDEN` 409) |
| Create | `apps/web/src/lib/ratings.ts` |
| Create | `apps/web/src/components/ratings/story-ratings.tsx`, `rating-summary.tsx`, `rating-form.tsx`, `star-input.tsx`, `review-list.tsx`, `review-item.tsx` (+ test render `rating-summary`, `star-input`) |
| Modify | `apps/web/src/routes/stories.$storyKey.index.tsx` (chèn khu), `components/moderation/report-target-context.tsx`, `report-actions.ts` (+ test), `components/report/report-dialog.tsx` |
| Modify | `packages/shared/messages/vi.json` (`rating_*`, nhãn moderation) |
| Create | `apps/web/e2e/ratings.spec.ts` |
| Modify | `docs/moderation-guide.md`, `docs/project-spec.md` (`[x]` checkbox 3) |

## Function / Interface Checklist

- [ ] `upsertRating(db, actor, {publicId, score, review}) → Result<MyRatingDto, 'NOT_FOUND'|'FORBIDDEN'|'USER_MUTED'|'RATING_HIDDEN'>`
- [ ] `deleteRating(db, actor, publicId) → Result<void, 'NOT_FOUND'|'RATING_HIDDEN'>`
- [ ] `listStoryRatings(db, viewer|null, {publicId, cursor}) → Result<RatingsPageDto, 'NOT_FOUND'>`
- [ ] `getMyRating(db, userId, publicId)`
- [ ] `setRatingHidden(tx, actor, ratingId, hidden, note)` → `ModerationTarget {type:'rating', id}`
- [ ] Route `GET /ratings`, `GET /ratings/mine`, `PUT /ratings` (`requireVerifiedEmail` → `rateLimit(deps,'rate')` → `validate`), `DELETE /ratings`

## Implementation Steps

1. Shared: limits, rate limit, schema rating, reports mở rộng; unit test.
2. DB: migration (cột + index), `pnpm db:migrate`.
3. Core: upsert (đọc dòng cũ `FOR UPDATE`; `hidden_by_mod` → `RATING_HIDDEN`; insert `ON CONFLICT (user_id, story_id) DO UPDATE`), delete, list (summary bằng một `GROUP BY score` join `users` lọc `status <> 'banned'`; reviews keyset), mine. Int test: tạo → sửa → summary đúng; user bị ban → biến mất khỏi summary và reviews; ẩn → xoá/đăng lại bị 409 và vẫn ẩn; tác giả tự chấm → `FORBIDDEN`.
4. Moderation: `setRatingHidden`, dispatch, `targetOwnerId`, ngữ cảnh hàng chờ (truyện, điểm, trích review, người viết). Int test: mod ẩn đánh giá của chính mình hoặc của admin → `FORBIDDEN`.
5. API sub-app `ratings`; int test (khách 401, muted 403 `USER_MUTED`, truyện nháp 404, 409 `RATING_HIDDEN`, 429).
6. Web: khu đánh giá (`SectionHeading` "Đánh giá", icon `Star`), `RatingSummary` (số trung bình lớn + "N lượt đánh giá" + 5 thanh phân bố `--primary` trên track `--secondary`), `StarInput` (fieldset, legend sr-only, radio), `RatingForm` (textarea + đếm ký tự + Lưu + Xoá có `ConfirmDialog`; khoá khi bị ẩn), `ReviewList` "Xem thêm". Tác giả xem truyện của mình: không có form, chỉ danh sách.
7. Moderation UI, i18n, docs, e2e: reader chấm 4 sao + review → "4.0 · 1 lượt"; sửa thành 5 → "5.0"; reader thứ hai báo cáo review → mod ẩn → summary về 0 lượt, review biến mất, người viết thấy "đang bị ẩn"; tác giả không thấy form.
8. Gate xanh → `[x]` checkbox 3.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | schema: score 0/6/2.5 bị từ chối, review 5.001 ký tự bị từ chối; `reportTargetSchema` nhận `{type:'rating', ratingId}`, từ chối `{type:'rating', id}` |
| Int (core) | bước 3, 4 |
| Int (api) | bước 5; `hide_rating` đóng báo cáo mở |
| Unit (web) | `RatingSummary` 0 lượt hiện trạng thái trống; `StarInput` render 5 radio với nhãn "{n} sao" |
| E2E | bước 7; trang truyện vẫn `public`, không gọi `/api/v1/ratings` trước khi cuộn |

## Dependency Map

- Cần phase 1 (`canPostCommunityContent`, `normalizePlainText`, `useNearViewport`, `MODERATION_LOG_ACTIONS`, mẫu target báo cáo/guard mod), `ConfirmDialog`, `ReportButton`.
- Cung cấp: không phase sau phụ thuộc.

## Todo List

- [ ] Shared + migration
- [ ] Core + moderation
- [ ] API
- [ ] UI khu đánh giá + moderation
- [ ] i18n, docs, e2e, gate, `[x]` checkbox 3

## Success Criteria

- [ ] Gate xanh
- [ ] Summary luôn khớp đánh giá visible của người không bị ban (int test)
- [ ] Mod ẩn/khôi phục review, không tự xử nội dung của mình; review bị ẩn không hồi sinh bằng xoá + đăng lại
- [ ] Checkbox 3 spec `[x]`

## Risk Assessment

- `GROUP BY` mỗi lần mở khu đánh giá: ≤ 5 dòng trên index `story_id`, rẻ ở quy mô năm đầu; nếu sau cần điểm trên thẻ truyện thì thêm bảng tổng riêng (không đặt trên `stories`).

## Security Considerations

- Review là văn bản thuần (`normalizePlainText`), render text node.
- `isOwn` tính ở server, không lộ user id. `ratingId` (UUID) là ngoại lệ có chủ đích của quy tắc khoá công khai trong báo cáo, như `commentId` (phase 1).

## Next Steps

Phase 5: xếp hạng.
