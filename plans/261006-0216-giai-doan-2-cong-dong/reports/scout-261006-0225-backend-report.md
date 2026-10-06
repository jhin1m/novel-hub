# Scout backend cho Giai đoạn 2 (2026-10-06)

Schema đã có phần lớn, logic gần như chưa có. Thiếu: bảng contests; `completions` không bao giờ được ghi; trạng thái `muted` chưa chặn gì; báo cáo chưa nhận target `comment`; chưa có code xếp hạng; chưa có job thông báo.

## 1. Schema (`packages/db/src/schema`)

- Enum (`enums.ts:6-18`): `user_role` reader/author/mod/admin; `user_status` active/muted/banned; `follow_target` **story, user**; `library_shelf`, `chapter_status`, `story_visibility`, `tag_kind`. Quy tắc `enums.ts:3-4`: tập mở (reports, moderation, comment status) dùng `text` + Zod, không `pgEnum`. Helper `columns.ts`: `uuidPk()` (`uuidv7()` phía DB), `timestamptz`, `createdAt`, `updatedAt`.
- `community.ts`:
  - `follows` (`:20-34`): user_id FK cascade, target_type follow_target, target_id uuid không FK (đa hình), created_at. PK (user_id, target_type, target_id). Index `follows_target_idx` (target_type, target_id).
  - `comments` (`:36-61`): id, chapter_id FK cascade, story_id FK cascade, user_id FK restrict, parent_id self-FK (không onDelete, không ràng buộc cấp), paragraph_id text null, body text, status text default `'visible'`, created_at. Index (chapter_id, created_at), parent_id, story_id, user_id. Thiếu updated_at/deleted_at, index paragraph_id, CHECK độ dài body.
  - `ratings` (`:64-81`): PK (user_id, story_id), score smallint CHECK 1..5, review text null, created_at, index story_id. Thiếu updated_at, trạng thái review.
  - `notifications` (`:83-100`): id, user_id FK cascade, type text, payload jsonb default `{}`, read_at, created_at. Index (user_id, created_at desc). Không có partial index chưa đọc.
- `engagement.ts`:
  - `reading_progress` (`:39-59`): PK (user_id, story_id), chapter_id, scroll_pct real 0..100, updated_at. Chỉ giữ chương mới nhất mỗi user/truyện.
  - `chapter_daily_stats` (`:62-74`): PK (chapter_id, date), date dạng chuỗi ngày, views, unique_readers, completions int default 0. **`completions` chưa bao giờ được ghi** (`views/flush.ts` không insert).
  - `badges` (`:76-86`): id, code unique, name, description, created_at. `user_badges` (`:88-106`): PK (user_id, badge_id), awarded_at, index badge_id.
- `moderation.ts`: `reports` (`:7-31`) reporter_id null (set null), target_type text, target_id, reason, detail, status default `'open'`, handled_by, created_at; partial unique `reports_open_auto_key`. `moderation_actions` (`:34-51`). `featured_slots` (`:54-71`): story_id cascade, slot text, starts_at, ends_at, CHECK ends > starts, index (slot, starts_at), story_id.
- `content-events.ts:10-25`: outbox (payload jsonb, processed_at, attempts).
- `users` (`auth.ts:10-36`): username, displayName, email, email_verified, avatarUrl, bio, role, status, preferences jsonb (`Partial<UserPreferences>`).
- `stories` (`stories.ts:37-73`) có chapter_count, word_count, last_chapter_at, is_mature; **không** có cột đếm theo dõi, đánh giá, lượt đọc.
- Contests: không có gì.
- Migration (`packages/db/drizzle/`): `0000_init`, `0001_content_events`, `0002_dedupe_fingerprints` + `meta/`. Sinh bằng `pnpm db:generate`.

## 2. Đếm lượt đọc

- `POST /api/v1/reading/view` (`packages/api/src/routes/reading.ts:115-133`), client gửi sau 30 s. Viewer `u:{userId}` hoặc `a:{cookie nh_vid}`.
- Core `recordChapterView` (`core/src/views/record-chapter-view.ts:21`), best effort.
- Key Redis (`views/view-keys.ts`, dưới `{prefix}:v`): `views:{date}:{ch}`, HLL `uv:{date}:{ch}`, set `dirty:{date}`, cap `viewer:...`, `ip:...`. Lua `view-counter.ts:46-64`.
- `VIEW_RULES` (`shared/src/views.ts:5-14`): minDwell 30 s, 3/viewer/ngày, 10/IP/ngày, ngày theo `Asia/Ho_Chi_Minh` (`statsDate()`).
- Rollup: job `PUBLISHING_JOBS.flushViewCounters` mỗi 300 s (`apps/worker/src/publishing-worker.ts:25`) → `core/src/views/flush.ts:24`.
- Xếp hạng: chưa có. Trang chủ "notable" là luật tạm (`catalog/home.ts:19` ghi "stage 2 replaces this").

## 3. Outbox, hàng đợi, điểm móc chương mới

- `ContentChange` (`core/src/content/hooks.ts:14-32`, Zod `:34-55`): story published/updated/hidden/restored; chapter published/updated/deleted/hidden/restored (storyId, chapterId, chapterNumber, contentHash?); user updated/banned/unbanned.
- `jobsForChange` (`hooks.ts:92-112`) thuần: mọi change → `purge-urls` + `search-sync`; chapter published/updated thêm `fingerprint-chapter`. `OUTAGE_RETRY` 11 lần.
- `recordContentChanges(tx, changes)` (`content/outbox.ts:15`) gọi trong transaction. `drainContentEvents` (`:63`).
- Thêm job nội dung: (1) tên vào `CONTENT_JOBS` (`shared/src/queues.ts:31`) + schema payload; (2) map trong `jobsForChange`; (3) case trong `routeContentJob` (`apps/worker/src/content-router.ts:23-34`), mở rộng `ContentJobDeps` (`:11`); (4) processor trong `apps/worker/src/processors/`, idempotent.
- Queue (`shared/src/queues.ts:7-13`): `mail`, `content`, `publishing`. Repeatable ở `publishing` (`publishing-worker.ts:21-28`): sweep 60 s, drain 5 s, flushViews 300 s, backfillFingerprints 1 h; đăng ký bằng `registerPublishingSchedulers` (`:76`) qua `upsertJobScheduler`. Wiring `apps/worker/src/index.ts:65-127`.
- Điểm móc thông báo: `markChapterPublished` (`core/src/publishing/publish-chapter.ts:43-75`) dùng cho cả đăng ngay và sweeper (`publish-due.ts:12`); phát `chapterPublishChanges` (`publishing/changes.ts:13`) `action: 'published'` chỉ khi `firstPublish`. → job mới `notify-followers` map từ chapter/published.

## 4. Rate limit (`shared/src/rate-limits.ts`)

- Action (`:6-16`): signUp, signIn, forgotPassword, sendVerification, createStory, uploadCover, createChapter, publishChapter, report, **comment** (đã có: user 20/10 phút, tài khoản mới 5/10 phút, IP 60/10 phút, fail open).
- `NEW_ACCOUNT_DAYS = 3`. Middleware `rateLimit(deps, action)` (`api/src/middleware/rate-limit.ts:17`) → 429 `RATE_LIMITED`.
- Chưa có tier cho rating, follow.

## 5. Policies và access

- `policies/user.ts`: `hasAnyRole`, `isEmailVerified` (`:18`), `isBanned`. `policies/story.ts`: `canEditStory`, `canEditChapter`. `policies/moderation.ts`: `canModerate`, `canModerateUser`.
- `access/can-read-chapter.ts`: `isStoryPubliclyVisible` (`:20`), `canReadChapter` (`:29`), `readableChapterWhere()` (`:44`).
- Muted: `moderation/user-status.ts:55-56` ghi "Muting only blocks comments (phase 2)"; **chưa có kiểm tra**.
- `requireVerifiedEmail` (`api/src/middleware/require-auth.ts:39-44`) → 403 `EMAIL_NOT_VERIFIED`; `requireAuth`, `requireRole(...)`.

## 6. Kiểm duyệt

- Target báo cáo (`shared/src/schemas/reports.ts:24`): story, chapter, user ("comments come with the comment feature"). Chỗ cần nhánh `comment`: `reportTargetSchema` (`:50-54`), `resolveVisibleTarget` (`core/src/reports/create-report.ts:19-67`), `ReportTargetDto` + loader (`reports/list-reports.ts:25-30`, `reports/report-context.ts`).
- Action (`reports.ts:28-40`, schema `:92-109`): hide/restore story, hide/restore chapter, mute/unmute/ban/unban user, merge_tag, dismiss/resolve report.
- Core: `moderation/apply-action.ts` (`dispatch` `:12`, `applyModerationAction` `:67`), `content-visibility.ts`, `user-status.ts`, `merge-tag.ts`, `resolve-reports.ts`, `log-action.ts`; `reports/{create-report,list-reports,report-context}.ts`.
- API `routes/moderation.ts`: `GET /moderation/reports`, `POST /moderation/actions`, `requireRole('mod','admin')`.

## 7. Hono

- Sub-app (`api/src/app.ts:18-30`, `/api/v1` + csrf): health, library, me, moderation, reading, reports, search, stories, tags; chapters lồng ở `stories/:publicId/chapters`.
- Mẫu: `createXRoutes(deps: Pick<ApiDeps,...>)` chain `new Hono()`; `.use(sessionMiddleware(deps.auth))`; thứ tự `requireAuth|requireVerifiedEmail` → `rateLimit` → `validate(...)` → core trả `Result` → `coreError(c, err)`.
- `validate` (`lib/validate.ts`) 400 `VALIDATION_ERROR`. `coreError` (`lib/core-errors.ts:5-56`): mã mới thêm vào `CORE_ERROR_STATUS` + `CORE_ERROR_MESSAGES`.
- `ApiDeps` (`deps.ts:24-41`); `makeTestApiDeps` (`testing.ts:21-37`) thêm default khi thêm dep.

## 8. Quy ước core

- Mẫu `core/src/library/`: `library.ts` (`setShelf(db, userId, publicId, shelf)` → `Result`), `library.test.ts`, `library.int.test.ts`.
- `Result` (`core/src/lib/result.ts`). Unit `*.test.ts` (`pnpm test`), integration `*.int.test.ts` chạy tuần tự (`pnpm test:int`).
- Fixture: `core/src/testing/story-fixture.ts` (`makeAuthor`, `makePublishedStory`, `addChapter`), `moderation-fixture.ts` (`makeUser`); `@novel-hub/db/testing` (`createTestDb`, `truncateAll`, `catchPgError`, `runMigrations`).
- Barrel `core/src/index.ts` (249 dòng).

## 9. Danh sách công khai

- `publicStoryWhere({includeMature})` (`core/src/catalog/story-card.ts:101-107`): published, tác giả không bị ban, `is_mature = false` trừ khi includeMature; cần join users như `selectStoryCards` (`:63-75`).
- Trang chủ `catalog/home.ts`: `listRecentlyUpdated` (`:27`), `listNotable` (`:50`, `NOTABLE_RULE` `:20`), `getHomePage` (`:94`).
- `catalog/lists.ts:20` `listStories`: client tải lại danh sách khi bật 18+ (recent, notable, tag, author); xếp hạng thêm case ở đây.
- URL purge theo change: `catalog/urls.ts:15` `catalogUrls`.

## 10. `packages/shared`

- `LIMITS` (`limits.ts:5-32`): chưa có giới hạn bình luận/review. `reportDetailMax` 1000, `modNoteMax` 500.
- `src/schemas/`: catalog, chapter, library, preferences, reader, reports, revision, search, story, user (mỗi file có `.test.ts`, re-export `src/index.ts`).
- Preferences (`schemas/preferences.ts:8-28`): `{ showMature, reader? }`, patch strict. Không có tuỳ chọn thông báo.

## 11. Seed (`packages/auth/src/scripts`)

- `pnpm db:seed` → `packages/db/src/seed/seed.ts:186`; `pnpm db:seed-demo` (`seed-demo.ts`): ~47 truyện, library_items, reading_progress, reports. Không seed follows, comments, ratings, notifications, chapter_daily_stats, badges, featured_slots.
