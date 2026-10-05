# Cook — Phase 4: Editor Tiptap và autosave

Ngày: 2026-10-05 · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-04-editor-tiptap-autosave.md` · Trạng thái: DONE

## Đã làm

- **shared**: `countWords` (`src/text.ts`), `generatePid`/`isValidPid`/`PID_PATTERN`, `docToText`, kiểu `EditorDocJson`; subpath `@novel-hub/shared/editor` (`editorExtensions`, `editorSchema`, `parseEditorDoc`, `emptyDraftDoc`); `schemas/chapter.ts`; `LIMITS.draftMaxBytes`. Dep Tiptap 3.31.4 ghim chính xác.
- **db seed**: dùng `countWords`, `generatePid` từ shared; int test kiểm pid.
- **core/chapters**: `loadOwnedChapter`, `createChapter` (khoá story `FOR UPDATE`, `max(number)` tính cả xoá mềm, conflict guard thử lại 1 lần), `getDraft`/`saveDraft` (so phiên bản bằng `date_trunc('milliseconds', updated_at)`, phiên bản mới luôn > base), `updateChapterMeta`, `listAuthorChapters`; `canEditChapter` qua `loadOwnedStory({ policy })`.
- **api**: `routes/chapters.ts` dưới `/api/v1/stories/:publicId/chapters` (POST, PATCH `/:number`, GET/PUT `/:number/draft`, `bodyLimit` 2 MB → 413 `DRAFT_TOO_LARGE`); `GET /api/v1/me/stories/:publicId/chapters`; mã lỗi `DRAFT_CONFLICT` 409, `INVALID_DOCUMENT` 422.
- **web**: `lib/autosave.ts` (máy trạng thái thuần, pause/resume/rebase), `lib/draft-mirror.ts` (mirror localStorage, throttle 1s, `sameDoc`), `lib/chapters.ts`; `components/editor/*` (toolbar, trạng thái lưu, chế độ tập trung, banner khôi phục, banner xung đột); `components/chapter-list.tsx`; route `/write/stories/$publicId/chapters/$number` (`ssr: false`, `noindex`); CSS `.chapter-editor-content`.
- **eslint**: hằng dùng chung, `@tiptap/*` và `@novel-hub/shared/editor` chỉ được import trong `apps/web/src/components/editor/**`; `core`/`db` vẫn chặn ở mọi file browser; `lint-boundaries.test.ts` (~3s).
- Build: Tiptap chỉ nằm trong chunk route editor.

## Kiểm thử

- `pnpm typecheck`, `pnpm lint`, `prettier --check`: xanh.
- `pnpm test`: 260 pass. `pnpm test:int`: 108 pass, 1 skip (S3 thật, `S3_*` trống). `pnpm test:e2e`: 14 pass (4 mới ở `e2e/editor.spec.ts`).
- Bước thủ công chạy bằng spec Playwright tạm (đã xoá): 22.100 chữ, gõ 15 ký tự ~117 ms; offline → backoff 2s/4s → online tự lưu; đóng tab khi chưa lưu → banner khôi phục; dán HTML từ Docs → chỉ còn định dạng cho phép.

## Review

`code-reviewer-261005-1122-phase-04-editor-autosave-review-report.md`: 7.5/10, 0 Critical. Đã sửa:
- H1: lưu tên chương/lời nhắn invalidate cả key draft → refetch → autosave dựng lại với phiên bản cũ → 409 giả hoặc editor bị gỡ. Key draft tách riêng, invalidate `exact`, effect không phụ thuộc `draft.updatedAt`; e2e mới.
- M1 `canEditChapter` được dùng; M2 409 sau khi mất response → đối chiếu draft server, trùng nội dung = đã lưu (e2e mới); M3 `WriterGate` giữ editor khi refetch `/me` lỗi.
- L1 undo về bản đã lưu sau lỗi → `saved`; L2 `save` ném đồng bộ → retryable; Esc khi đang gõ IME không thoát chế độ tập trung.

Không sửa (Low): `rebase()` khi có request bay (phase 5/6 gọi sau `pause()`), khôi phục mirror bỏ qua `baseUpdatedAt`, `beforeunload` không đặt `returnValue`.

## Lưu ý

- DB dev đã seed trước phase này còn pid `p1` → lưu nháp 422: `pnpm db:seed --reset`.
- Phát hiện: Postgres `jsonb` đổi thứ tự key; mọi so sánh doc giữa client và server dùng `sameDoc`.

## Câu hỏi mở

- Không.
