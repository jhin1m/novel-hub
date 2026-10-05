# Cook report — Phase 2: Tạo và sửa truyện (2026-10-05)

Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-02-tao-va-sua-truyen.md`
Status: DONE_WITH_CONCERNS — code + gate xanh; checkbox 1 spec **chưa** `[x]` vì chưa thử S3 thật.

## Đã làm
- `packages/shared`: `LIMITS`, `COVER_MIME_TYPES`, schema `storyCreateSchema`/`storyUpdateSchema` (update: không default, `mainTag`+`tags` đi cùng nhau), `parseStoryKey`/`storyKey`, `coverImageUrl`, `s3EnvSchema`, `loadOptionalEnv`.
- `packages/db`: `insertStoryWithPublicId` (+ type `Tx`, `StoryRow`), `seedTags` idempotent; lệnh `pnpm db:seed-tags` (ghi vào `CLAUDE.md`).
- `packages/core`: `Result`, `createSemaphore(2, 8)` (hàng đợi có trần → `UPLOAD_BUSY` 503), `canEditStory`, `loadOwnedStory`, `resolveTags`, `createStory` (nâng reader→author), `updateStory` (`previousSlug`), `getAuthorStory`/`listAuthorStories`/`listTags`, `setStoryCover`/`removeStoryCover` (không xoá file cũ), `processCoverImage` (kiểm MP từ header trước decode, sharp nạp lazy, decode 1 lần), `createS3Storage` (aws4fetch, timeout 10s).
- `packages/api`: `validate()`, `coreError()`, sub-app `stories`, `tags`, mở rộng `me`; `ApiDeps.db/storage`; `makeTestApiDeps` (`@novel-hub/api/testing`); 3 nơi dựng `createApp` đã chuyển.
- `apps/web`: `server/infra.ts` tách từ `api-app.ts` (+ storage tuỳ chọn); `/write`, `/write/stories/new`, `/write/stories/$publicId` (form, TagPicker, CoverUpload, WriterGate, noindex); link "Viết truyện" ở header; cache per-account bị xoá khi đăng xuất/reset khi đăng nhập.
- Ngoài file inventory (cần biết): `apps/web/vite.config.ts` thêm `ssr.external: ['sharp']` + `nitro({ traceDeps: ['sharp'] })`, `apps/web` thêm dep `sharp`. Lý do: bản build bundle sharp → server `.output` lỗi 500 toàn site. Đã kiểm `.output` khởi động, health 200, sharp xử lý ảnh.
- Comment/tên test tiếng Việt trong 13 file cũ bị sửa đã dịch sang tiếng Anh.

## Kiểm chứng
- `pnpm typecheck && pnpm lint && pnpm test (206) && pnpm test:int (97 pass, 1 SKIPPED: S3) && pnpm test:e2e (10)` xanh.
- Curl trên bản build (DB test, S3 giả): body 5 MB qua Nitro tới Hono (415 vì bytes ngẫu nhiên), 6 MB → 413 `FILE_TOO_LARGE`; PNG hợp lệ qua sharp tới S3 giả → 500 không lộ chi tiết.
- Review: `code-reviewer-261005-1023-phase-02-stories-review-report.md` 8/10; đã sửa M1 (lộ cache nháp giữa tài khoản), M2 (trần hàng đợi + decode 1 lần), M3 (sharp lazy), L3, L4, L7.

## Còn lại / concerns
- S3 thật chưa thử: user điền `S3_*` (bucket dev MinIO) → chạy `pnpm test:int` (S3 không còn SKIPPED) + smoke bước 13 → mới đánh `[x]` checkbox 1.
- `.output` chỉ có binary sharp của máy build (darwin-arm64): production phải build trong image Linux đúng nền tảng (Debian vs Alpine quyết định gói `@img/*`).
- Review L1 (JSON hỏng → 400 `BAD_REQUEST` thay vì `VALIDATION_ERROR`), L2 (return lỗi trong transaction vẫn commit — an toàn hiện tại), L6 (tag gộp 1 cấp), L8 (`./testing` import được từ code prod) chưa sửa: thấp, ghi nhận.

## Câu hỏi mở
- Image production dùng Debian hay Alpine?
