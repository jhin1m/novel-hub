---
phase: 3
title: "Theo dõi và thông báo"
status: pending
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 3: Theo dõi và thông báo

<!-- Red Team: gộp thông báo theo truyện, điều kiện hiển thị dùng chung cho list và count (có lọc 18+), queue maintenance riêng -->

## Context Links

- Spec: §5 Gđ2 checkbox 2, §3 (việc nặng đi qua hàng đợi: "gửi thông báo cho người theo dõi"), §4 (`follows`, `notifications`), §6 (phần cá nhân hoá tải ở client), §10 (lịch đăng, theo dõi lưu có cấu trúc)
- Scout: `reports/scout-261006-0225-backend-report.md` §1, §3 (outbox, `markChapterPublished`), §7; frontend §3, §5, §6
- Research: `research/researcher-01-comments-follows-notifications-ratings.md` §2 (bỏ Redis đếm chưa đọc, bỏ vòng lặp offset)

## Overview

Theo dõi truyện (trang truyện) và tác giả (trang tác giả). Khi một chương được đăng **lần đầu** (đăng ngay hoặc tới giờ hẹn), worker tạo thông báo trong app cho người theo dõi truyện ∪ người theo dõi tác giả. Chuông trên header hiện số chưa đọc; trang `/notifications` liệt kê, đánh dấu đã đọc. Xong phase này đánh `[x]` checkbox 2.

## Key Insights

- `follows` (`packages/db/src/schema/community.ts:20-34`): PK (user_id, target_type, target_id), `target_type` enum `follow_target` = `story | user` (không phải `author`), index (target_type, target_id) đủ cho fan-out `where target_type = … and target_id = …`.
- `notifications` (`community.ts:83-100`): `type` text, `payload` jsonb, `read_at`, index (user_id, created_at desc); chưa có chống trùng, chưa có index chưa đọc.
- Điểm móc duy nhất: `markChapterPublished` (`packages/core/src/publishing/publish-chapter.ts:43-75`) phát change `chapter/published` chỉ khi `firstPublish` (`publishing/changes.ts:13`); dùng chung cho đăng ngay và sweeper hẹn giờ. Thêm job vào `jobsForChange` (`core/src/content/hooks.ts:92-112`) → outbox đảm bảo at-least-once.
- Thêm job nội dung: `CONTENT_JOBS` (`shared/src/queues.ts:31`) → `jobsForChange` → `routeContentJob` (`apps/worker/src/content-router.ts:23-34`) → processor. Job định kỳ: `registerPublishingSchedulers` (`apps/worker/src/publishing-worker.ts:76`).
- E2E không chạy worker → helper gọi thẳng `notifyFollowersOfChapter`.
- Header: chuông đặt giữa `HeaderNav` và `SiteAccountMenu` (`components/site-header.tsx:47-48`), hiện cả mobile. `SiteAccountMenu` giữ chỗ 42px khi `me` pending → chuông cũng giữ chỗ để header không nhảy.

## Requirements

**Functional**
- Theo dõi/bỏ theo dõi truyện: truyện công khai (`isStoryPubliclyVisible`, tác giả không bị ban), không phải truyện của mình → `FORBIDDEN`; không tồn tại → `NOT_FOUND` (quy ước mã lỗi hiện có, `packages/api/src/lib/core-errors.ts:5-26`). Truyện 18+ theo dõi được (người dùng đã thấy trang).
- Theo dõi/bỏ theo dõi tác giả: user tồn tại, không bị ban, có ít nhất một truyện công khai có chương (cùng điều kiện tồn tại trang tác giả, `core/src/catalog/author-page.ts:23`), không phải chính mình.
- Idempotent: theo dõi lại không lỗi (`ON CONFLICT DO NOTHING`), bỏ theo dõi khi chưa theo dõi không lỗi.
- `GET /follows/status?story=<publicId>&author=<username>` → `{ story?: boolean, author?: boolean }` cho nút.
- Thông báo `chapter_published`: người nhận = follower truyện ∪ follower tác giả, trừ tác giả, trừ user bị ban. **Gộp theo truyện** <!-- Red Team: notification flood -->: mỗi người có tối đa **một** thông báo chưa đọc cho mỗi truyện; chương mới của truyện đó cập nhật thông báo chưa đọc ấy (tăng `count`, thêm `chapterId`, đẩy `created_at` lên bây giờ) thay vì tạo dòng mới. Hiển thị: "{Truyện} có chương mới: Chương N – {tên}" khi `count = 1`, "{Truyện} có {count} chương mới" khi > 1; link tới chương mới nhất còn đọc được. Xử lý lại cùng chương (outbox at-least-once) không tăng `count` lần hai.
- Bỏ qua (không tạo) khi tới lúc xử lý chương không còn đọc được (`canReadChapter`) hoặc tác giả bị ban.
- Danh sách `/notifications`: 20/trang keyset, mới nhất trước; join truyện/chương hiện tại. **Một điều kiện hiển thị dùng chung** cho danh sách và đếm chưa đọc (`notificationVisibleWhere(viewer)`, rẽ nhánh theo `type`): `chapter_published` → truyện công khai, tác giả không bị ban, có ít nhất một chương trong `chapterIds` đọc được (`readableChapterWhere`), và truyện không 18+ trừ khi người xem đã bật `showMature`. <!-- Red Team: shared visibility predicate, mature leak --> Mục hiển thị: bìa nhỏ, "{Truyện} có chương mới: Chương N – {tên}", thời gian tương đối, chấm chưa đọc. Bấm → đánh dấu đã đọc rồi mở URL chương (`canonicalPath`).
- `GET /notifications/unread-count` (đếm mục chưa đọc qua cùng `notificationVisibleWhere`, giới hạn hiển thị "99+"), `POST /notifications/read` `{ ids: uuid[] (≤ 50) } | { all: true }`.
- Chuông: chỉ khi đã đăng nhập; poll 60 giây + refetch khi focus tab; badge số dùng `--primary`; link tới `/notifications`. Khách không thấy chuông.
- Dọn dẹp: job `prune-notifications` mỗi ngày xoá thông báo > 90 ngày, theo lô 5.000 dòng (lặp tới hết), chạy trên queue mới `maintenance`.
- **Queue `maintenance`** <!-- Red Team: heavy jobs off publishing queue -->: phase này tạo queue `maintenance` (concurrency 1) trong `apps/worker` cho job định kỳ nặng (prune ở đây; phase 5 recompute-rankings, phase 7 award-badges), để không chiếm 2 slot của `publishing` (drain outbox 5 s, sweeper 60 s; `apps/worker/src/publishing-worker.ts:21-28,44-56`).

**Non-functional**
- Fan-out là **một** câu `INSERT … SELECT DISTINCT … ON CONFLICT … DO UPDATE … WHERE` (đủ cho hàng chục nghìn follower năm đầu); không vòng lặp offset.
- HTML trang truyện/tác giả không đổi theo người xem; nút theo dõi render trung tính khi SSR (mẫu `LibraryButton`).
- Rate limit action mới `follow` (user 60/10 phút, IP 120/10 phút, fail open) cho PUT/DELETE theo dõi.

## Architecture

```
publish (ngay / sweeper) → markChapterPublished → recordContentChanges(chapter/published)
  → drain outbox → jobsForChange: + {name:'notify-followers', data:{chapterId}}
  → content worker → notifyFollowersOfChapter(db, chapterId)
       INSERT INTO notifications (user_id, type, payload, dedupe_key)
       SELECT DISTINCT f.user_id, 'chapter_published',
              {storyId, chapterIds:[chapterId], count:1}, 'story:'||storyId
       FROM follows f JOIN users u ON u.id = f.user_id AND u.status <> 'banned'
       WHERE ((f.target_type='story' AND f.target_id=storyId) OR (f.target_type='user' AND f.target_id=authorId))
         AND f.user_id <> authorId
       ON CONFLICT (user_id, dedupe_key) WHERE read_at IS NULL
       DO UPDATE SET payload = {storyId, chapterIds: (cũ ‖ chapterId, giữ 20 id cuối), count: cũ+1}, created_at = now()
       WHERE NOT (notifications.payload->'chapterIds' ? chapterId)
maintenance queue (concurrency 1): prune-notifications (repeat 24h)

Web: FollowButton (story hero, author header) ── /api/v1/follows/*
     NotificationBell (header) ── /api/v1/notifications/unread-count
     /notifications route (NO_STORE, client data) ── /api/v1/notifications
```

- Migration (gợi ý `notification_grouping`): `notifications.dedupe_key text` null; unique index `notifications_unread_dedupe_key (user_id, dedupe_key) where read_at is null` (chỉ ràng buộc mục chưa đọc → đọc xong thì chương sau tạo thông báo mới; `dedupe_key` null không bao giờ trùng vì unique mặc định NULLS DISTINCT). Predicate của index phải **đúng bằng** `WHERE read_at IS NULL` trong `ON CONFLICT`, nếu không Postgres báo "no unique or exclusion constraint matching the ON CONFLICT specification"; int test fan-out bắt lỗi này. Thêm partial index `notifications_unread_idx (user_id) where read_at is null`. <!-- Updated: Validation Session 1 - predicate index khớp ON CONFLICT -->
- `NOTIFICATION_TYPES = ['chapter_published']` ở shared; payload discriminated union Zod theo `type` (`{storyId, chapterIds: uuid[] ≤ 20, count}`) — danh sách parse payload, type lạ thì bỏ qua. Thêm type sau này phải mở rộng `notificationVisibleWhere` (list và count cùng lúc).
- Query keys web: `[...meQueryKey, 'notifications', 'unread']`, `[...meQueryKey, 'notifications', 'list']`, `[...meQueryKey, 'follows', storyPublicId|username]` → đăng xuất tự xoá.

## Related Code Files

| Hành động | File |
|---|---|
| Modify | `packages/db/src/schema/community.ts` (notifications) + migration mới |
| Create | `packages/shared/src/schemas/follow.ts`, `schemas/notification.ts` (+ test); Modify `rate-limits.ts` (`follow`), `queues.ts` (`CONTENT_JOBS.notifyFollowers` + payload schema; queue mới `maintenance` + `MAINTENANCE_JOBS.pruneNotifications`), `src/index.ts` |
| Create | `packages/core/src/follows/follows.ts` (+ `follows.int.test.ts`) |
| Create | `packages/core/src/notifications/notify-followers.ts`, `notification-visibility.ts` (`notificationVisibleWhere`), `list-notifications.ts`, `mark-read.ts`, `unread-count.ts`, `prune-notifications.ts` (+ `notifications.int.test.ts`) |
| Modify | `packages/core/src/content/hooks.ts` (+ `hooks.test.ts`): `chapter/published` → thêm `notify-followers`; `core/src/index.ts` |
| Create | `apps/worker/src/processors/notify-followers.ts`, `processors/prune-notifications.ts` |
| Create | `apps/worker/src/maintenance-worker.ts` (queue `maintenance`, concurrency 1, `registerMaintenanceSchedulers` theo mẫu `registerPublishingSchedulers`) + `maintenance-worker.int.test.ts` (danh sách scheduler) |
| Modify | `apps/worker/src/content-router.ts` (+ test), `index.ts` (khởi động + shutdown worker mới), `shutdown.ts` nếu danh sách worker cố định |
| Create | `packages/api/src/routes/follows.ts`, `routes/notifications.ts` (+ int test); Modify `app.ts`, (không mã lỗi mới: `NOT_FOUND`, `FORBIDDEN`) |
| Create | `apps/web/src/lib/follows.ts`, `lib/notifications.ts` |
| Create | `apps/web/src/components/follow/follow-button.tsx` (tone `default` / `on-cover` dùng `ON_COVER_OUTLINE`) |
| Create | `apps/web/src/components/notifications/notification-bell.tsx`, `notification-list.tsx`, `notification-item.tsx` (+ test render) |
| Create | `apps/web/src/routes/notifications.tsx` (`/notifications`, `headers: NO_STORE`, noindex, `SiteLayout`, `PageShell narrow`) |
| Modify | `components/site-header.tsx` (chuông), `site-account-menu.tsx` (mục "Thông báo"), `components/story/story-hero.tsx` (nút theo dõi truyện trong hàng hành động), `routes/authors.$username.tsx` (nút theo dõi tác giả cạnh `ReportButton`) |
| Modify | `packages/shared/messages/vi.json` (`follow_*`, `notification_*`) |
| Create | `apps/web/e2e/follows-notifications.spec.ts`; Modify `e2e/helpers/content.ts` (helper `deliverChapterNotifications(chapterPath)` gọi core) |
| Modify | `docs/code-standards.md` (URL `/notifications`), `docs/project-spec.md` (`[x]` checkbox 2) |

## Function / Interface Checklist

- [ ] `followStory(db, user, publicId)`, `unfollowStory(...)`, `followAuthor(db, user, username)`, `unfollowAuthor(...)` → `Result<void, 'NOT_FOUND'|'FORBIDDEN'>`
- [ ] `getFollowStatus(db, userId, {storyPublicId?, username?})`
- [ ] `notifyFollowersOfChapter(db, chapterId) → Promise<{ affected: number }>` (idempotent theo chapterId)
- [ ] `notificationVisibleWhere(viewer: {id, showMature})` — SQL dùng chung cho list và count
- [ ] `listNotifications(db, userId, cursor)`, `countUnreadNotifications(db, userId)`, `markNotificationsRead(db, userId, {ids}|{all})`, `pruneNotifications(db, olderThanDays = 90)`
- [ ] `jobsForChange` trả thêm `notify-followers` cho `chapter/published` (không cho `updated`, `restored`)
- [ ] Route: `PUT|DELETE /follows/stories/:publicId`, `PUT|DELETE /follows/authors/:username`, `GET /follows/status`, `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`

## Implementation Steps

1. Shared: schema follow/notification, queue names, rate limit `follow`. Unit test.
2. DB: migration notifications, `pnpm db:migrate`.
3. Core follows + int test (tự theo dõi, truyện nháp/ẩn, tác giả bị ban, idempotent).
4. Core notifications + int test: fan-out gồm cả hai nguồn, trùng người chỉ một bản, chạy lại cùng chương không tăng `count`, 3 chương liên tiếp → một thông báo `count = 3`, đọc xong rồi chương thứ 4 → thông báo mới, truyện 18+ không hiện (list và count) với người chưa bật, tác giả không nhận, follower bị ban không nhận, chương bị ẩn trước khi xử lý → 0; danh sách bỏ mục chương đã ẩn/xoá; unread khớp danh sách; mark read theo id chỉ tác động thông báo của chính user.
5. Outbox: map job trong `jobsForChange` (+ unit test), router, processor. Queue `maintenance` + worker + scheduler prune (24h); int test danh sách scheduler theo mẫu `publishing-worker.int.test.ts:134-139`.
6. API hai sub-app; int test (401 khách, 403 `FORBIDDEN` tự theo dõi truyện của mình/chính mình, 404 mục tiêu, 429). <!-- Updated: Validation Session 1 - tự theo dõi là 403 FORBIDDEN theo Requirements, không phải 400 -->
7. Web: `FollowButton` (SSR/me pending: nút trung tính disabled; khách: link đăng nhập kèm `redirect`; đã đăng nhập: toggle `aria-pressed`, optimistic + rollback như `useSetShelf`), chuông, trang `/notifications`, mục menu tài khoản. Header không nhảy: chuông giữ chỗ 42px khi `me` pending, khách thì không render (như menu tài khoản).
8. i18n, docs, e2e: A theo dõi truyện của B và tác giả B → B đăng chương qua API → helper chạy fan-out → A reload thấy badge "1", mở `/notifications`, bấm → tới chương, badge về 0; A bỏ theo dõi → chương tiếp theo không tạo thông báo; khách không thấy chuông; trang truyện vẫn `Cache-Control: public`.
9. Gate xanh → `[x]` checkbox 2.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `jobsForChange` chapter/published có `notify-followers`, chapter/updated thì không; schema payload type lạ bị bỏ qua |
| Int (core) | như bước 3–4 |
| Int (api) | như bước 6; `POST /notifications/read {all:true}` |
| Unit (web) | `NotificationItem` render tiêu đề + link `canonicalPath`; `FollowButton` SSR render trung tính |
| E2E | như bước 8 |

## Dependency Map

- Cần: outbox Gđ1, `canReadChapter`/`isStoryPubliclyVisible`, `canonicalPath`, `useMe`/`meQueryKey`, `ON_COVER_OUTLINE`.
- Cung cấp: `notifications` + `notificationVisibleWhere`, queue `maintenance` (phase 5, 7), `follows` (phase 6 đếm theo dõi mới, phase 7 huy hiệu người theo dõi), helper e2e chạy job.

## Todo List

- [ ] Shared + migration
- [ ] Core follows + notifications
- [ ] Outbox job + worker + scheduler
- [ ] API
- [ ] UI nút theo dõi, chuông, trang thông báo
- [ ] i18n, docs, e2e, gate, `[x]` checkbox 2

## Success Criteria

- [ ] Gate xanh
- [ ] Chương đăng (ngay hoặc hẹn giờ) tạo/cập nhật đúng một thông báo chưa đọc mỗi (follower, truyện); chạy lại job không nhân đôi
- [ ] Chuông/badge/trang thông báo hoạt động; HTML công khai không đổi theo người xem
- [ ] Checkbox 2 spec `[x]`

## Risk Assessment

- Thông báo bị bỏ khi chương không đọc được lúc job chạy (truyện đang bị mod ẩn tạm, tác giả bị ban rồi gỡ) → không gửi bù khi khôi phục; hiếm, chấp nhận năm đầu. [Red Team: từ chối finding "lost notifications on restore"]
- Truyện rất nhiều follower: một câu insert lớn giữ khoá lâu → chấp nhận năm đầu; ghi chú nâng cấp thành chia lô theo `user_id` khi > 50k follower.
- Poll 60 giây × người đang mở tab → tải origin nhẹ (một `count` có index); dừng poll khi tab ẩn (`refetchIntervalInBackground: false`).
- Đổi tiêu đề truyện sau khi gửi: payload chỉ lưu id → luôn hiện tên hiện tại.

## Security Considerations

- Đánh dấu đã đọc luôn kèm `user_id = current` trong `WHERE`.
- Không lộ danh sách người theo dõi; trạng thái theo dõi chỉ trả cho chính user.
- `ids` giới hạn 50 phần tử, UUID hợp lệ.

## Next Steps

Phase 4: đánh giá và review (dùng `canPostCommunityContent`, mẫu target báo cáo từ phase 1).
