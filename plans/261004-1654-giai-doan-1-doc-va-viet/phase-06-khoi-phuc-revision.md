---
phase: 6
title: "Phase 6: Khôi phục revision"
status: pending
priority: P1
effort: "1d"
dependencies: [5]
---

# Phase 6: Khôi phục revision

Spec checkbox: `Khôi phục từ revision cũ.`

## Context Links

- Spec mục 4 (`chapter_revisions`: giữ N bản gần nhất, mặc định 20; không hiện ID nội bộ ra UI), mục 8 (khu viết: nền trơn, không sidebar thừa)
- [plan.md](./plan.md): "Đăng chương" (revision ghi lúc đăng, giữ 20), "Autosave" (`baseUpdatedAt` → 409)
- `plans/reports/researcher-261004-2352-editor-content-pipeline-report.md` mục 3 (pid), 7 (autosave), 8 (giữ 20 revision)
- Phase 4: `loadOwnedChapter`, `saveDraft(db, actor, publicId, number, input)` → `Result`, lỗi 409 `DRAFT_CONFLICT`, `EditorDocJson`, `createAutosave()` (`pause`, `resume`, `rebase`), route editor, mirror localStorage
- Phase 5: revision ghi lúc đăng, `renderChapterHtml` (walker + sanitize), `LIMITS.revisionsKept`
- Phase 2: `Result`, `validate()`, `coreError()`
- Schema: `packages/db/src/schema/chapters.ts` (`chapterRevisions`, index `(chapter_id, created_at DESC)`)

## Overview

- Tác giả mở panel "Lịch sử phiên bản" trong editor: danh sách revision (thời điểm đăng, số chữ), xem trước HTML, bấm khôi phục.
- Khôi phục = ghi `doc_json` của revision vào `chapter_drafts` qua `saveDraft` của phase 4 (không đăng thẳng). Muốn công khai thì đăng lại qua phase 5.
- `pid` trong doc revision giữ nguyên → đăng lại không vỡ neo bình luận theo đoạn sau này.

## Key Insights

- Revision chỉ sinh lúc đăng (phase 5), bỏ qua khi `content_hash` trùng bản gần nhất → revision mới nhất là bản đang đăng (nếu chương `published`).
- **Khoá revision ra ngoài:** spec cấm hiện UUID. `key` = `created_at` mili giây epoch (chuỗi số). Ổn định khi có revision mới, không lộ id. Hai revision cùng chương cùng mili giây gần như không thể vì phase 5 khoá chương `FOR UPDATE` khi đăng.
- **Bẫy độ chính xác:** `timestamptz` micro giây, JS mili giây. Tra bằng khoảng `created_at >= t AND created_at < t + 1ms` (dùng index); hơn một dòng thì lấy dòng mới nhất.
- **Một đường ghi draft:** `restoreRevision(db, actor, publicId, number, key, baseUpdatedAt)` = `loadOwnedChapter` → tra revision → `saveDraft` của phase 4 với doc revision. Cùng `DRAFT_CONFLICT`, cùng kiểm schema, cùng điều kiện `date_trunc`. <!-- Red Team: lệch hợp đồng phase 4 -->
- **Khôi phục đi qua autosave controller:** `editor.setEditable(false)` → `await autosave.pause()` (flush; khác `saved` thì dừng, báo lỗi) → POST restore → `setContent(doc, { emitUpdate: false })` → `rebase(updatedAt, JSON.stringify(doc))` → `resume()` → `setEditable(true)`. Không phím nào bị mất, không 409 giả do base cũ. <!-- Red Team: race gõ phím, rebase base cũ -->
- **Không có "Hoàn tác"**: dialog xác nhận nói rõ nháp hiện tại sẽ bị thay; bản đã đăng luôn còn trong revision, mirror localStorage của phase 4 vẫn là lớp bảo vệ khi lỡ tay. <!-- Red Team: bỏ Hoàn tác (YAGNI, thêm đường ghi thứ hai) -->
- HTML xem trước sinh ở server bằng `renderChapterHtml` của phase 5 (không chuẩn hoá lại pid). Không nhận HTML từ client, không lưu HTML trong revision.
- Chương `hidden_by_mod` vẫn khôi phục được vào nháp (nháp không công khai, khớp quy tắc phase 5).

## Requirements

**Functional**
- `GET /api/v1/stories/:publicId/chapters/:number/revisions` → `{ revisions: [{ key, createdAt, wordCount, isPublished }] }`, mới nhất trước, tối đa `LIMITS.revisionsKept`. `isPublished = true` cho bản mới nhất khi chương `published`.
- `GET .../revisions/:key` → `{ revision: { key, createdAt, wordCount, html } }`; không có → 404 `NOT_FOUND`.
- `POST .../revisions/:key/restore` body `{ baseUpdatedAt }` → 200 `{ draft: { doc, updatedAt } }`; draft đã đổi ở nơi khác → 409 `DRAFT_CONFLICT`; key không có → 404.
- Quyền và lỗi theo đúng phase 4: đăng nhập + email đã xác thực + `canEditChapter` (qua `loadOwnedChapter`): không phải chủ → 403 `FORBIDDEN`; chương không có/xoá mềm → 404.
- Chương chưa từng đăng → danh sách rỗng, panel hiện "Chưa có phiên bản nào".
- UI: nút "Lịch sử" trên thanh công cụ editor → `Sheet` bên phải; chọn revision → xem trước (Literata, cỡ đọc mặc định); "Khôi phục vào bản nháp" → dialog xác nhận → luồng pause/resume ở Key Insights → trạng thái lưu "Đã lưu", thông báo inline "Đã khôi phục bản lúc HH:mm dd/MM".
- 409: hiện banner xung đột giống autosave (phase 4: "Tải bản mới nhất"/"Giữ bản của tôi").
- Chế độ tập trung ẩn nút "Lịch sử".

**Non-functional**
- Không UUID trong response, URL, DOM.
- Danh sách chỉ select `created_at`, `word_count` (không kéo `doc_json` 20 bản).
- Mọi chuỗi UI qua Paraglide.

## Architecture

```
Editor (/viet/truyen/$publicId/chuong/$number, ssr:false)
  └─ RevisionHistorySheet
       ├─ useQuery GET  .../revisions        → danh sách
       ├─ useQuery GET  .../revisions/:key   → html xem trước
       └─ restore: setEditable(false) → autosave.pause() ─'saved'?─ POST .../revisions/:key/restore {baseUpdatedAt}
                   → setContent(doc, {emitUpdate:false}) → autosave.rebase(updatedAt, json) → writeMirror
                   → autosave.resume() → setEditable(true)

packages/api routes/chapters.ts (chain, cùng sub-app phase 4)
  → validate('param', revisionParamSchema) [+ validate('json', restoreRevisionSchema)] → core → coreError
packages/core/src/revisions/
  listRevisions(db, actor, publicId, number)       → loadOwnedChapter → select created_at, word_count
  getRevisionPreview(db, actor, publicId, number, key) → loadOwnedChapter → findRevision → renderChapterHtml
  restoreRevision(db, actor, publicId, number, key, baseUpdatedAt) → loadOwnedChapter → findRevision → saveDraft
```

```ts
// packages/shared/src/schemas/revision.ts
export const revisionKeySchema = z.string().regex(/^\d{1,15}$/);
export const revisionParamSchema;      // chapterNumberParamSchema (phase 4) + { key: revisionKeySchema }
export const restoreRevisionSchema;    // { baseUpdatedAt } — dùng lại đúng field của draftSaveSchema (phase 4)

// packages/core/src/revisions/revisions.ts
type Owned = 'NOT_FOUND' | 'FORBIDDEN';
export interface RevisionSummary { key: string; createdAt: string; wordCount: number; isPublished: boolean }
export interface RevisionPreview { key: string; createdAt: string; wordCount: number; html: string }
export function revisionKey(createdAt: Date): string;   // String(createdAt.getTime())
export function listRevisions(db: Db, actor: StoryActor, publicId: string, number: number):
  Promise<Result<RevisionSummary[], Owned>>;
export function getRevisionPreview(db: Db, actor: StoryActor, publicId: string, number: number, key: string):
  Promise<Result<RevisionPreview, Owned>>;              // key không có → 'NOT_FOUND'
export function restoreRevision(db: Db, actor: StoryActor, publicId: string, number: number,
  key: string, baseUpdatedAt: string):
  Promise<Result<{ doc: EditorDocJson; updatedAt: string }, Owned | 'DRAFT_CONFLICT' | 'INVALID_DOCUMENT'>>;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/revision.ts` (+ `.test.ts`), `index.ts` | create/modify | |
| `packages/core/src/revisions/revisions.ts` | create | list/preview/restore + `findRevision` nội bộ |
| `packages/core/src/revisions/revisions.test.ts` | create | `revisionKey`, chọn `isPublished` |
| `packages/core/src/revisions/revisions.int.test.ts` | create | Postgres thật: khoảng mili giây, giữ pid, 409, quyền |
| `packages/core/src/index.ts` | modify | export |
| `packages/api/src/routes/chapters.ts` | modify | 3 route chain dưới `/:number/revisions` |
| `packages/api/src/routes/revisions.int.test.ts` | create | DB thật, `makeTestApiDeps` (phase 2) |
| `apps/web/src/components/editor/revision-history-sheet.tsx` | create | Sheet, danh sách, xem trước, dialog xác nhận |
| `apps/web/src/lib/chapters.ts` | modify | query/mutation revision qua `hc` |
| `apps/web/src/routes/viet/truyen/$publicId/chuong/$number.tsx` | modify | nút "Lịch sử", truyền `editor` + `autosave` vào sheet |
| `packages/shared/messages/vi.json` | modify | `revision_*` |
| `apps/web/e2e/revision.spec.ts` | create | luồng khôi phục |
| `apps/web/e2e/helpers/stories.ts` (phase 4) | modify | `publishChapterViaApi(page, publicId, number, text)`: PUT draft rồi POST publish (endpoint phase 5) |

## Implementation Steps

1. **Shared:** `revisionKeySchema`, `revisionParamSchema`, `restoreRevisionSchema` (dùng lại field `baseUpdatedAt` của `draftSaveSchema`). Unit test key hợp lệ/không hợp lệ.
2. **Core `findRevision(db, chapterId, key)`** (không export ra API): `t = new Date(Number(key))`; `where chapter_id = $ and created_at >= t and created_at < t + 1ms order by created_at desc, id desc limit 1`.
3. **Core `listRevisions`:** `loadOwnedChapter` → select `createdAt, wordCount` `orderBy(desc(createdAt), desc(id))`, `limit(LIMITS.revisionsKept)`; `isPublished = index === 0 && chapter.status === 'published'`.
4. **Core `getRevisionPreview`:** `loadOwnedChapter` → `findRevision` → `renderChapterHtml(revision.docJson)`.
5. **Core `restoreRevision`:** `loadOwnedChapter` → `findRevision` (null → `NOT_FOUND`) → `saveDraft(db, actor, publicId, number, { doc, baseUpdatedAt })` → trả `{ doc, updatedAt }`. Draft row luôn có (phase 4 `createChapter` và seed đều tạo).
6. **API** trong sub-app `chapters` (phase 4): `.get('/:number/revisions')`, `.get('/:number/revisions/:key')`, `.post('/:number/revisions/:key/restore')`, cùng middleware phase 4 (`requireAuth`, `requireVerifiedEmail`), `validate(...)`, lỗi qua `coreError` (bảng đã có `NOT_FOUND`, `FORBIDDEN`, `DRAFT_CONFLICT`, `INVALID_DOCUMENT`). Kiểm `hc` suy ra type (`expectTypeOf`).
7. **UI `RevisionHistorySheet`:** danh sách (ngày giờ `vi-VN`, số chữ, nhãn "Đang đăng"); chọn → preview trong vùng Literata (`dangerouslySetInnerHTML` với HTML đã sanitize từ server); "Khôi phục" → `Dialog` xác nhận ("Nội dung bản nháp hiện tại sẽ bị thay bằng bản này") → luồng pause/resume; thành công: cập nhật mirror, đóng sheet, thông báo inline; 409 → banner xung đột; lỗi khác → `resume()`, mở lại editor, báo lỗi.
8. **i18n:** `revision_history`, `revision_empty`, `revision_published_badge`, `revision_words`, `revision_restore`, `revision_restore_confirm_title`, `revision_restore_confirm_body`, `revision_restored`, `revision_save_first`; `pnpm i18n:compile`.
9. **E2E** (ma trận). Dữ liệu: `signUpVerified` + truyện (helper phase 2/4) + chương, `publishChapterViaApi` hai lần với nội dung khác.
10. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Khôi phục từ revision cũ." (checkbox 5 Giai đoạn 1) trong spec.

## Function / Interface Checklist

- [ ] `revisionKeySchema`, `revisionParamSchema`, `restoreRevisionSchema`
- [ ] `revisionKey(createdAt)`, `findRevision` (nội bộ)
- [ ] `listRevisions`, `getRevisionPreview`, `restoreRevision` (trả `Result`)
- [ ] 3 route trong `createChapterRoutes(deps)` (chain)
- [ ] `RevisionHistorySheet` dùng `autosave.pause/rebase/resume`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Đăng 3 lần → list trả 3 bản, mới nhất trước, bản đầu `isPublished` | int core |
| Critical | `created_at` có micro giây → tra bằng key mili giây ra đúng dòng | int core |
| Critical | Restore ghi doc revision vào draft, `pid` giữ từng đoạn; `chapter_contents` không đổi | int core |
| Critical | Restore với `baseUpdatedAt` cũ → `DRAFT_CONFLICT`, draft không đổi | int core |
| High | User khác → `FORBIDDEN` ở cả 3 hàm; chương xoá mềm → `NOT_FOUND`; key không có → `NOT_FOUND` | int core |
| High | Key sai dạng → 400 `VALIDATION_ERROR`; 401/403 đúng dạng; 409 `DRAFT_CONFLICT` | int api |
| High | Response không chứa key `id` hay chuỗi dạng UUID (quét đệ quy) | int api |
| Medium | 25 revision (chèn tay) → list tối đa 20 | int core |
| Critical | Editor → Lịch sử → xem bản cũ → khôi phục → editor hiện nội dung cũ → reload vẫn là nội dung cũ; chương vẫn "Đã đăng" và hiện badge "Có thay đổi chưa đăng" (bản công khai không đổi; trang đọc có từ phase 7) | e2e |
| High | Gõ rồi bấm khôi phục ngay (autosave chưa gửi): phần gõ được lưu trước, khôi phục không 409 giả, editor `contenteditable="false"` trong lúc chờ | e2e (`page.route` giữ response) |

## Dependency Map

- Cần: phase 4 (`loadOwnedChapter`, `saveDraft`, `DRAFT_CONFLICT`, `createAutosave().pause/resume/rebase`, route editor, mirror), phase 5 (revision ghi lúc đăng, `renderChapterHtml`, `LIMITS.revisionsKept`, endpoint publish cho helper e2e), phase 2 (`Result`, `validate`, `coreError`, `makeTestApiDeps`).
- Phase sau: không phase nào phụ thuộc trực tiếp. Phase 15 (mod) không cần revision.

## Success Criteria

- [ ] Panel lịch sử hiện đúng các bản đã đăng, xem trước được
- [ ] Khôi phục chỉ đổi draft qua `saveDraft`, giữ `pid`, chống ghi đè bằng 409 `DRAFT_CONFLICT`
- [ ] Không mất phím gõ khi khôi phục (pause/resume)
- [ ] Không có UUID ở API/URL/DOM
- [ ] Gate 5 lệnh xanh; checkbox 5 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Khôi phục đè mất nháp chưa đăng | Trung bình × Trung bình | Dialog xác nhận nói rõ; mirror localStorage phase 4; câu hỏi mở 1 |
| Autosave đang bay khi khôi phục → 409 giả hoặc ghi đè ngược | Trung bình × Trung bình | `pause()` chờ flush; editor read-only; `rebase` sau `setContent` |
| Key mili giây khớp nhiều dòng | Rất thấp × Thấp | Lấy dòng mới nhất; phase 5 khoá chương khi đăng |
| Render kéo dependency nặng vào api | Thấp × Thấp | Walker thuần TS ở core, không React |

Rollback: chỉ thêm route, module core, component; gỡ 3 route + nút toolbar là về trạng thái phase 5, không có migration.

## Security Considerations

- Mọi route (kể cả xem trước) qua `loadOwnedChapter` → `canEditChapter`: revision có thể chứa nội dung đã gỡ.
- HTML xem trước luôn sinh ở server qua walker + sanitize allowlist; client không gửi HTML.
- Route ghi (`restore`) đi qua CSRF của `/api/v1` (JSON + kiểm origin).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Khôi phục **không** tự chụp nháp hiện tại thành revision; dùng hộp xác nhận + mirror localStorage.

## Next Steps

Phase 7: trang đọc chương (`canReadChapter`, route, cache header, render HTML, điều hướng, màn 18+).
