---
phase: 2
title: "Phase 2: Tạo và sửa truyện"
status: pending
priority: P1
effort: "2.5d"
dependencies: [1]
---

# Phase 2: Tạo và sửa truyện

Spec checkbox: `Tạo và sửa truyện: tiêu đề, giới thiệu, bìa (upload S3, resize), tag, cờ 18+, cờ có dùng AI.`

## Context Links

- Spec mục 4 (bảng `stories`, `tags`, `story_tags`; URL và slug; giới hạn nội dung), mục 7 (author tự động khi tạo truyện đầu, `core/policies`), mục 9 (Zod, lỗi `{ error: { code, message } }`, chain + sub-app)
- `plan.md`: kiến trúc dữ liệu cho UI, Hono, `LIMITS`, Ảnh; câu hỏi mở #3 (khi nào truyện `published`), #7 (MinIO bucket dev), #8 (tag ban đầu)
- `plans/reports/researcher-261004-2352-storage-search-infra-report.md` mục 1–3 (aws4fetch, sharp, multipart)
- Code: nơi dựng `createApp` trong test: `apps/web/src/lib/api-client.test.ts:9-16`, `packages/auth/src/auth.int.test.ts:31-35`, `packages/api/src/app.test.ts:25-35`; `packages/db/src/schema/stories.ts`, `packages/db/src/seed/seed.ts` (`insertStory` retry `public_id`), `packages/api/src/{app.ts,deps.ts}`, `packages/api/src/middleware/require-auth.ts:40` (`requireVerifiedEmail` đã có; `requireRole` :33-37), `packages/api/src/routes/me.ts`, `apps/web/src/server/api-app.ts` (`getInfra` đang private), `packages/shared/src/{slug,public-id}.ts`, `.env.example` (biến `S3_*` đã có, chưa có schema)

## Overview

- `packages/shared`: `LIMITS`, Zod schema truyện, `parseStoryKey`/`storyKey`, `coverImageUrl`, `s3EnvSchema`.
- `packages/core`: `stories` (tạo, sửa, đọc cho tác giả, tag), `policies/story`, `storage` (S3 qua `aws4fetch`), `images` (pipeline bìa bằng `sharp`), `Result` dùng chung.
- `packages/api`: sub-app `stories`, `tags`, mở rộng `me`; `validate()` bọc `zValidator`; ánh xạ mã lỗi core → HTTP; `makeTestApiDeps(overrides)` (subpath test-only `@novel-hub/api/testing`) cho mọi test dựng `createApp`.
- `apps/web`: tách `server/infra.ts`; khu tác giả `/viet`, `/viet/truyen/moi`, `/viet/truyen/$publicId`.
- Truyện mới luôn `visibility = draft`; chuyển `published` làm ở phase 5 theo câu trả lời câu hỏi mở #3.

## Key Insights

- Không bao giờ trả `id`, `authorId`, `mainTagId` ra API: định danh công khai là `publicId`, tag dùng `slug`. Key ảnh dùng `publicId`, không dùng UUID (URL ảnh là công khai).
- `hc` chỉ suy ra type lỗi khi handler `return c.json(body, status)` với status literal. Vì vậy core trả `Result` cho lỗi nghiệp vụ dự kiến, route ánh xạ qua bảng `as const`; lỗi bất ngờ mới `throw` (thành 500).
- Bìa lưu một cột `cover_url` = URL bản 600; bản 300 suy ra bằng hậu tố (`-600.webp` → `-300.webp`) qua `coverImageUrl()` ở shared, để `StoryCover` (phase 3) tự dựng `srcset` ở client mà không cần biết `S3_PUBLIC_URL`.
- Key có hash nội dung → `Cache-Control: public, max-age=31536000, immutable`, không purge CDN ảnh. Đổi/gỡ bìa = key mới hoặc `null`; **năm đầu không xoá file cũ**: HTML đã cache ở CDN (tới vài ngày) và DB restore từ backup vẫn trỏ tới key cũ, xoá ngay sẽ vỡ ảnh. File mồ côi vô hại, dọn sau nếu cần. <!-- Red Team: xoá bìa cũ làm vỡ ảnh trên HTML cache và sau restore -->
- **Hệ phụ tuỳ chọn** (S3 ở phase này; Cloudflare ở phase 9, Meilisearch ở phase 11 dùng lại cùng helper): env parse **riêng** khỏi env chung bằng `loadOptionalEnv(schema, env, name)` ở `@novel-hub/shared/env` (web và worker dùng chung). Dev/test thiếu hoặc thiếu một nửa → log cảnh báo, hệ phụ = `null`, endpoint của nó trả 503 (`STORAGE_UNAVAILABLE` với S3); pool, Redis, auth vẫn chạy. Production thiếu → lỗi khởi động. Bộ S3 = 5 biến không default (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`); `S3_REGION`, `S3_FORCE_PATH_STYLE` có default, không tính vào "đủ bộ". <!-- Red Team: hệ phụ không làm hỏng infra chung -->
- Lên role `author`: `UPDATE users SET role='author' WHERE id=$1 AND role='reader'` trong cùng transaction tạo truyện (không hạ mod/admin). Better Auth đã tắt `cookieCache` nên request kế tiếp thấy role mới.
- Tag người dùng chọn có thể là tag đã gộp (`canonical_id`): quy về tag chuẩn rồi dedupe trước khi đếm. Tag chính phải là `genre` sau khi quy đổi. `story_tags` chứa cả tag chính (khớp seed).
- Không có công cụ tạo tag ở Giai đoạn 1: tag đến từ seed. Production lấy tag ban đầu qua lệnh `pnpm db:seed-tags` (idempotent, danh sách từ fixture seed hiện có, **không** qua guard localhost của `db:seed` vì phải chạy được ở production). <!-- Updated: Validation Session 1 - seed-tags -->
- `PATCH` không được dùng schema có `.default()` (Zod 4 vẫn điền default cho field vắng mặt trong một số trường hợp `.partial()`), nên schema sửa khai báo riêng, mọi field `optional()` không default.
- Route file tác giả: trang sửa truyện là `viet/truyen/$publicId/index.tsx` (không phải `$publicId.tsx`) để phase 4 thêm `viet/truyen/$publicId/chuong/$number.tsx` mà không lồng vào layout của trang sửa. `moi` không thể là `publicId` (bảng chữ bỏ `o`, `i`).

## Requirements

**Functional**

- `POST /api/v1/stories` (đăng nhập + email đã xác thực): body `storyCreateSchema` → 201 `{ story: AuthorStoryView }`. `visibility = draft`, `status = ongoing`, slug từ `slugify(title)`, `publicId` sinh lại khi trùng (tối đa 5 lần).
- `PATCH /api/v1/stories/:publicId`: body `storyUpdateSchema` (ít nhất một field; thêm `status`) → 200 `{ story }`. Đổi tiêu đề → slug mới; `publicId` không đổi. Tác giả không sửa `visibility`, `slug`.
- `PUT /api/v1/stories/:publicId/cover` multipart field `file` → 200 `{ story }`. `DELETE .../cover` → 200 `{ story }` (`cover_url = null`, quay về bìa chữ).
- `GET /api/v1/tags` → `{ tags: TagView[] }` chỉ tag chuẩn (`canonical_id IS NULL`), sắp theo kind rồi tên (`localeCompare(…, 'vi')`), `Cache-Control: public, max-age=300`.
- `GET /api/v1/me/stories` → danh sách truyện của tôi (mới sửa trước); `GET /api/v1/me/stories/:publicId` → `{ story }` đầy đủ cho trang sửa.
- Lỗi: 401 `UNAUTHENTICATED`, 403 `EMAIL_NOT_VERIFIED`/`FORBIDDEN`, 404 `NOT_FOUND` (cả `publicId` sai định dạng), 400 `VALIDATION_ERROR`, 422 `UNKNOWN_TAG`/`MAIN_TAG_NOT_GENRE`/`TOO_MANY_TAGS`/`IMAGE_TOO_SMALL`/`IMAGE_TOO_LARGE`, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_IMAGE`, 503 `STORAGE_UNAVAILABLE`.
- Web:
  - `/viet`: danh sách truyện của tôi (tiêu đề, badge trạng thái hiển thị, số chương, sửa lần cuối), nút "Tạo truyện mới";
  - `/viet/truyen/moi`: form tạo; thành công → chuyển tới trang sửa;
  - `/viet/truyen/$publicId`: form sửa + khu bìa (chọn file, xem trước, tải lên, gỡ bìa).
  - Khách thấy link đăng nhập; email chưa xác thực thấy thông báo + nút gửi lại mail (`WriterGate`).
  - Header (phase 1) thêm link "Viết truyện" → `/viet`. Các trang `/viet*` có `robots: noindex`.

**Non-functional**

- Logic ở `core`; route chỉ validate, gọi `core`, ánh xạ lỗi. Mỗi service mới có unit test; luồng tạo/sửa có Playwright.
- Bìa: kiểm `file.size` trước sharp; magic bytes qua `sharp().metadata()` (không tin `file.type`/đuôi file); **kiểm `width × height` từ `metadata()` (chỉ đọc header) trước khi decode**, vượt 24 MP → 422 `IMAGE_TOO_LARGE`; `limitInputPixels: 24_000_000` làm chốt chặn thứ hai; `rotate()` theo EXIF trước khi kiểm ≥ 600×900; xuất WebP 600×900 và 300×450 (`fit: cover`, `position: attention`, `quality: 82`); không giữ metadata. <!-- Red Team: bom giải nén -->
- Semaphore trong process: tối đa 2 lần xử lý sharp đồng thời (`createSemaphore(2)` thuần TS ở `core/lib`), request thứ 3 chờ; rate limit `uploadCover` 10/giờ/user ở phase 13. <!-- Red Team: sharp chiếm CPU -->
- Chuỗi UI qua Paraglide (tiền tố `writer_`, `story_`, `cover_`, `error_`).

## Architecture

```
web form ──hc──▶ /api/v1/stories (Hono: session → requireVerifiedEmail → validate) ──▶ core/stories
upload (fetch FormData) ──▶ PUT /api/v1/stories/:publicId/cover (bodyLimit 5.5 MB)
      ──▶ core/stories/setStoryCover ─▶ semaphore(2) ─▶ processCoverImage (metadata → kiểm MP → sharp) ─▶ StoragePort.put ×2
                                     ─▶ UPDATE stories.cover_url (không xoá key cũ)
apps/web/src/server/infra.ts  getInfra(): { env, db, healthRedis, mailQueue, storage: StoragePort | null, close }
                              loadOptionalEnv(s3EnvSchema, …) → null khi dev thiếu, throw khi production thiếu
apps/web/src/server/api-app.ts  createApp({ appUrl, auth, checkHealth, db, storage })
```

```ts
// packages/shared/src/limits.ts — phase 4 thêm draftMaxBytes, phase 5 thêm schedule
export const LIMITS = {
  storyTitle: { min: 2, max: 150 },
  storySynopsisMax: 3_000,
  chapterTitleMax: 150,
  authorNoteMax: 1_000,
  chapterWords: { min: 300, max: 20_000 },
  storyTagsMax: 10,
  cover: { maxBytes: 5 * 1024 * 1024, minWidth: 600, minHeight: 900,
           variants: [{ width: 600, height: 900 }, { width: 300, height: 450 }] },
  avatar: { maxBytes: 2 * 1024 * 1024, size: 256 },
  revisionsKept: 20,
} as const;

// packages/shared/src/story-key.ts
export function parseStoryKey(key: string): { slug: string; publicId: string } | null; // lastIndexOf('-'); không có '-' → slug ''
export function storyKey(story: { slug: string; publicId: string }): string;            // `${slug}-${publicId}`
// packages/shared/src/cover.ts
export function coverImageUrl(coverUrl: string, width: 300 | 600): string;

// packages/core/src/lib/result.ts
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

// packages/core/src/storage/storage.ts
export interface StoragePort {
  put(key: string, body: Uint8Array, opts: { contentType: string; cacheControl: string }): Promise<void>;
  delete(key: string): Promise<void>;   // chỉ dọn key `test/…` trong int test; năm đầu không xoá bìa cũ
  publicUrl(key: string): string;
}
// mọi request S3 dùng `signal: AbortSignal.timeout(10_000)`
export function createS3Storage(cfg: S3Config, fetchImpl?: typeof fetch): StoragePort;

// packages/core/src/stories/*
export type StoryActor = Pick<CurrentUser, 'id' | 'role' | 'status' | 'emailVerified'>;
export interface TagView { slug: string; name: string; kind: 'genre' | 'theme' | 'warning' }
export interface AuthorStoryView {
  publicId: string; slug: string; title: string; synopsis: string; coverUrl: string | null;
  mainTag: TagView; tags: TagView[]; status: StoryStatus; visibility: StoryVisibility;
  isMature: boolean; isAiAssisted: boolean; wordCount: number; chapterCount: number;
  lastChapterAt: string | null; createdAt: string; updatedAt: string;
}
type TagError = 'UNKNOWN_TAG' | 'MAIN_TAG_NOT_GENRE' | 'TOO_MANY_TAGS';
export function createStory(db: Db, actor: StoryActor, input: StoryCreateInput): Promise<Result<AuthorStoryView, TagError>>;
export function updateStory(db: Db, actor: StoryActor, publicId: string, input: StoryUpdateInput):
  Promise<Result<{ story: AuthorStoryView; previousSlug: string | null }, 'NOT_FOUND' | 'FORBIDDEN' | TagError>>;
export function getAuthorStory(db: Db, actor: StoryActor, publicId: string): Promise<Result<AuthorStoryView, 'NOT_FOUND' | 'FORBIDDEN'>>;
export function listAuthorStories(db: Db, actor: StoryActor): Promise<AuthorStoryView[]>;
export function listTags(db: Db): Promise<TagView[]>;
export function setStoryCover(deps: { db: Db; storage: StoragePort }, actor: StoryActor, publicId: string, file: Uint8Array):
  Promise<Result<AuthorStoryView, 'NOT_FOUND' | 'FORBIDDEN' | CoverImageError>>;
export function removeStoryCover(deps: { db: Db; storage: StoragePort }, actor: StoryActor, publicId: string):
  Promise<Result<AuthorStoryView, 'NOT_FOUND' | 'FORBIDDEN'>>;
export function loadOwnedStory(db: Db | Tx, actor: StoryActor, publicId: string, opts?: { forUpdate?: boolean }):
  Promise<Result<StoryRow, 'NOT_FOUND' | 'FORBIDDEN'>>; // phase 4/5/6 dùng lại
// packages/core/src/policies/story.ts
export function canEditStory(user: StoryActor, story: { authorId: string }): boolean; // chủ truyện và không bị ban
// packages/core/src/images/cover.ts
export type CoverImageError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_IMAGE' | 'IMAGE_TOO_SMALL' | 'IMAGE_TOO_LARGE';
export const COVER_MAX_PIXELS = 24_000_000;
// packages/core/src/lib/semaphore.ts
export function createSemaphore(max: number): <T>(task: () => Promise<T>) => Promise<T>;
export function processCoverImage(input: Uint8Array): Promise<Result<{ w600: Buffer; w300: Buffer }, CoverImageError>>;
// packages/db/src/stories.ts (dùng chung cho seed và core)
export function insertStoryWithPublicId(tx: Tx, values: Omit<NewStory, 'publicId'>, gen?: () => string): Promise<{ id: string; publicId: string }>;
// packages/api/src/lib/validate.ts — mọi sub-app sau dùng
export function validate<T extends keyof ValidationTargets, S extends ZodType>(target: T, schema: S); // lỗi → 400 VALIDATION_ERROR
// packages/api/src/lib/core-errors.ts — bảng mã → status (as const), phase sau bổ sung mã
export function coreError<C extends CoreErrorCode>(c: Context, code: C): Response; // status literal theo bảng
// packages/api/src/deps.ts
export interface ApiDeps { checkHealth; auth; appUrl; db: Db; storage: StoragePort | null } // phase 5 không thêm queue (outbox ghi bằng db)
// packages/api/src/testing.ts — export "./testing", chỉ test import
export function makeTestApiDeps(overrides?: Partial<ApiDeps>): ApiDeps; // db mặc định = Proxy throw "db không dùng trong test này", storage null
// phase sau mở rộng ApiDeps thì thêm mặc định ở đây: phase 9 `viewCounter: null`, phase 11 `search: null`, phase 13 `rateLimit: null`, `clientIp: () => null`
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/limits.ts` (+ test) | create | |
| `packages/shared/src/schemas/story.ts` (+ test) | create | `tagSlugSchema`, `storyStatusSchema`, `storyCreateSchema`, `storyUpdateSchema` |
| `packages/shared/src/story-key.ts` (+ test), `cover.ts` (+ test) | create | |
| `packages/shared/src/index.ts` | modify | export mới |
| `packages/shared/src/env.ts` (+ test) | modify | `s3EnvSchema` (5 biến bắt buộc trong schema, region/path-style có default); `loadOptionalEnv(schema, env, name)` (production thiếu → throw; khác → warn + `null`) |
| `packages/db/src/stories.ts`, `src/index.ts` | create/modify | `insertStoryWithPublicId`, type `Tx` |
| `packages/db/src/seed/seed.ts`, `seed/index.ts` | modify | dùng `insertStoryWithPublicId`; export `seedTags(db)` cho e2e |
| script `db:seed-tags` (cạnh script `db:seed` hiện có trong `packages/auth/package.json`) + root `package.json` + `CLAUDE.md` | create/modify | entry gọi `seedTags(db)` idempotent (`onConflictDoNothing` theo slug), không gọi `assertSeedAllowed`; int test chạy hai lần không nhân đôi |
| `packages/core/src/lib/{result,semaphore}.ts` (+ `semaphore.test.ts`) | create | |
| `packages/core/src/policies/story.ts` (+ test) | create | |
| `packages/core/src/stories/{create-story,update-story,read-stories,resolve-tags,load-owned-story,story-view,cover}.ts` | create | |
| `packages/core/src/stories/stories.int.test.ts` | create | |
| `packages/core/src/storage/{storage,s3-storage}.ts` (+ `s3-storage.test.ts`, `s3-storage.int.test.ts`) | create | int test thiếu `S3_*` → `describe.skipIf` + `console.warn('S3 int test SKIPPED: thiếu S3_*')`, hiện "skipped" trong báo cáo, không pass âm thầm |
| `packages/core/src/images/cover.ts` (+ test) | create | ảnh test sinh bằng `sharp({ create })` |
| `packages/core/src/index.ts`, `package.json` | modify | dep `sharp`, `aws4fetch` (đã duyệt); export `type Db` |
| `packages/api/src/lib/{validate,core-errors}.ts` (+ test) | create | dep `@hono/zod-validator` |
| `packages/api/src/routes/{stories,tags}.ts` | create | |
| `packages/api/src/routes/me.ts` | modify | nhận `deps`; thêm `/stories`, `/stories/:publicId` |
| `packages/api/src/{app.ts,deps.ts}` | modify | mount, mở rộng `ApiDeps` |
| `packages/api/src/testing.ts`, `package.json` | create/modify | `makeTestApiDeps`; export `./testing` |
| `apps/web/src/lib/api-client.test.ts`, `packages/auth/src/auth.int.test.ts`, `packages/api/src/app.test.ts` | modify | dựng `createApp(makeTestApiDeps({...}))` thay cho object tay (thiếu `db`, `storage` sẽ lỗi type) |
| `packages/api/src/routes/stories.int.test.ts` | create | DB thật, `AuthPort` giả, `StoragePort` trong bộ nhớ (chỉ ở test) |
| `apps/web/src/server/infra.ts` | create | tách từ `api-app.ts`, thêm `storage` (qua `loadOptionalEnv`) |
| `apps/web/src/server/api-app.ts` | modify | dùng `getInfra()` |
| `eslint.config.js` | modify | thêm `apps/web/src/server-fns/**` vào `ignores` của rule chặn import |
| `apps/web/src/lib/{stories,api-errors}.ts` | create | hook TanStack Query; `readApiError`, `apiErrorMessage(code)` |
| `apps/web/src/components/{writer-gate,story-form,tag-picker,cover-upload}.tsx` | create | |
| `apps/web/src/routes/viet/index.tsx`, `viet/truyen/moi.tsx`, `viet/truyen/$publicId/index.tsx` | create | |
| `apps/web/src/components/site-layout.tsx` | modify | link "Viết truyện" |
| `packages/shared/messages/vi.json` | modify | |
| `apps/web/e2e/helpers/accounts.ts`, `e2e/global-setup.ts`, `e2e/stories.spec.ts` | create/modify | `signUpVerified`; global setup gọi `seedTags` |

## Implementation Steps

1. Shared: `LIMITS`, schema truyện (chuỗi `trim().normalize('NFC')`, giới hạn lấy từ `LIMITS`), `parseStoryKey`, `storyKey`, `coverImageUrl`, `s3EnvSchema` (`S3_FORCE_PATH_STYLE` parse bằng `z.enum(['true','false'])`, không dùng `z.coerce.boolean`). Unit test.
2. API test helper: `packages/api/src/testing.ts` + export `./testing`; sửa 3 nơi dựng `createApp` (Context Links) sang `makeTestApiDeps`, `pnpm typecheck && pnpm test` xanh trước khi mở rộng `ApiDeps`. <!-- Red Team: caller ApiDeps -->
3. DB: `insertStoryWithPublicId` (chuyển logic `onConflictDoNothing` + retry từ seed), seed dùng lại; tách `seedTags(db)` từ `seedDatabase` (idempotent). Thêm lệnh `pnpm db:seed-tags` (root) chỉ seed tag, chạy được ở production; ghi vào bảng lệnh `CLAUDE.md`. `seed.int.test.ts` vẫn xanh. <!-- Updated: Validation Session 1 - seed-tags -->
4. Core `policies/story.ts`, `lib/result.ts`, `stories/resolve-tags.ts`: tra slug → tag; tag gộp → tag chuẩn; slug lạ → `UNKNOWN_TAG`; tag chính không phải genre → `MAIN_TAG_NOT_GENRE`; tập tag (gồm tag chính) sau dedupe > 10 → `TOO_MANY_TAGS`.
5. `create-story.ts`: một transaction: resolve tag → `insertStoryWithPublicId` → insert `story_tags` → nâng role. `update-story.ts`: `loadOwnedStory(tx, …, { forUpdate: true })`, đổi tiêu đề thì đổi slug, đổi tag thì xoá/chèn lại `story_tags`, trả `previousSlug` khi slug đổi (phase 5 dùng cho purge). `story-view.ts` dựng `AuthorStoryView` (date → ISO).
6. `images/cover.ts` + `lib/semaphore.ts` theo Non-functional (`metadata()` → kiểm `width × height` ≤ `COVER_MAX_PIXELS` → mới decode); `UNSUPPORTED_IMAGE` khi format ∉ jpeg/png/webp hoặc sharp lỗi đọc; EXIF orientation 5–8 đảo w/h khi kiểm kích thước.
7. `storage/s3-storage.ts`: `AwsClient({ accessKeyId, secretAccessKey, service: 's3', region })`; URL path-style `${endpoint}/${bucket}/${key}` (hoặc virtual-host khi `forcePathStyle=false`); `put` kiểm `res.ok`, lỗi thì throw kèm status (không kèm body). Unit test với `fetchImpl` giả: URL, method, header `authorization` bắt đầu `AWS4-HMAC-SHA256`, `content-type`, `cache-control`.
8. `stories/cover.ts`: `setStoryCover` → policy → `processCoverImage` → key `covers/{publicId}/{sha256(w600).slice(0,16)}-{600|300}.webp` → `put` hai bản → update `cover_url`. Không xoá key cũ. `removeStoryCover` chỉ đặt `cover_url = null`.
9. API: `validate.ts`, `core-errors.ts`, `tags.ts`, `stories.ts` (chain; `PUT /:publicId/cover` gắn `bodyLimit({ maxSize: 5.5 MB })` trả 413 dạng chuẩn; `parseBody()` lấy `file instanceof File`, kiểm `file.size` ≤ `LIMITS.cover.maxBytes`; `storage === null` → 503), sửa `me.ts`, mount trong `app.ts`. Kiểm giới hạn body của Nitro/srvx không chặn trước 5.5 MB (thử bằng curl).
10. Web `server/infra.ts`: chuyển `createInfra`, `getInfra`, `registerCloseOnSignal`, env schema chung sang; S3 parse riêng bằng `loadOptionalEnv(s3EnvSchema, process.env, 's3')` (production thiếu → throw; dev thiếu/thiếu nửa → warn + `null`). `api-app.ts` chỉ còn dựng app. Sửa `eslint.config.js`.
11. Web lib/components/routes:
    - Form dùng `FormData` + `storyCreateSchema.safeParse` ở client (cùng schema với server); lỗi field hiển thị dưới ô.
    - `TagPicker`: `Select` tag chính (genre) + checkbox theo nhóm kind, bộ đếm `n/10`, chặn chọn quá.
    - `CoverUpload`: kiểm loại và dung lượng ở client trước khi gửi, xem trước bằng `URL.createObjectURL` (thu hồi khi unmount), `fetch(url, { method: 'PUT', body: formData })`.
    - Sau mutation thì invalidate `['me','stories']`.
12. `vi.json` + `pnpm i18n:compile`. E2E helper `signUpVerified(page)`: đăng ký qua UI rồi `UPDATE users SET email_verified = true` trực tiếp trong DB test (không gọi `markEmailVerified` vì hàm đó xoá phiên).
13. Smoke thủ công với MinIO bucket dev (khi user đã điền `S3_*`): tải JPG xoay EXIF, PNG 600×900, WebP; tải file 6 MB; tải `.gif` đổi đuôi `.jpg`; mở `cover_url` và bản 300 trên trình duyệt; đổi bìa → URL cũ vẫn mở được (không xoá); chạy `pnpm test:int` có `S3_*` → `s3-storage.int.test.ts` pass (không skipped).
14. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox 1 của Giai đoạn 1 trong spec **chỉ khi** bước smoke MinIO thật và `s3-storage.int.test.ts` đã pass với bucket dev. Chưa có `S3_*` → báo `DONE_WITH_CONCERNS`, không đánh checkbox. <!-- Red Team: int test S3 không pass âm thầm -->

## Function / Interface Checklist

- [ ] `LIMITS`, `storyCreateSchema`, `storyUpdateSchema`, `tagSlugSchema`, `storyStatusSchema`
- [ ] `parseStoryKey`, `storyKey`, `coverImageUrl`, `s3EnvSchema`, `loadOptionalEnv`
- [ ] `insertStoryWithPublicId`, `seedTags`
- [ ] `Result`, `canEditStory`, `loadOwnedStory`
- [ ] `createStory`, `updateStory`, `getAuthorStory`, `listAuthorStories`, `listTags`, `setStoryCover`, `removeStoryCover`
- [ ] `processCoverImage`, `COVER_MAX_PIXELS`, `createSemaphore`, `StoragePort`, `createS3Storage`
- [ ] `validate`, `coreError`, `makeTestApiDeps`, `createStoryRoutes`, `createTagRoutes`, `createMeRoutes(deps)`
- [ ] `getInfra()` (export từ `server/infra.ts`)
- [ ] `WriterGate`, `StoryForm`, `TagPicker`, `CoverUpload`, `readApiError`, `apiErrorMessage`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Tạo truyện: `draft`, `ongoing`, slug đúng, `publicId` hợp lệ, `story_tags` có tag chính | int core |
| Critical | Reader tạo truyện đầu → `author`; mod tạo truyện → vẫn `mod` | int core |
| Critical | User khác sửa → `FORBIDDEN`; `publicId` không tồn tại → `NOT_FOUND` | int core + api |
| High | Tag gộp quy về tag chuẩn, trùng sau quy đổi chỉ tính một lần; tag chính `theme` → `MAIN_TAG_NOT_GENRE`; 11 tag → `TOO_MANY_TAGS`; slug lạ → `UNKNOWN_TAG` | int core |
| High | `publicId` trùng lần đầu (generator giả) → sinh lại, insert thành công | int db |
| High | Đổi tiêu đề → slug mới, `previousSlug` = slug cũ; `publicId` không đổi | int core |
| Critical | Chưa đăng nhập 401; email chưa xác thực 403 `EMAIL_NOT_VERIFIED`; body sai 400 `VALIDATION_ERROR` đúng dạng | int api |
| Critical | Mọi response stories/me/tags không chứa key `id`, `authorId`, `mainTagId` hay chuỗi dạng UUID (quét đệ quy) | int api |
| High | Upload bìa (storage trong bộ nhớ): 2 key `-600.webp`/`-300.webp`, `cache-control` immutable, `cover_url` cập nhật, key cũ **vẫn còn** (không gọi `delete`) | int api |
| High | File 6 MB → 413; file text đổi đuôi → 415; PNG 500×800 → 422; storage null → 503; multipart từ origin khác → 403 | int api |
| High | `processCoverImage`: JPEG 900×600 có EXIF orientation 6 → hợp lệ; output đúng kích thước, định dạng webp, không có EXIF | unit |
| Critical | PNG 6000×5000 (30 MP, nén nhỏ < 5 MB) → `IMAGE_TOO_LARGE` trước khi decode (spy: không gọi `.resize`) | unit |
| High | `createSemaphore(2)`: 3 task đồng thời → tối đa 2 chạy cùng lúc, task 3 chạy khi một task xong, task lỗi không giữ suất | unit |
| High | `makeTestApiDeps()` dựng được `createApp`; route cần `db` mà không truyền → lỗi rõ "db không dùng trong test này" | unit |
| Medium | `loadOptionalEnv`: dev thiếu nửa bộ S3 → `null` + cảnh báo; production thiếu → throw; đủ 5 biến → config | unit |
| High | `parseStoryKey`: `kiem-dao-k7m2xq9p`, `k7m2xq9p`, `abc-` → null, `x-0000000o` → null | unit |
| Medium | `s3EnvSchema`: thiếu một trong 5 biến → lỗi; `S3_REGION`/`S3_FORCE_PATH_STYLE` vắng → dùng default | unit |
| Critical | S3 thật: put → GET public URL 200 → delete → 404; thiếu `S3_*` → báo SKIPPED rõ, checkbox chưa được đánh | int |
| Critical | User đã xác thực tạo truyện (tiêu đề, giới thiệu, tag chính + 1 tag, 18+) → trang sửa → `/viet` có truyện, badge "Nháp" → sửa tiêu đề thành công | e2e |
| High | Tiêu đề 1 ký tự → báo lỗi ở form, không gửi request; user chưa xác thực ở `/viet/truyen/moi` thấy thông báo xác thực | e2e |
| Critical | Upload bìa thật trên UI với MinIO bucket dev | thủ công (step 13) |

## Dependency Map

- Cần: phase 1 (component ui, `SiteLayout`), Giai đoạn 0 (auth, `requireVerifiedEmail`, schema).
- Phase 3 dùng: `AuthorStoryView.coverUrl`, `mainTag.slug`, `coverImageUrl`, trang `/viet` để gắn `StoryCover`.
- Phase 4/5/6 dùng: `loadOwnedStory`, `canEditStory`, `Result`, `validate`, `coreError`, `LIMITS`, trang `/viet/truyen/$publicId`.
- Phase 5 sửa: `updateStory`/`setStoryCover`/`removeStoryCover` ghi outbox `recordContentChanges(tx, [{ entity: 'story', action: 'updated', storyId, previousSlug }])` trong transaction (chữ ký giữ nguyên).
- Phase 7/10/16 dùng: `parseStoryKey`, `storyKey`, `getInfra()` từ server function. Phase 9/11 dùng `loadOptionalEnv` cho `CF_*`, `MEILI_*`.
- Mọi phase thêm route dùng `makeTestApiDeps` trong test.
- Phase 13 gắn rate limit `createStory`, `uploadCover` vào `POST /api/v1/stories`, `PUT .../cover`.

## Success Criteria

- [ ] Tạo/sửa truyện với đủ trường của checkbox; giới hạn khớp spec mục 4
- [ ] Bìa upload, resize đúng 2 cỡ WebP, lưu MinIO: smoke thật + int test S3 pass với bucket dev (bắt buộc trước khi đánh checkbox)
- [ ] Không UUID nào ra API/UI; mọi lỗi đúng dạng chuẩn
- [ ] Role `author` tự động; mod/admin không bị hạ
- [ ] Gate 5 lệnh xanh; checkbox 1 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| `aws4fetch` ký sai với MinIO | Trung bình × Cao | Int test thật sớm (step 6); fallback `@aws-sdk/client-s3` (`forcePathStyle`, `requestChecksumCalculation: 'WHEN_REQUIRED'`) cần duyệt lại |
| Ảnh "bom giải nén" làm treo web | Thấp × Cao | Kiểm size, kiểm MP từ header trước decode, `limitInputPixels`, `failOn: 'error'`; rate limit phase 13 |
| sharp chiếm CPU khi nhiều upload | Trung bình × Trung bình | Semaphore 2 trong process; rate limit `uploadCover` |
| File bìa mồ côi tích luỹ | Trung bình × Thấp | Chấp nhận năm đầu; key theo `covers/{publicId}/` nên dọn được sau |
| Nitro chặn body trước Hono | Thấp × Trung bình | Thử curl 5 MB và 6 MB ở dev và bản build |
| Tách `infra.ts` làm hỏng vòng đời kết nối | Thấp × Cao | Giữ nguyên code, chỉ dời; lặp lại smoke HMR và SIGTERM của Giai đoạn 0 |
| Thiếu tag trên production | Cao × Cao | `pnpm db:seed-tags` idempotent |

Rollback: không có migration. Revert commit; file ảnh đã tải lên còn trên bucket (vô hại). Revert phải giữ `makeTestApiDeps` nếu phase sau đã dùng.

## Security Considerations

- Chỉ chủ truyện sửa được (`canEditStory`); user bị ban đã là khách ở `lookupSession`.
- Không tin `file.type`/tên file; giới hạn byte ở `bodyLimit` và core, giới hạn MP từ header; semaphore; key ảnh không chứa input người dùng.
- `synopsis` là plain text, lưu nguyên văn, khi hiển thị luôn escape (React mặc định; không dùng `dangerouslySetInnerHTML`).
- `S3_SECRET_ACCESS_KEY` chỉ ở server; lỗi S3 không đưa body/URL ký vào response.
- CSRF: multipart đi qua `csrf(appUrl)` sẵn có của `/api/v1`.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Tag production: **có** `pnpm db:seed-tags` idempotent, danh sách từ fixture hiện có; user chỉnh danh sách sau.
2. Int test S3 dùng bucket dev (key `test/…`, xoá sau test); thiếu env → SKIPPED rõ, checkbox chờ.
3. MinIO: user tạo bucket dev + key trên server MinIO có sẵn trước bước 13. Chưa có → bước 13 và `s3-storage.int.test.ts` SKIPPED, phase báo `DONE_WITH_CONCERNS`, checkbox 1 **chưa** `[x]`; vẫn được sang phase 3, quay lại thử S3 thật khi user điền `S3_*`.

## Next Steps

Phase 3: `StoryCover` dùng `coverUrl` và `mainTag.slug`, gắn vào `/viet` và trang sửa truyện.
