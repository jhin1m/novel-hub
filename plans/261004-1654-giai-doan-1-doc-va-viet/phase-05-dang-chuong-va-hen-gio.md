---
phase: 5
title: "Phase 5: Đăng chương và hẹn giờ"
status: completed
priority: P1
effort: "3.5d"
dependencies: [4]
---

# Phase 5: Đăng chương và hẹn giờ

Spec checkbox: `Đăng chương: sinh HTML đã sanitize, gắn data-pid, ghi revision, đếm số chữ, hẹn giờ đăng.`

## Context Links

- Spec mục 3 (việc chậm đi qua hàng đợi), mục 4 (`chapter_contents`, `chapter_revisions` giữ 20, `number` không đổi, xoá mềm; chương 300–20.000 chữ), mục 6 (purge khi đăng/sửa/ẩn), mục 9 (sanitize phía server), mục 10 (`data-pid`)
- `plan.md`: Đăng chương, Hàng đợi; câu hỏi mở #3 (truyện `published` khi nào), #4 (allowlist)
- `plans/reports/researcher-261004-2352-editor-content-pipeline-report.md` mục 2, 3, 4, 8; `...-storage-search-infra-report.md` mục 6
- Phase 4: `editorExtensions`, `parseEditorDoc`, `countWords`, `docToText`, `isValidPid`/`generatePid`, `EditorDocJson`, `loadOwnedChapter`, `saveDraft`, `createAutosave()` (`flush`, `rebase`, `pause`, `resume`), `ChapterList`
- Code: `apps/worker/src/{index,env,router,mail-worker}.ts` (worker chưa có DB), `apps/worker/src/env.test.ts:16-17` (`toEqual` chính xác), `packages/core/src/queue/{producer,job-options}.ts`, `packages/core/src/infra/redis.ts:38-40` (producer `enableOfflineQueue: false`), `packages/core/src/lib/with-timeout.ts`, `packages/shared/src/queues.ts`, `packages/db/src/schema/{columns,chapters,index}.ts`, `packages/db/src/schema.int.test.ts:72-78` (đếm đúng 24 bảng)

## Overview

- `core/content`: renderer **walker tự viết** JSON → HTML theo allowlist, rồi `sanitize-html`; `renderPublishedContent` (kiểm schema → chuẩn hoá pid → render → sanitize → đếm chữ → hash). Dùng cho đăng, hẹn giờ, seed, xem trước revision (phase 6). <!-- Red Team: bỏ @tiptap/static-renderer, không kéo React vào core/worker -->
- **Outbox `content_events`**: mọi thay đổi công khai ghi `ContentChange` vào bảng này **trong cùng transaction** bằng `recordContentChanges(tx, changes)`. Worker drain định kỳ, map qua `jobsForChange(change)` rồi `addBulk` vào queue `content`. Không còn enqueue sau commit, không còn timeout 1 giây. <!-- Red Team: mất enqueue khi Redis reconnect (producer enableOfflineQueue:false) -->
- `core/publishing`: `publishChapter`, `scheduleChapter`, `unscheduleChapter`, `deleteChapter`, `publishDueChapters`, `recomputeStoryCounters`.
- Worker: queue `publishing` riêng cho hai job định kỳ (`sweep-scheduled-chapters` 60 giây, `drain-content-events` 5 giây); queue `content` cho job I/O của phase 9/11/14. Worker thêm kết nối DB. <!-- Red Team: sweeper không kẹt sau job I/O -->
- Hono: publish / schedule / unschedule / delete. UI: dialog đăng + hẹn giờ trong editor (autosave tạm dừng, editor read-only khi đang đăng), xoá chương.

## Key Insights

- Luôn render từ draft trong DB, không nhận HTML từ client. Client gửi `baseUpdatedAt` để chắc đăng đúng bản đã thấy.
- **Khoá draft khi đăng:** trong transaction, sau story → chapter, `SELECT … FROM chapter_drafts WHERE chapter_id = $1 FOR UPDATE`, so `date_trunc('milliseconds', updated_at)` với base **dưới khoá**. Pid đổi thì `UPDATE chapter_drafts … WHERE chapter_id = $1 AND date_trunc('milliseconds', updated_at) = $base` (0 dòng → rollback, `DRAFT_CONFLICT`). `saveDraft` của tab khác chạy cùng lúc bị chặn ở khoá dòng, sau commit Postgres đánh giá lại `WHERE` theo `updated_at` mới → 0 dòng → 409, không ghi đè pid. <!-- Red Team: publish đọc draft không khoá, UPDATE vô điều kiện -->
- **Client tạm dừng autosave khi đăng:** `editor.setEditable(false)` → `await autosave.pause()` (flush xong mới dừng) → gọi API → `setContent(normalizedDoc, { emitUpdate: false })` nếu có → `rebase(updatedAt, JSON.stringify(doc))` → `resume()` → `setEditable(true)`. Không phím nào gõ trong lúc đăng bị `setContent` xoá. <!-- Red Team: race gõ phím khi publish -->
- **Thứ tự khoá story → chapter → draft** ở mọi đường (web, sweeper, mod action phase 15). `saveDraft` chỉ chạm dòng draft (một câu lệnh) nên không tạo vòng chờ. <!-- Red Team: thống nhất thứ tự khoá -->
- **Outbox là at-least-once:** `addBulk` xong mà commit đánh dấu `processed_at` lỗi → job xếp hai lần. Vì vậy **không đặt `jobId` cố định** cho job nội dung; mọi processor (phase 9, 11, 14) idempotent: đọc trạng thái hiện tại trong DB rồi hành động. Payload chỉ chứa id. <!-- Red Team: jobId cố định nuốt job -->
- Producer Redis tắt offline queue (`core/infra/redis.ts:38-40`): Redis đang reconnect thì `addBulk` reject ngay. Với outbox, việc đó chỉ làm drain thử lại ở tick sau; web không còn phụ thuộc Redis khi đăng → `ApiDeps` không cần thêm queue.
- **Hẹn giờ = chuẩn bị nội dung lúc hẹn:** chạy toàn bộ pipeline, ghi `chapter_contents` + revision, `status = scheduled`. Sweeper chỉ lật trạng thái, tính lại bộ đếm, ghi outbox.
- Sweeper **bỏ qua chương của tác giả bị ban** (`users.status = 'banned'`): chương giữ `scheduled`, bỏ ban thì lần quét sau đăng. <!-- Red Team: sweeper không kiểm tác giả bị ban -->
- Bộ đếm truyện tính lại từ đầu trong transaction đã khoá story (`recomputeStoryCounters`), không cộng delta; phase 15 gọi lại khi mod ẩn/khôi phục chương.
- Chương `hidden_by_mod` không đăng lại/cập nhật/hẹn giờ/sửa metadata (409); nháp riêng vẫn sửa được. Truyện chỉ tự chuyển `published` khi đang `draft`, không bao giờ từ `hidden_by_mod`.
- Walker ~80 dòng thay cho static-renderer: không peer React, output xác định (thứ tự mark cố định theo schema), test byte-identical với sanitize. Định dạng tự đóng (`<br />`, `<hr />`) và cách escape lấy đúng như `sanitize-html` xuất ra (test quyết định).
- BullMQ 6.3.11 cấm `:` trong id job/scheduler → tên scheduler dùng `-`.

## Requirements

**Functional**

- `POST /api/v1/stories/:publicId/chapters/:number/publish` body `{ baseUpdatedAt }`:
  - chương draft/scheduled → `published`, `published_at = now`, `scheduled_at = null`;
  - chương đã đăng → cập nhật nội dung, giữ `number`, `published_at`; `content_hash` trùng → `unchanged: true`, không ghi gì (kể cả outbox);
  - 200 `{ chapter, draft: { updatedAt, doc | null }, unchanged, storyVisibility }`.
- `PUT .../:number/schedule` body `{ baseUpdatedAt, scheduledAt }`: chỉ chương chưa từng đăng; `scheduledAt` ∈ [now + `LIMITS.schedule.minLeadMs` (5 phút), now + 365 ngày]; hẹn lại = cập nhật nội dung + giờ. Không ghi outbox (chưa công khai).
- `DELETE .../:number/schedule` → `draft`, `scheduled_at = null`.
- `DELETE .../:number` → xoá mềm; chương đã đăng thì tính lại bộ đếm + outbox `chapter.deleted`. Số chương bỏ trống. 204.
- `renderPublishedContent`: `parseEditorDoc` → chuẩn hoá pid (paragraph, heading, cả trong blockquote), kẹp heading level vào [2, 3] → walker → `sanitize-html` → `paragraph_ids` theo thứ tự → `word_count = countWords(docToText(doc))` → `content_hash = sha256(html)`.
- 300–20.000 chữ khi đăng và hẹn (422 `WORD_COUNT_OUT_OF_RANGE`).
- Revision khi `content_hash` khác bản gần nhất; giữ `LIMITS.revisionsKept` (20).
- Truyện `published` (câu hỏi mở #3 đã chốt **phương án A**): tự chuyển `draft → published` khi chương đầu được đăng (cả qua sweeper). Không có endpoint `publish` riêng. <!-- Updated: Validation Session 1 - phương án A -->
- Outbox: mọi thay đổi công khai gọi `recordContentChanges(tx, …)` trong transaction của nó:
  - đăng/cập nhật/xoá chương (web, sweeper) → `chapter.*` (+ `story.published` khi truyện chuyển);
  - `updateChapterMeta` của chương đã đăng → `chapter.updated`;
  - `updateStory`, `setStoryCover`, `removeStoryCover` khi truyện không còn `draft` → `story.updated` (kèm `previousSlug`).
- Drain: `drain-content-events` mỗi 5 giây, lô 100, tối đa 10 lô/lần; dọn event đã xử lý quá 7 ngày.
- Sweeper: `sweep-scheduled-chapters` mỗi 60 giây, tối đa 100 chương/lần.
- UI editor:
  - nút "Đăng"/"Cập nhật" mở dialog: số chữ + khoảng hợp lệ, "Đăng ngay"/"Hẹn giờ" (`datetime-local`, ẩn khi đã đăng);
  - xác nhận → luồng tạm dừng autosave ở Key Insights; `pause()` trả trạng thái khác `saved` → `resume()`, mở lại editor, báo lỗi, không gọi API;
  - chương `scheduled`: banner "Hẹn đăng lúc …" + "Huỷ hẹn" + "Cập nhật bản hẹn giờ";
  - badge "Có thay đổi chưa đăng" khi nháp mới hơn revision gần nhất.
- Danh sách chương: nút xoá + dialog xác nhận (chương đã đăng: cảnh báo số chương bỏ trống).

**Non-functional**

- Một transaction cho mỗi lần đăng/hẹn/xoá, gồm cả dòng outbox.
- Mọi fetch ra ngoài trong processor của queue `content` (Cloudflare ở phase 9, Meilisearch ở phase 11; fingerprint phase 14 chỉ dùng Postgres) dùng `AbortSignal.timeout(10_000)`; content worker concurrency 4. <!-- Red Team: fetch treo chặn worker -->
- Chuỗi UI qua Paraglide (`publish_*`, `schedule_*`, `chapter_delete_*`).

## Architecture

```
web: dialog → setEditable(false) → pause() → POST /publish {baseUpdatedAt} ─▶ core.publishChapter(db, …)
worker[publishing]: every 60s sweep-scheduled-chapters ─▶ core.publishDueChapters(db)
  BEGIN ─ story FOR UPDATE ─ chapter FOR UPDATE (sweeper: SKIP LOCKED, kiểm lại due + tác giả không bị ban)
        ─ (publish) draft FOR UPDATE ─ base khớp? ─ renderPublishedContent(draft.doc)
        ─ hash khác → UPSERT chapter_contents · INSERT revision · prune 20 · (pid đổi) UPDATE draft có điều kiện base
        ─ UPDATE chapter ─ recomputeStoryCounters ─ story draft→published (A)
        ─ recordContentChanges(tx, changes) → INSERT content_events
  COMMIT
worker[publishing]: every 5s drain-content-events ─▶ core.drainContentEvents({ db, contentQueue })
  BEGIN ─ SELECT … WHERE processed_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
        ─ jobs = flatMap(jobsForChange) ─ withTimeout(addBulk(jobs), 10s)
        ─ ok: processed_at = now() · lỗi: attempts + 1 (commit, log) ─ COMMIT
worker[content] (concurrency 4) ─▶ routeContentJob(job, deps)   // phase 5: chưa có job nào
```

```ts
// packages/db/src/schema/content-events.ts (export ở schema/index.ts)
export const contentEvents = pgTable('content_events', {
  id: uuidPk(), payload: jsonb().notNull(), createdAt: createdAt(),
  processedAt: timestamptz(), attempts: integer().notNull().default(0),
}, (t) => [index('content_events_pending_idx').on(t.id).where(sql`processed_at is null`)]);

// packages/shared/src/queues.ts
export const QUEUES = { mail: 'mail', content: 'content', publishing: 'publishing' } as const;
export const PUBLISHING_JOBS = { sweepScheduledChapters: 'sweep-scheduled-chapters', drainContentEvents: 'drain-content-events' } as const;
// phase 9 thêm flushViewCounters, phase 14 thêm backfillFingerprints (việc nội bộ định kỳ, không gọi ra ngoài)
export const CONTENT_JOBS = {} as const;   // phase 9 thêm purgeUrls, 11 searchSync, 14 fingerprintChapter (+ payload schema)
export type ContentJobName = (typeof CONTENT_JOBS)[keyof typeof CONTENT_JOBS]; // rỗng → never; generic BullMQ lỗi thì tạm `string` tới phase 9
// LIMITS thêm: schedule: { minLeadMs: 5 * 60_000, maxAheadMs: 365 * 86_400_000 }
export const publishChapterSchema;   // { baseUpdatedAt: z.iso.datetime() }
export const scheduleChapterSchema;  // { baseUpdatedAt, scheduledAt: z.iso.datetime({ offset: true }) }

// packages/core/src/content/render.ts
export interface PublishedContent { doc: EditorDocJson; html: string; paragraphIds: string[];
  contentHash: string; wordCount: number; pidsChanged: boolean }
export function renderPublishedContent(doc: unknown): Result<PublishedContent, 'INVALID_DOCUMENT'>;
export function renderChapterHtml(doc: EditorDocJson): string;  // walker + sanitize, không chuẩn hoá pid (phase 6 xem trước)
export const CHAPTER_SANITIZE: sanitizeHtml.IOptions; // p,h2,h3,strong,em,s,blockquote,hr,br; data-pid trên p/h2/h3; allowedSchemes []

// packages/core/src/content/hooks.ts — hợp đồng cho phase 7–17
export type ContentChange =
  | { entity: 'story'; action: 'published' | 'updated' | 'hidden' | 'restored'; storyId: string; previousSlug?: string }
  | { entity: 'chapter'; action: 'published' | 'updated' | 'deleted' | 'hidden' | 'restored';
      storyId: string; chapterId: string; chapterNumber: number; contentHash?: string }
  | { entity: 'user'; action: 'updated' | 'banned' | 'unbanned'; userId: string };
export const contentChangeSchema: z.ZodType<ContentChange>;   // drain parse payload bằng schema này
export interface ContentJob { name: ContentJobName; data: unknown }   // không có jobId
export function jobsForChange(change: ContentChange): ContentJob[];  // thuần, switch đủ nhánh; phase 5 trả []

// packages/core/src/content/outbox.ts
export function recordContentChanges(tx: Db | Tx, changes: readonly ContentChange[]): Promise<void>; // [] → no-op; parse rồi INSERT
export type ContentQueue = Queue<unknown, void, ContentJobName>;
export function createContentQueue(connection: Redis, prefix: string): ContentQueue;  // DEFAULT_JOB_OPTIONS, logRedisErrors
export function drainContentEvents(deps: { db: Db; contentQueue: Pick<ContentQueue, 'addBulk'>;
  mapChange?: (c: ContentChange) => ContentJob[]; batchSize?: number; maxBatches?: number }):
  Promise<{ enqueued: number; failed: number }>;

// packages/core/src/publishing/*  (chữ ký cùng kiểu phase 4: db, actor, publicId, number, input)
type PublishError = 'NOT_FOUND' | 'FORBIDDEN' | 'DRAFT_CONFLICT' | 'INVALID_DOCUMENT'
  | 'WORD_COUNT_OUT_OF_RANGE' | 'CHAPTER_HIDDEN_BY_MOD';
export interface PublishResult { chapter: AuthorChapterView; draftUpdatedAt: string;
  normalizedDoc: EditorDocJson | null; unchanged: boolean; storyVisibility: StoryVisibility }
export function publishChapter(db: Db, actor: StoryActor, publicId: string, number: number,
  input: { baseUpdatedAt: string; now?: Date }): Promise<Result<PublishResult, PublishError>>;
export function scheduleChapter(db: Db, actor: StoryActor, publicId: string, number: number,
  input: { baseUpdatedAt: string; scheduledAt: Date; now?: Date }):
  Promise<Result<PublishResult, PublishError | 'ALREADY_PUBLISHED' | 'INVALID_SCHEDULE_TIME'>>;
export function unscheduleChapter(db: Db, actor: StoryActor, publicId: string, number: number):
  Promise<Result<AuthorChapterView, 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_SCHEDULED'>>;
export function deleteChapter(db: Db, actor: StoryActor, publicId: string, number: number,
  opts?: { now?: Date }): Promise<Result<void, 'NOT_FOUND' | 'FORBIDDEN'>>;
export function publishDueChapters(db: Db, opts?: { now?: Date; limit?: number }): Promise<{ published: number }>;
export function recomputeStoryCounters(tx: Tx, storyId: string): Promise<void>; // status published AND deleted_at IS NULL

// apps/worker/src/content-router.ts (không sửa router.ts của mail)
export interface ContentJobDeps { db: Db }  // phase 9 thêm cdn, appUrl; phase 11 thêm search
export function routeContentJob(job: Pick<Job, 'name' | 'data'>, deps: ContentJobDeps): Promise<void>; // tên lạ → UnrecoverableError
// apps/worker/src/content-worker.ts
export function createContentWorker(connection: Redis, prefix: string, deps: ContentJobDeps): Worker; // concurrency 4
// apps/worker/src/publishing-worker.ts
export function createPublishingWorker(connection: Redis, prefix: string, deps: { db: Db; contentQueue: ContentQueue }): Worker; // concurrency 2; phase 9 thêm deps Redis thống kê
export function registerPublishingSchedulers(queue: Queue): Promise<void>; // upsertJobScheduler ×2, attempts 1, idempotent; phase 9 thêm flush-view-counters, phase 14 thêm backfill-fingerprints
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/db/src/schema/content-events.ts`, `schema/index.ts` | create/modify | bảng outbox |
| `packages/db/drizzle/0001_content_events.sql` + `meta/*` | create | `pnpm --filter @novel-hub/db db:generate --name content_events` |
| `packages/db/src/schema.int.test.ts` | modify | 24 → 25 bảng; insert/đọc `content_events` |
| `packages/core/package.json` | modify | `sanitize-html`, `@types/sanitize-html` (đã duyệt); Tiptap đến qua `@novel-hub/shared/editor` |
| `packages/core/src/content/{render,walker,sanitize,normalize-pids,hooks,outbox}.ts` (+ `*.test.ts`, `outbox.int.test.ts`) | create | |
| `packages/core/src/publishing/{publish-chapter,schedule-chapter,delete-chapter,publish-due,counters,write-content,changes}.ts` | create | |
| `packages/core/src/publishing/publishing.int.test.ts` | create | |
| `packages/core/src/chapters/{drafts,chapter-meta}.ts` | modify | `getDraft` thêm `hasUnpublishedChanges`; `updateChapterMeta` chặn `hidden_by_mod`, ghi outbox khi đã đăng |
| `packages/core/src/stories/{update-story,cover}.ts` | modify | ghi outbox trong transaction khi truyện không còn `draft`; chữ ký giữ nguyên |
| `packages/core/src/index.ts` | modify | |
| `packages/shared/src/{queues,limits}.ts`, `schemas/chapter.ts` (+ test) | modify | |
| `packages/api/src/routes/chapters.ts`, `lib/core-errors.ts` | modify | 4 endpoint, mã lỗi mới |
| `packages/api/src/routes/publishing.int.test.ts` | create | |
| `apps/worker/src/env.ts`, `env.test.ts` | modify | thêm `dbEnvSchema`; `base` của test thêm `DATABASE_URL`, sửa tên ca "dev không cần biến DB" |
| `apps/worker/src/index.ts` | modify | `createDb({ max: 5 })`, producer connection, 2 queue, 2 worker mới, scheduler, thứ tự đóng |
| `apps/worker/src/{content-router,content-worker,publishing-worker}.ts`, `processors/{sweep-scheduled-chapters,drain-content-events}.ts` | create | |
| `apps/worker/src/publishing-worker.int.test.ts` | create | |
| `apps/web/src/components/editor/{publish-dialog,schedule-banner}.tsx`, `components/chapter-list.tsx` | create/modify | |
| `apps/web/src/lib/{chapters,api-errors}.ts`, `routes/write/stories/$publicId/chapters/$number.tsx` | modify | |
| `packages/auth/src/scripts/seed.ts`, `packages/db/src/seed/seed.ts` | modify | tuỳ chọn `renderContent` (step 11) |
| `packages/shared/messages/vi.json` | modify | |
| `apps/web/e2e/publish.spec.ts` | create | |

## Implementation Steps

1. Migration: `content-events.ts` → `pnpm --filter @novel-hub/db db:generate --name content_events` → `pnpm db:migrate`; sửa `schema.int.test.ts`.
2. `walker.ts` (doc, paragraph, heading, blockquote, horizontalRule, hardBreak, text + bold/italic/strike; node/mark lạ → throw vì doc đã qua `parseEditorDoc`), `sanitize.ts`, `normalize-pids.ts`, `render.ts`. Fixture đủ node/mark (gồm text `& < > " '`, đoạn rỗng, blockquote lồng đoạn): `parseEditorDoc` ok → render → `sanitizeHtml(html, CHAPTER_SANITIZE) === html`. Lệch → sửa walker theo output sanitize.
3. `hooks.ts` (`ContentChange`, `contentChangeSchema`, `jobsForChange` switch đủ nhánh với kiểm `never`), `outbox.ts` (`recordContentChanges`, `createContentQueue`, `drainContentEvents`: một transaction mỗi lô; payload parse lỗi → đánh `processed_at` + log lỗi; `addBulk` lỗi/timeout → `attempts + 1`, commit, log, dừng tick; cuối tick `DELETE … WHERE processed_at < now() - interval '7 days'`).
4. `counters.ts` (một `UPDATE stories SET … = (SELECT …)`), `write-content.ts` (upsert content, revision khi hash khác, prune 20, ghi draft có điều kiện base khi `pidsChanged`, cùng mốc `now` cho draft và revision), `changes.ts` (hàm thuần tạo `ContentChange[]`).
5. `publish-chapter.ts`, `schedule-chapter.ts` (`validateScheduleTime(at, now)` thuần), `delete-chapter.ts`: khoá story → chapter → draft, quy tắc `hidden_by_mod`, tự chuyển truyện `draft → published` (phương án A), `recordContentChanges` trước commit.
6. `publish-due.ts`: lấy id ứng viên (join `stories`, `users`, loại `users.status = 'banned'`, không khoá); mỗi chương một transaction: khoá story, khoá chương `FOR UPDATE SKIP LOCKED`, kiểm lại `status = 'scheduled' AND scheduled_at <= now AND deleted_at IS NULL`, lật trạng thái, bộ đếm, chuyển truyện, outbox.
7. Retrofit `updateStory`, `setStoryCover`, `removeStoryCover`, `updateChapterMeta` (outbox trong transaction), `getDraft` (`hasUnpublishedChanges` = draft `updated_at` > revision mới nhất).
8. API: 4 endpoint (chain, `validate`, `coreError`); mã lỗi: `WORD_COUNT_OUT_OF_RANGE` 422, `INVALID_SCHEDULE_TIME` 422, `CHAPTER_HIDDEN_BY_MOD` 409, `ALREADY_PUBLISHED` 409, `NOT_SCHEDULED` 409.
9. Worker:
   - env thêm `dbEnvSchema` + test; `createDb`, `createProducerConnection` cho 2 queue (`content`, `publishing`);
   - `createContentWorker` (concurrency 4), `createPublishingWorker` (concurrency 2, route theo `PUBLISHING_JOBS`);
   - `registerPublishingSchedulers` không chặn boot, lỗi thì log;
   - đóng: worker publishing, worker content, worker mail, 2 queue, pool, các kết nối Redis.
10. UI: `PublishDialog` (luồng pause/resume, `setEditable`), `ScheduleBanner`, badge, xoá chương. `vi.json`, `pnpm i18n:compile`.
11. Seed (nếu hợp lý): `seedDatabase` nhận `renderContent?: (doc) => { html, paragraphIds, contentHash, wordCount }`; CLI `packages/auth/src/scripts/seed.ts` truyền `renderPublishedContent`. `packages/db` không import `core`. Seed không ghi outbox (reindex/purge thủ công lo phần dữ liệu mẫu).
12. E2E (bảng Test). Thủ công: `pnpm dev` hẹn giờ 6 phút → log worker đăng trong ≤ 1 phút sau giờ hẹn; tắt worker qua giờ hẹn rồi bật → đăng ở lần quét đầu; tắt Redis, đăng chương → thành công, bật Redis → `content_events` được đánh `processed_at` trong ≤ 10 giây.
13. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox 4 của Giai đoạn 1 trong spec.

## Function / Interface Checklist

- [x] `contentEvents` + migration `0001_content_events`
- [x] `renderPublishedContent`, `renderChapterHtml`, `CHAPTER_SANITIZE`, `normalizePids`
- [x] `ContentChange`, `contentChangeSchema`, `ContentJob`, `jobsForChange`, `recordContentChanges`, `drainContentEvents`, `createContentQueue`
- [x] `publishChapter`, `scheduleChapter`, `unscheduleChapter`, `deleteChapter`, `publishDueChapters`, `recomputeStoryCounters`, `validateScheduleTime`
- [x] `QUEUES.content`, `QUEUES.publishing`, `PUBLISHING_JOBS`, `CONTENT_JOBS`, `publishChapterSchema`, `scheduleChapterSchema`, `LIMITS.schedule`
- [x] `routeContentJob`, `createContentWorker`, `createPublishingWorker`, `registerPublishingSchedulers`
- [x] `PublishDialog`, `ScheduleBanner`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Pid hợp lệ giữ; pid trùng, `p1`, thiếu → sinh mới; pid đoạn trong blockquote; `pidsChanged` đúng | unit |
| Critical | Walker: text `<script>`, `<img onerror>`, `& " '` được escape; chỉ thẻ allowlist; mọi `<p>`/`<h2>`/`<h3>` có `data-pid`; thứ tự mark cố định | unit |
| Critical | Fixture đủ node/mark: `sanitize(walker(doc)) === walker(doc)` | unit |
| High | `paragraphIds` đúng thứ tự; `wordCount` = `countWords(docToText)`; heading 1 → h2 | unit |
| High | `validateScheduleTime`: 4 phút → lỗi; 1 giờ → ok; 366 ngày → lỗi | unit |
| High | `jobsForChange` trả `[]` cho mọi biến thể; `contentChangeSchema` nhận 3 entity, từ chối entity lạ | unit |
| Critical | Đăng lần đầu: content + revision, `published`, bộ đếm đúng, truyện `draft → published`, `content_events` có `chapter.published` + `story.published` | int core |
| Critical | Lỗi giữa transaction (299 chữ, base cũ) → không ghi gì, không có dòng `content_events` | int core |
| Critical | Cập nhật chương đã đăng: revision 2, `published_at` giữ; nội dung trùng → `unchanged`, không revision, không event | int core |
| Critical | `saveDraft` base cũ chạy song song với publish đổi pid → `DRAFT_CONFLICT`, draft = doc đã chuẩn hoá | int core |
| High | 22 lần đăng nội dung khác → còn 20 revision | int core |
| Critical | `hidden_by_mod`: chương → `CHAPTER_HIDDEN_BY_MOD` (đăng, hẹn, metadata); truyện ẩn đăng chương → vẫn `hidden_by_mod` | int core |
| Critical | Hẹn giờ: `scheduled`, bộ đếm/truyện không đổi, không event; `publishDueChapters(now + 1 ngày)` → `published`, bộ đếm đúng, có event | int core |
| High | Sweeper: chương xoá mềm bỏ qua; tác giả bị ban bỏ qua (bỏ ban → lần sau đăng); hai lần song song → mỗi chương đăng một lần | int core |
| High | Hai chương cùng truyện đăng song song → bộ đếm đúng; xoá chương đã đăng → bộ đếm giảm, số mới không dùng lại | int core |
| Critical | Drain: `addBulk` reject → `processed_at` null, `attempts` 1; tick sau ok → đánh dấu; hai drain song song → mỗi event enqueue một lần; payload hỏng → đánh dấu + log; dọn event > 7 ngày | int core (`mapChange` giả) |
| High | API: mã lỗi/status đúng, response không có `id`, `normalizedDoc` khi pid đổi | int api |
| High | Worker: scheduler 2 job tạo một lần dù gọi hai lần; sweep job đăng chương tới hạn; drain job xử lý event | int worker |
| Critical | Viết ≥ 300 chữ → Đăng → "Đã đăng"; sửa → "Cập nhật" thành công; trong lúc chờ API (`page.route` giữ response) editor `contenteditable="false"` | e2e |
| High | < 300 chữ → nút đăng khoá; hẹn giờ → "Đã hẹn giờ"; huỷ hẹn → "Nháp"; xoá chương → biến mất | e2e |
| Medium | Sweeper thật, worker tắt/bật quanh giờ hẹn, Redis tắt khi đăng, pid trùng sau khi dán | thủ công |

## Dependency Map

- Cần: phase 4 (editor, `saveDraft`, `loadOwnedChapter`, autosave `pause/resume/rebase`), phase 2 (`loadOwnedStory`, `Result`, `validate`, `coreError`, `LIMITS`).
- Phase 6: `renderChapterHtml`, revision do phase này ghi, `LIMITS.revisionsKept`.
- Phase 7: `chapter_contents.html`, trạng thái `published`. Phase 9: job `purge-urls` trong `jobsForChange` + `ContentJobDeps.cdn`/`appUrl`; scheduler `flush-view-counters` trong `registerPublishingSchedulers`; hook `user.update.after` gọi `recordContentChanges`.
- Phase 10: bộ đếm truyện. Phase 11: job `search-sync` + `ContentJobDeps.search`. Phase 13: rate limit `publishChapter`/`createChapter`.
- Phase 14: job `fingerprint-chapter` (dùng `contentHash`), scheduler `backfill-fingerprints` trên queue `publishing`. Phase 15: phát `hidden`/`restored`/`user.banned|unbanned` qua `recordContentChanges`, gọi `recomputeStoryCounters`, khoá story → chapter → draft.

## Success Criteria

- [x] HTML đã sanitize có `data-pid` ổn định, revision (giữ 20), đếm chữ, bộ đếm truyện đúng
- [x] Hẹn giờ đăng ≤ 1 phút sau giờ hẹn, chịu worker khởi động lại, bỏ qua tác giả bị ban
- [x] Mọi thay đổi công khai có dòng `content_events` trong cùng transaction; Redis chết lúc đăng không mất job phụ
- [x] Không nhận HTML từ client; không mất phím gõ khi đăng; chương `hidden_by_mod` không đăng lại được
- [x] Gate 5 lệnh xanh; checkbox 4 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Walker lệch allowlist/sanitize | Trung bình × Trung bình | Test byte-identical trên fixture đủ node/mark |
| Deadlock web/sweeper/mod | Thấp × Cao | Thứ tự khoá story → chapter → draft; sweeper mỗi chương một transaction |
| Job phụ nhân đôi (at-least-once) | Trung bình × Thấp | Processor idempotent, không `jobId` cố định |
| Outbox phình khi worker chết lâu | Thấp × Thấp | Partial index `processed_at IS NULL`; drain bắt kịp theo lô; dọn sau 7 ngày |
| Drain giữ transaction khi Redis treo | Thấp × Thấp | `withTimeout` 10 giây, lô 100 |
| Worker chết → chương hẹn giờ trễ | Thấp × Trung bình | DB là nguồn chuẩn; lần quét đầu sau khi sống lại; uptime mục 11 |
| Doc pid đổi mà editor không nhận | Trung bình × Trung bình | API trả `normalizedDoc`; `setContent` + `rebase`; e2e "Cập nhật" |

Rollback: migration chỉ thêm bảng `content_events` (để nguyên khi revert code, vô hại). Revert commit: chương đã `published` vẫn đọc được; chương `scheduled` dừng tới khi có sweeper; xoá scheduler bằng `queue.removeJobScheduler('sweep-scheduled-chapters')` và `'drain-content-events'`.

## Security Considerations

- HTML chỉ sinh ở server từ doc đã kiểm schema, walker escape text, rồi sanitize `allowedSchemes: []`, `disallowedTagsMode: 'discard'`; `authorNote` plain text, trang đọc escape.
- Chỉ chủ truyện (email đã xác thực, không bị ban) đăng/hẹn/xoá; sweeper không đăng giúp tác giả bị ban; quyết định mod không bị vượt qua.
- Payload outbox/job chỉ chứa id nội bộ và hash, không chứa nội dung; log không in payload.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Phương án A: truyện tự `published` khi chương đầu được đăng.
2. Hẹn giờ tối thiểu 5 phút, tối đa 365 ngày, trễ ≤ 1 phút.
3. Truyện đã `published` mà xoá hết chương: giữ `published`.
4. Bỏ `@tiptap/static-renderer`, dùng walker tự viết (đã chốt sau red team).

## Kết quả (2026-10-05)

- Gate 5 lệnh xanh: unit 292, integration 137 (1 skip S3 có sẵn), e2e 16.
- Code review: không Critical/High; đã sửa #1–#6, #8, #9 (hẹn lại cùng giờ bỏ qua 5 phút; `hasUnpublishedChanges` so theo hash nội dung thay vì mốc thời gian; `setEditable(x, false)`; `min` của ô giờ hẹn; invalidate truyện khi xoá; resync khi 409 do race; lỗi map từng event không chặn outbox; `removeOnFail: { count: 100 }`).
- Để lại cho phase 9/11: dọn `content_events` mỗi 5 giây chưa có index `processed_at` (bảng nhỏ); chương hẹn giờ thiếu nội dung bị log mỗi phút (API không tạo được trạng thái này); pool worker `max: 5` < tổng concurrency 6.
- Lệch nhỏ so với plan: `ContentJobName` là `string` khi `CONTENT_JOBS` rỗng (tự thành union khi phase 9 thêm job); route editor không cần sửa (logic nằm trong `ChapterEditor`); `core` thêm `zod` (catalog) cho `contentChangeSchema`, worker thêm `@novel-hub/db` (workspace).
- Báo cáo review: `plans/reports/code-reviewer-261005-1139-phase-05-publish-chapter-report.md`.

## Next Steps

Phase 6: khôi phục từ revision, dùng `renderChapterHtml` để xem trước và `saveDraft` để ghi doc revision vào draft.
