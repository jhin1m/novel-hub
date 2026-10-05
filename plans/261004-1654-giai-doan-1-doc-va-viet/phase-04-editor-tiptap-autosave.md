---
phase: 4
title: "Phase 4: Editor Tiptap và autosave"
status: pending
priority: P1
effort: "2.5d"
dependencies: [3]
---

# Phase 4: Editor Tiptap và autosave

Spec checkbox: `Editor Tiptap: autosave vào chapter_drafts (debounce ~2 giây), trạng thái đã lưu, chế độ tập trung.`

## Context Links

- Spec mục 4 (`chapters`, `chapter_drafts`; `number` tăng dần, không dùng lại kể cả khi xoá mềm), mục 8 "Khu viết" (nền trơn, trạng thái lưu nhỏ ở góc, chế độ tập trung che mọi thứ trừ chữ)
- `plan.md`: Editor (Tiptap 3 ghim cùng version, `@novel-hub/shared/editor`, route `ssr: false`), Đếm chữ, Autosave; câu hỏi mở #4 (heading, gạch ngang)
- `plans/reports/researcher-261004-2352-editor-content-pipeline-report.md` mục 1, 3, 5, 7
- Phase 2: `loadOwnedStory`, `Result`, `validate`, `coreError`, `LIMITS`, `WriterGate`, trang `/write/stories/$publicId/index.tsx`
- Code: `packages/db/src/schema/chapters.ts` (`chapter_drafts.updated_at` dùng `updatedAt()` → `defaultNow()` micro giây khi insert), `packages/db/src/seed/seed.ts` (`countWords` riêng, pid `p1…`)

## Overview

- `packages/shared`: `countWords` (`src/text.ts`), `generatePid`/`isValidPid`, `docToText`, kiểu JSON của doc (entry chính, không kéo Tiptap); subpath `@novel-hub/shared/editor`: `editorExtensions`, `editorSchema`, `parseEditorDoc`.
- `packages/core`: `chapters` (tạo chương, đọc/lưu nháp có chống ghi đè, sửa metadata, danh sách cho tác giả), `policies` `canEditChapter`.
- `packages/api`: sub-app `chapters` dưới `/api/v1/stories/:publicId/chapters`; `GET /api/v1/me/stories/:publicId/chapters`.
- `apps/web`: route editor `ssr: false`, autosave, trạng thái lưu, chế độ tập trung, mirror localStorage, đếm chữ trực tiếp; danh sách chương ở trang sửa truyện.

## Key Insights

- `@tiptap/core` là peer của `extension-unique-id`, `react` (đã kiểm npm 3.31.4) → phải cài tường minh, cùng version 3.31.4 (thuộc họ Tiptap mục 2; `plan.md` đã ghi vào "Dependency mới", đã duyệt ở validate).
- UniqueID với `attributeName: 'pid'` render `data-pid` và parse lại từ `data-pid` (đã đọc source 3.31.4) → JSON `attrs.pid` khớp seed và HTML trang đọc. Cùng một `editorExtensions` cho editor (client) và kiểm schema (server); phase 5 render HTML bằng walker tự viết, không dùng static-renderer. <!-- Red Team: bỏ static-renderer -->
- Kiểm schema ngay khi lưu nháp (`Node.fromJSON(editorSchema, doc).check()`), không đợi lúc đăng: draft rác không bao giờ vào DB, phase 5 và 6 tin được dữ liệu draft.
- **Bẫy độ chính xác thời gian:** `timestamptz` lưu micro giây, JS chỉ có mili giây, và `defaultNow()` khi insert sinh micro giây. Mọi chỗ đọc "phiên bản nháp" select `date_trunc('milliseconds', updated_at)`; `UPDATE … WHERE date_trunc('milliseconds', updated_at) = $base`; app tự đặt `updated_at = new Date()` khi ghi. Có int test riêng cho nháp do seed tạo.
- UniqueID có thể gán id lúc nạp doc → sinh `update` giả → autosave thừa. Chặn bằng so sánh chuỗi JSON với bản đã lưu lần cuối tại thời điểm flush (2 giây/lần, rẻ), không lưu khi giống.
- `fetch(..., { keepalive: true })` và `sendBeacon` giới hạn ~64 KB → chương dài có thể mất khi đóng tab; mirror doc vào localStorage là lớp bảo vệ chính, request keepalive chỉ là cố gắng thêm.
- Bộ điều khiển autosave viết thuần TS (không phụ thuộc React/Tiptap), nhận `save`, `now`, timer qua tham số → unit test bằng fake timers trong môi trường node.
- Trang đọc không được import `@tiptap/*`. **Không** thêm block `no-restricted-imports` thứ hai cho `apps/web/src/**`: flat config ghi đè cả options của rule, block mới sẽ xoá chặn `core`/`db` hiện có (`eslint.config.js:47-89`). Cách làm: tách `paths`/`patterns` hiện có thành hằng `BROWSER_IMPORT_PATHS`, `BROWSER_IMPORT_PATTERNS` trong `eslint.config.js`; block hiện có dùng `patterns: [...BROWSER_IMPORT_PATTERNS, tiptapGroup]` (`@tiptap/*`, `@novel-hub/shared/editor`) và thêm khu editor vào `ignores`; một block ngay sau cho riêng khu editor dùng lại đúng hai hằng (không có `tiptapGroup`). Khu editor vẫn bị chặn `core`/`db`. <!-- Red Team: block mới ghi đè options → mất chặn core/db -->
- Bộ điều khiển autosave có `pause()`/`resume()` cho phase 5 (đăng) và phase 6 (khôi phục): `pause()` chờ request đang bay và flush phần chưa lưu rồi ngừng hẹn giờ; trong lúc dừng `change()` chỉ đánh dấu bẩn; `resume()` hẹn lại nếu còn bẩn. Nơi gọi đặt `editor.setEditable(false)` trong lúc dừng. <!-- Red Team: race gõ phím khi đăng/khôi phục -->
- Route editor không dùng `SiteLayout` (có thanh trên riêng) để chế độ tập trung che được mọi thứ.

## Requirements

**Functional**

- Editor (câu hỏi mở #4 đã chốt: giữ heading h2/h3 và hr): <!-- Updated: Validation Session 1 - heading + hr -->
  - giữ paragraph, bold, italic, strike, blockquote, horizontalRule (ngắt cảnh), hardBreak, heading `levels: [2, 3]`, undoRedo, dropcursor, gapcursor;
  - tắt code, codeBlock, link, underline, bulletList, orderedList, listItem, listKeymap, trailingNode;
  - UniqueID: `types: ['paragraph', 'heading']`, `attributeName: 'pid'`, `generateID: generatePid`.
- `POST /api/v1/stories/:publicId/chapters` → 201 `{ chapter }`: `number = max(number) + 1` tính cả chương xoá mềm, `status = draft`; tạo luôn `chapter_drafts` với doc một đoạn rỗng có pid.
- `GET .../chapters/:number/draft` → `{ chapter, doc, updatedAt }` (`updatedAt` ISO, mili giây).
- `PUT .../chapters/:number/draft` body `{ doc, baseUpdatedAt }`:
  - thành công → 200 `{ updatedAt }`;
  - phiên bản lệch → 409 `DRAFT_CONFLICT`;
  - doc sai schema → 422 `INVALID_DOCUMENT`;
  - body > `LIMITS.draftMaxBytes` (2 MB) → 413 `DRAFT_TOO_LARGE`.
- `PATCH .../chapters/:number` body `{ title?, authorNote? }` (null = xoá; ≤ 150 / ≤ 1.000 ký tự) → `{ chapter }`.
- `GET /api/v1/me/stories/:publicId/chapters` → `{ chapters: AuthorChapterView[] }` không gồm chương xoá mềm, sắp theo `number`.
- Mọi route chương: đăng nhập + email đã xác thực + `canEditChapter`; chương xoá mềm/không tồn tại → 404.
- Web `/write/stories/$publicId/chapters/$number` (`ssr: false`, `noindex`):
  - thanh trên: quay lại trang truyện, ô tên chương, trạng thái lưu, số chữ, nút chế độ tập trung; thanh công cụ định dạng; vùng soạn thảo font serif, cột ~70ch; ô "Lời nhắn tác giả" dưới editor;
  - tên chương và lời nhắn lưu khi blur (PATCH), lỗi hiện tại chỗ.
- Trạng thái lưu: `Đã lưu lúc HH:mm` / `Chưa lưu` / `Đang lưu…` / `Lỗi, thử lại sau Ns` (backoff 2→4→8→16→30 giây) / `Xung đột` (banner: "Chương đang được sửa ở nơi khác" + "Tải bản mới nhất" + "Giữ bản của tôi").
- Autosave: debounce 2 giây, `maxWait` 10 giây, tối đa một request đang bay; có sửa trong lúc bay thì lưu thêm một lần sau khi xong; lỗi 4xx khác 409 không thử lại.
- Rời trang: `beforeunload` cảnh báo khi còn thay đổi chưa lưu; `pagehide`/`visibilitychange` (hidden) flush bằng `keepalive` nếu body < 60 KB.
- Mirror localStorage key `draft:{publicId}:{number}` = `{ doc, baseUpdatedAt, savedAt }`, ghi (throttle 1 giây) mỗi khi có sửa, xoá khi server xác nhận đúng nội dung đó. Mở editor mà mirror khác doc server → banner "Có bản chưa lưu trên máy này (HH:mm)": "Khôi phục" / "Bỏ".
- Đếm chữ trực tiếp (debounce 500 ms) bằng `countWords(docToText(doc))`.
- Chế độ tập trung: ẩn thanh trên, thanh công cụ, ô lời nhắn; chỉ còn chữ và trạng thái lưu mờ ở góc; `Esc` hoặc nút nhỏ để thoát; nhớ lựa chọn ở localStorage `editor:focus`.
- Trang sửa truyện: danh sách chương (số, tên, badge trạng thái, cập nhật lúc), nút "Thêm chương" → tạo rồi mở editor.

**Non-functional**

- Đếm chữ: token tách bởi `[\s—–…]+`, có ít nhất một chữ cái/số (`\p{L}\p{N}`), sau `normalize('NFC')`. Định nghĩa đóng băng; seed chuyển sang hàm này.
- Không lộ `chapter.id`/`story.id` ra API, URL, key localStorage.
- Gõ mượt với chương 20.000 chữ (kiểm thủ công).

## Architecture

```
Editor (useEditor, immediatelyRender:false) ─update→ AutosaveController.change(getDoc)
   └─ flush: json = JSON.stringify(doc); json === lastSaved → bỏ qua
             PUT /draft { doc, baseUpdatedAt } ─▶ core.saveDraft
                 UPDATE chapter_drafts SET doc_json, updated_at=$now
                 WHERE chapter_id=$id AND date_trunc('milliseconds', updated_at)=$base
                 0 dòng → DRAFT_CONFLICT · doc sai → INVALID_DOCUMENT (parseEditorDoc)
             200 → baseUpdatedAt = updatedAt; clearMirror nếu json khớp
   └─ change → writeMirror (throttle 1s)
POST /chapters ─▶ core.createChapter: tx { loadOwnedStory(forUpdate) → max(number)+1 → insert chapter → insert draft(updatedAt=new Date()) }
```

```ts
// packages/shared/src/text.ts
export function countWords(text: string): number;
// packages/shared/src/editor/pid.ts (export ở cả entry chính và /editor)
export const PID_PATTERN: RegExp;               // /^[a-z2-9]{8}$/
export function generatePid(): string;          // crypto.getRandomValues, rejection sampling như public-id
export function isValidPid(v: unknown): v is string;
// packages/shared/src/editor/doc-json.ts
export interface EditorMarkJson { type: string; attrs?: Record<string, unknown> }
export interface EditorNodeJson { type: string; attrs?: Record<string, unknown>; content?: EditorNodeJson[]; text?: string; marks?: EditorMarkJson[] }
export interface EditorDocJson extends EditorNodeJson { type: 'doc' }
export function docToText(doc: EditorNodeJson): string; // block nối '\n', hardBreak → '\n'
// packages/shared/src/editor/index.ts  →  "@novel-hub/shared/editor"
export const editorExtensions: Extensions;
export const editorSchema: Schema;              // getSchema(editorExtensions)
export function parseEditorDoc(json: unknown): { ok: true; node: ProseMirrorNode } | { ok: false };
export function emptyDraftDoc(): EditorDocJson; // một paragraph rỗng có pid
// packages/shared/src/schemas/chapter.ts
export const chapterNumberParamSchema;          // { publicId, number: coerce int > 0 }
export const draftSaveSchema;                   // { doc: { type: 'doc', content?: unknown[] }, baseUpdatedAt: z.iso.datetime() }
export const chapterMetaSchema;                 // { title?: string|null ≤150, authorNote?: string|null ≤1000 }, ít nhất 1 field
// LIMITS thêm: draftMaxBytes: 2_000_000

// packages/core/src/chapters/*
export interface AuthorChapterView {
  number: number; title: string | null; authorNote: string | null; status: ChapterStatus;
  wordCount: number; publishedAt: string | null; scheduledAt: string | null;
  draftUpdatedAt: string; updatedAt: string;
}
type Owned = 'NOT_FOUND' | 'FORBIDDEN';
export function loadOwnedChapter(db: Db | Tx, actor: StoryActor, publicId: string, number: number,
  opts?: { forUpdate?: boolean }): Promise<Result<{ story: StoryRow; chapter: ChapterRow }, Owned>>; // phase 5/6 dùng lại
export function createChapter(db: Db, actor: StoryActor, publicId: string): Promise<Result<AuthorChapterView, Owned>>;
export function getDraft(db: Db, actor: StoryActor, publicId: string, number: number):
  Promise<Result<{ chapter: AuthorChapterView; doc: EditorDocJson; updatedAt: string }, Owned>>;
export function saveDraft(db: Db, actor: StoryActor, publicId: string, number: number,
  input: { doc: unknown; baseUpdatedAt: string }): Promise<Result<{ updatedAt: string }, Owned | 'INVALID_DOCUMENT' | 'DRAFT_CONFLICT'>>;
export function updateChapterMeta(db: Db, actor: StoryActor, publicId: string, number: number,
  input: ChapterMetaInput): Promise<Result<AuthorChapterView, Owned>>;
export function listAuthorChapters(db: Db, actor: StoryActor, publicId: string): Promise<Result<AuthorChapterView[], Owned>>;
// packages/core/src/policies/story.ts
export function canEditChapter(user: StoryActor, story: { authorId: string }): boolean; // = canEditStory

// apps/web/src/lib/autosave.ts
export type SaveStatus = { kind: 'saved'; at: Date } | { kind: 'dirty' } | { kind: 'saving' }
  | { kind: 'error'; retryInMs: number | null } | { kind: 'conflict' };
export interface AutosaveOptions {
  save: (doc: EditorDocJson, baseUpdatedAt: string, opts: { keepalive: boolean }) => Promise<SaveOutcome>;
  initialBase: string; debounceMs?: number; maxWaitMs?: number;
  onStatus: (s: SaveStatus) => void; timers?: TimerPort; now?: () => Date;
}
export type SaveOutcome = { ok: true; updatedAt: string } | { ok: false; kind: 'conflict' | 'fatal' | 'retryable' };
export function createAutosave(opts: AutosaveOptions): {
  change(getDoc: () => EditorDocJson): void; flush(opts?: { keepalive?: boolean }): Promise<void>;
  pause(): Promise<SaveStatus>;   // flush rồi dừng; trả trạng thái sau flush ('saved' mới được đăng/khôi phục)
  resume(): void;                 // hẹn lưu lại nếu còn thay đổi
  rebase(updatedAt: string, savedJson: string): void; dispose(): void;
}; // phase 5/6: setEditable(false) → pause() → API → setContent → rebase() → resume() → setEditable(true)
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/package.json` | modify | export `./editor`; dep `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-unique-id` = 3.31.4 (đã duyệt) |
| `packages/shared/src/text.ts` (+ test) | create | `countWords` |
| `packages/shared/src/editor/{pid,doc-json,extensions,index}.ts` (+ `pid.test.ts`, `doc-json.test.ts`, `extensions.test.ts`) | create | |
| `packages/shared/src/schemas/chapter.ts` (+ test), `limits.ts`, `index.ts` | create/modify | |
| `packages/db/src/seed/seed.ts`, `seed.int.test.ts` | modify | `countWords` và `generatePid` từ shared; pid hợp lệ |
| `packages/core/src/chapters/{load-owned-chapter,create-chapter,drafts,chapter-meta,list-chapters,chapter-view}.ts` | create | |
| `packages/core/src/chapters/chapters.int.test.ts` | create | |
| `packages/core/src/policies/story.ts` (+ test), `index.ts` | modify | `canEditChapter` |
| `packages/api/src/routes/chapters.ts` | create | chain; `bodyLimit` 2 MB cho `PUT draft` |
| `packages/api/src/routes/{me,stories}.ts`, `lib/core-errors.ts` | modify | mount chapters dưới `/:publicId/chapters`; mã lỗi mới |
| `packages/api/src/routes/chapters.int.test.ts` | create | |
| `apps/web/package.json` | modify | `@tiptap/react`, `@tiptap/core`, `@tiptap/pm` = 3.31.4 |
| `apps/web/src/lib/{autosave,draft-mirror,chapters}.ts` (+ `autosave.test.ts`, `draft-mirror.test.ts`) | create | |
| `apps/web/src/components/editor/{chapter-editor,editor-toolbar,save-status,focus-toggle,draft-restore-banner,conflict-banner}.tsx` | create | |
| `apps/web/src/components/chapter-list.tsx` | create | |
| `apps/web/src/routes/write/stories/$publicId/chapters/$number.tsx` | create | `ssr: false` |
| `apps/web/src/routes/write/stories/$publicId/index.tsx` | modify | danh sách chương + "Thêm chương" |
| `eslint.config.js` | modify | gộp nhóm `@tiptap/*`, `@novel-hub/shared/editor` vào `patterns` của block hiện có (hằng dùng chung), khu editor vào `ignores` + block riêng dùng lại hằng |
| `apps/web/src/lint-boundaries.test.ts` | create | ESLint API `lintText`: `routes/index.tsx` import `@novel-hub/core` và `@tiptap/react` → lỗi; file editor import `@tiptap/react` → không lỗi, import `@novel-hub/core` → lỗi |
| `packages/shared/messages/vi.json` | modify | `editor_*`, `chapter_*` |
| `apps/web/e2e/editor.spec.ts`, `e2e/helpers/stories.ts` | create | helper tạo truyện qua API bằng `page.request` |

## Implementation Steps

1. Spike (≤ 1 giờ): trong một unit test ở `packages/shared`, import `editorExtensions`, gọi `getSchema`, `Node.fromJSON(...).check()` với doc mẫu chạy trên Node không DOM. Lỗi `document is not defined` → tách `editorExtensions` thành `schemaExtensions` (dùng ở server) + phần chỉ-client, ghi lại.
2. Shared: `countWords`, `generatePid`, `docToText`, kiểu JSON, `editorExtensions` (theo câu trả lời #4), `editorSchema`, `parseEditorDoc`, `emptyDraftDoc`, schema chương, `LIMITS.draftMaxBytes`. Unit test đủ bảng Test.
3. Seed: dùng `countWords`, `generatePid` từ shared; `seed.int.test.ts` kiểm mọi pid khớp `PID_PATTERN`. Ghi chú: DB dev cũ còn pid `p1` → `pnpm db:seed --reset`.
4. Core:
   - `loadOwnedChapter` (dựa trên `loadOwnedStory`, lọc `deleted_at IS NULL`);
   - `createChapter` trong transaction, khoá story `FOR UPDATE`; lỗi unique `chapters_story_id_number_key` vẫn xảy ra thì thử lại 1 lần;
   - `getDraft` select `date_trunc('milliseconds', updated_at)`;
   - `saveDraft`: `parseEditorDoc` trước, rồi `UPDATE` có điều kiện; 0 dòng → `DRAFT_CONFLICT`;
   - `updateChapterMeta` (chuỗi `trim().normalize('NFC')`, rỗng → null), `listAuthorChapters`.
5. API `chapters.ts`: `validate('param', chapterNumberParamSchema)`, `validate('json', …)`, `bodyLimit` cho draft (413 `DRAFT_TOO_LARGE` dạng chuẩn); thêm `GET /me/stories/:publicId/chapters`. Bảng mã lỗi: `DRAFT_CONFLICT` 409, `INVALID_DOCUMENT` 422, `DRAFT_TOO_LARGE` 413.
6. Web `lib/autosave.ts` theo interface (máy trạng thái thuần), `lib/draft-mirror.ts` (bắt lỗi quota/JSON hỏng, trả null), `lib/chapters.ts` (hook query/mutation qua `hc`).
7. Components editor:
   - `useEditor({ extensions: editorExtensions, immediatelyRender: false, content })`, `useEditorState` cho nút toolbar;
   - nạp doc xong mới gắn listener `update`;
   - so mirror với doc server để hiện banner khôi phục;
   - conflict: "Tải bản mới nhất" = GET draft + `setContent(..., { emitUpdate: false })`; "Giữ bản của tôi" = GET lấy `updatedAt` mới rồi `rebase` và flush.
8. Route editor + chế độ tập trung + `beforeunload`/`pagehide`. Trang sửa truyện thêm `ChapterList` và nút "Thêm chương".
9. ESLint theo Key Insights (hằng dùng chung, không block ghi đè mất `core`/`db`). Viết `lint-boundaries.test.ts` dùng `new ESLint({ cwd: repoRoot })` + `lintText(code, { filePath })` với đường dẫn file có thật; test chạy quá 15 giây thì chuyển sang bước thủ công tương đương (thêm tạm import vào `routes/index.tsx` và một file editor, chạy `pnpm lint`) và ghi lại. <!-- Red Team: kiểm core vẫn bị chặn -->
10. `vi.json` + `pnpm i18n:compile`. E2E (bảng Test).
11. Thủ công: dán ~20.000 chữ, gõ thử độ trễ; tắt mạng (DevTools offline) → trạng thái lỗi + backoff, bật lại → tự lưu; đóng tab khi chưa lưu → mở lại có banner khôi phục; dán nội dung từ Google Docs/Word → chỉ còn định dạng cho phép.
12. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox 3 của Giai đoạn 1 trong spec.

## Function / Interface Checklist

- [ ] `countWords`, `docToText`, `generatePid`, `isValidPid`, `PID_PATTERN`, `EditorDocJson`
- [ ] `editorExtensions`, `editorSchema`, `parseEditorDoc`, `emptyDraftDoc`
- [ ] `draftSaveSchema`, `chapterMetaSchema`, `chapterNumberParamSchema`, `LIMITS.draftMaxBytes`
- [ ] `loadOwnedChapter`, `createChapter`, `getDraft`, `saveDraft`, `updateChapterMeta`, `listAuthorChapters`, `canEditChapter`
- [ ] `createChapterRoutes(deps)`
- [ ] `createAutosave` (`flush`, `pause`, `resume`, `rebase`), `readMirror`/`writeMirror`/`clearMirror`, `ChapterEditor`, `SaveStatus`, `ChapterList`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | `countWords`: "Xin chào thế giới" = 4; "anh—em" = 2; "đợi…rồi" = 2; "— … !!!" = 0; chuỗi NFD = NFC; "123 456" = 2; "e-mail" = 1 | unit |
| High | `docToText`: đoạn nối `\n`, `hardBreak` → `\n`, bỏ qua node không có text | unit |
| High | `generatePid` 1.000 lần đều khớp `PID_PATTERN` | unit |
| Critical | `parseEditorDoc`: doc hợp lệ ok; mark `link`/node `image`/`bulletList` → không ok; JSON không phải doc → không ok | unit |
| Critical | Số chương 1, 2; xoá mềm chương 2 (SQL) → chương mới = 3 | int core |
| Critical | 5 `createChapter` song song → số 1..5 không trùng | int core |
| Critical | `saveDraft` đúng base → `updatedAt` mới; base cũ → `DRAFT_CONFLICT` | int core |
| Critical | Nháp insert bằng `defaultNow()` (micro giây) → `getDraft` rồi `saveDraft` với `updatedAt` vừa đọc → thành công | int core |
| High | User khác → `FORBIDDEN`; chương xoá mềm → `NOT_FOUND`; doc sai → `INVALID_DOCUMENT` | int core |
| High | API: 401/403/404, 413 khi body > 2 MB, 409/422 đúng dạng; response không có `id` | int api |
| Critical | Autosave: 3 lần sửa trong 2 giây → 1 lần lưu; sửa liên tục 12 giây → lưu ở giây 10 (`maxWait`); sửa khi đang lưu → lưu tiếp một lần; JSON không đổi → không gọi `save` | unit (fake timers) |
| High | Autosave: `retryable` → backoff 2/4/8/16/30 giây; `conflict` → dừng, trạng thái `conflict`; `fatal` → dừng | unit |
| Critical | `pause()` khi có sửa chưa lưu → gọi `save` một lần rồi trả `saved`; sửa trong lúc dừng không gọi `save`; `resume()` → lưu sau debounce; `pause()` khi `save` lỗi → trả `error` | unit (fake timers) |
| Critical | ESLint: `@novel-hub/core` vẫn bị chặn ở `routes/index.tsx` và ở khu editor; `@tiptap/*` bị chặn ngoài khu editor | unit `lint-boundaries.test.ts` |
| Medium | Mirror: JSON hỏng/quota → trả null, không throw | unit |
| Critical | Tạo truyện (helper API) → "Thêm chương" → gõ → thấy "Đã lưu" → reload → nội dung còn | e2e |
| High | Hai tab cùng chương: tab A lưu, tab B gõ → B hiện banner xung đột | e2e |
| High | Chế độ tập trung ẩn thanh công cụ; `Esc` thoát | e2e |
| Medium | 20.000 chữ, offline/online, đóng tab khi chưa lưu, dán từ Docs/Word | thủ công |

## Dependency Map

- Cần: phase 2 (`loadOwnedStory`, `Result`, `validate`, `coreError`, `WriterGate`, trang sửa truyện), phase 1 (component ui, font serif).
- Phase 5 dùng: `editorExtensions`, `editorSchema`, `parseEditorDoc`, `countWords`, `docToText`, `isValidPid`/`generatePid`, `EditorDocJson`, `loadOwnedChapter`, `saveDraft` (cùng điều kiện `date_trunc` để publish khoá draft), `createAutosave().flush/pause/resume/rebase`, `ChapterList`, dialog trong editor.
- Phase 6 dùng: `loadOwnedChapter`, `saveDraft` (khôi phục gọi thẳng, cùng 409 `DRAFT_CONFLICT`), `createAutosave().pause/resume/rebase`, `EditorDocJson`.
- Phase 14 dùng: `docToText`/`countWords` (chuẩn hoá cho dedupe).
- Phase 13 gắn rate limit `createChapter` vào `POST /chapters`.

## Success Criteria

- [ ] Viết chương có autosave ~2 giây, trạng thái lưu đúng 5 trạng thái, không mất chữ khi đóng tab (mirror)
- [ ] Chống ghi đè giữa tab hoạt động; không xung đột giả với nháp có `updated_at` micro giây
- [ ] Số chương không bao giờ dùng lại, kể cả khi tạo song song
- [ ] Trang ngoài khu editor không import Tiptap; `core`/`db` vẫn bị chặn ở mọi file web phía browser, kể cả khu editor (test ESLint)
- [ ] Gate 5 lệnh xanh; checkbox 3 Giai đoạn 1 = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Tiptap import lỗi trên Node | Thấp × Cao | Spike step 1; tách phần schema |
| UniqueID gây autosave thừa hoặc vòng lặp update | Trung bình × Trung bình | So chuỗi JSON lúc flush; gắn listener sau khi nạp |
| Xung đột giả do độ chính xác thời gian | Cao nếu bỏ qua × Cao | `date_trunc` khi đọc và so; int test với nháp seed |
| Mất chữ khi đóng tab với chương lớn | Trung bình × Cao | Mirror localStorage + banner khôi phục |
| `JSON.stringify` doc lớn gây giật | Thấp × Thấp | Chỉ chạy lúc flush (2 giây/lần) và mirror (throttle 1 giây) |
| Peer `react` của Tiptap lệch version | Thấp × Trung bình | Ghim 3.31.4 chính xác cho mọi `@tiptap/*` |

Rollback: không có migration. Revert commit; nháp đã lưu vẫn hợp lệ với schema (chỉ dữ liệu, không đổi cấu trúc).

## Security Considerations

- Doc từ client luôn qua `parseEditorDoc` trước khi lưu; không nhận HTML từ client.
- Giới hạn body 2 MB; chỉ chủ truyện (email đã xác thực) ghi được nháp.
- localStorage chỉ chứa nội dung của chính người dùng trên máy họ; key không chứa ID nội bộ. Ghi chú: máy dùng chung có thể lộ nháp, chấp nhận (giống mọi editor web).
- Title/authorNote là plain text, lưu nguyên văn, hiển thị qua React (escape).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Giữ heading h2/h3 và horizontalRule; allowlist sanitize phase 5 đi theo.
2. `@tiptap/core` 3.31.4: đã duyệt.
3. Không chặn "Thêm chương" khi chương cuối còn nháp rỗng.

## Next Steps

Phase 5: đăng chương và hẹn giờ, dùng `parseEditorDoc`, `countWords`, `loadOwnedChapter`, `saveDraft` và `pause()`/`rebase()`/`resume()` của autosave.
