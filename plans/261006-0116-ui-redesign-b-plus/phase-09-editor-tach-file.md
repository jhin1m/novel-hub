---
phase: 9
title: "Editor chương: tách file"
status: pending
priority: P1
effort: "0.5d"
dependencies: [8]
---

# Phase 9: Editor chương: tách file

## Overview

<!-- Updated: Red Team 2026-10-06 - phase 9 chỉ di chuyển code, giao diện sang phase 10 -->
Tách `components/editor/chapter-editor.tsx` (553 dòng) thành các file nhỏ trong `components/editor/` **chỉ bằng cách di chuyển code**: không đổi hành vi, giao diện, class, chuỗi, thứ tự DOM. Mọi `useState` và `useRef` vẫn nằm trong `ChapterEditor`; hook mới nhận **setter thô và ref** (identity ổn định), không nhận callback tạo trong lúc render. Gate xanh là điều kiện để sang phase 10 (giao diện).

Nguồn: scout-03 mục P8.5 (đề xuất tách); red team #1 (scope critic F1, failure analyst F4); quyết định [auto] editor trong `plan.md`.

## Requirements

- Chỉ di chuyển. Mỗi khối code chuyển nguyên văn (cùng comment, cùng thứ tự lệnh); chỉ thay tham chiếu biến cục bộ bằng tham số hook/props. Không thêm `useCallback`, `useMemo`, `useState`, `useRef` mới; không đổi tên chuỗi i18n, class Tailwind, cấu trúc JSX.
- **State giữ trong `ChapterEditor`** (dòng 74–102 hiện tại): `status`, `words`, `focus`/`setFocus` (`useFocusMode`), `restore`, `resolving`, `resolveError`, `chapter`, `unpublished`, `publishing`, `publishError`, `notice`; ref `loadedRef`, `autosaveRef`, `mirrorRef`; `useEditor(...)` (dòng 104–116). Lý do: setter cắt ngang ranh giới hook (`onSaved` → `setUnpublished`; `restoreRevision` → `setStatus`/`setWords`/`setUnpublished`/`setNotice`; `resolveConflict` → `setWords`; `publishNow` đọc `chapter.status`) — tách state theo hook sẽ buộc truyền callback giữa hook.
- **Effect autosave** (dòng 118–181) chuyển sang `useEditorAutosave`; deps là `[editor, publicId, number, loadedRef, autosaveRef, mirrorRef, setStatus, setUnpublished, setWords]` — ba giá trị đầu như hiện tại, phần còn lại là ref/setter có identity ổn định nên **không** làm effect chạy lại; comment trong code giải thích điều này (tiếng Anh, không nhắc plan). Không truyền hàm bọc (`(s) => setStatus(s)`, `onSaved` inline) vào hook: `react-hooks/exhaustive-deps` sẽ đẩy nó vào deps → effect chạy lại mỗi render → `createAutosave` dựng lại với `initialBase` cũ → 409 giả, banner "Chương đang được sửa ở nơi khác." (`editor.spec.ts:31`, `publish.spec.ts:77` đỏ).
- Hàm hành động (`resolveConflict`, `resyncAfter`, `runPublish`, `publishNow`, `schedule`, `unschedule`, `restoreRevision`) vẫn là closure tạo mới mỗi render như hiện tại (không memo), nên luôn đọc `chapter.status`/`editor` mới nhất. Giữ thứ tự `editor.setEditable(false, false)` → `await autosave.pause()` → … → `finally { autosave.resume(); editor.setEditable(true, false) }`.
- Hook import `@tiptap/*` phải nằm trong `components/editor/` (ESLint `TIPTAP_IMPORT_PATTERN`, `eslint.config.js:52`; `lint-boundaries.test.ts`).
- Badge chương ở header vẫn là `Badge` cũ (`chapter-editor.tsx:390-392`) — phase 10 đổi sang `ChapterStatusBadge`. `font-serif` ở `:465`, `:528` giữ (nội dung).

## Architecture

```
route chapters/$number (ssr:false) → WriterGate → ChapterEditor            (state + refs + useEditor + ghép, < 200)
  ├─ useEditorAutosave({ editor, publicId, number, loadedRef, autosaveRef, mirrorRef,
  │                      setStatus, setUnpublished, setWords, setResolving, setResolveError })  → { resolveConflict }
  ├─ useChapterPublishing({ editor, publicId, number, chapter, autosaveRef, mirrorRef,
  │                         setChapter, setUnpublished, setPublishing, setPublishError, setNotice }) → { publishNow, schedule, unschedule }
  ├─ useRevisionRestore({ editor, publicId, number, autosaveRef, mirrorRef,
  │                       setStatus, setWords, setUnpublished, setNotice, setPublishError })      → { restoreRevision }
  ├─ EditorHeader(props)        ← JSX dòng 371–424 (góc chế độ tập trung + <header> + toolbar)
  ├─ main: EditorBanners(props) ← JSX dòng 427–455 · ChapterMetaField(title) · EditorContent · ChapterMetaField(authorNote)
  └─ applyRestore / discardRestore / showUnpublished giữ trong ChapterEditor (dòng 351–367)
chapter-editor-helpers.ts: WORD_COUNT_DELAY_MS, wordsOf, shortDateTime, type MirrorWriter
lib/autosave.ts, lib/draft-mirror.ts, lib/chapters.ts: không sửa
```

## Related Code Files

- **Modify:** `apps/web/src/components/editor/chapter-editor.tsx`
- **Create (đều trong `apps/web/src/components/editor/`):** `chapter-editor-helpers.ts`, `use-editor-autosave.ts`, `use-chapter-publishing.ts`, `use-revision-restore.ts`, `editor-header.tsx`, `editor-banners.tsx`, `chapter-meta-field.tsx`
- **Delete:** không

## File inventory

| Path | Dòng | Việc (dòng nguồn trong `chapter-editor.tsx` hiện tại) |
| --- | --- | --- |
| `components/editor/chapter-editor.tsx` | 553 | còn state/ref/`useEditor` (74–116), gọi 3 hook, `showUnpublished`/`applyRestore`/`discardRestore` (351–367), JSX ghép; ước tính ~170 |
| `components/editor/chapter-editor-helpers.ts` | mới | `WORD_COUNT_DELAY_MS`, `wordsOf`, `shortDateTime` (51–59), `type MirrorWriter = ReturnType<typeof createMirrorWriter>`; ~20 |
| `components/editor/use-editor-autosave.ts` | mới | effect 118–181 + `resolveConflict` 183–208; ~125 |
| `components/editor/use-chapter-publishing.ts` | mới | `refreshStories` (98), `resyncAfter` 215–226, `runPublish` 228–268, `publishNow` 270–280, `schedule` 282–287, `unschedule` 289–303; ~140 |
| `components/editor/use-revision-restore.ts` | mới | `restoreRevision` 305–349; ~85 |
| `components/editor/editor-header.tsx` | mới | JSX 371–424; ~95 |
| `components/editor/editor-banners.tsx` | mới | JSX 427–455; ~70 |
| `components/editor/chapter-meta-field.tsx` | mới | `ChapterMetaField` 479–553 (export); ~90 |
| `lib/autosave.ts`, `lib/draft-mirror.ts`, `lib/chapters.ts` | 224/131/252 | **không sửa** |

(Số dòng mới là ước tính từ dòng nguồn + import; cook đo lại bằng `wc -l`.)

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| Autosave (13), mirror (6) | unit | `lib/autosave.test.ts`, `lib/draft-mirror.test.ts` | giữ |
| Tiptap chỉ import được trong `components/editor/*` (hook mới nằm trong đó) | unit | `lint-boundaries.test.ts` | giữ |
| textbox "Nội dung chương"; "Chưa lưu"; `/^Đã lưu lúc/`; "8 chữ"; xung đột + "Tải bản mới nhất"; banner xung đột **không** xuất hiện khi chỉ gõ (`toHaveCount(0)`); toolbar "Định dạng" (tập trung → 0); "Chế độ tập trung", Esc; `/Lỗi, thử lại sau 2s/`; link "Về trang truyện" | e2e | `editor.spec.ts` | giữ |
| `banner` chứa "Nháp"/"Đã đăng"/"Hẹn giờ" exact; nút "Đăng"/"Cập nhật" exact; dialog "320 chữ", "Đăng chương"; `[contenteditable=false]` khi đăng; "Có thay đổi chưa đăng"; hẹn giờ/huỷ hẹn; không banner xung đột (`publish.spec.ts:77`) | e2e | `publish.spec.ts` | giữ |
| Lịch sử, xem trước, khôi phục, notice `/^Đã khôi phục bản lúc …$/`, xung đột khi khôi phục → "Giữ bản của tôi" | e2e | `revision.spec.ts` | giữ |

Không test mới: phase chỉ di chuyển code; hành vi được khoá bởi e2e editor/publish/revision và unit autosave hiện có. Repo không có `@testing-library/react` (không `renderHook`), không thêm dependency.

## Function/interface checklist

- [ ] `chapter-editor-helpers.ts`: `export const WORD_COUNT_DELAY_MS = 500`; `export const wordsOf = (doc: EditorDocJson) => number`; `export const shortDateTime = (date: Date) => string`; `export type MirrorWriter = ReturnType<typeof createMirrorWriter>`
- [ ] `useEditorAutosave(args: { editor: Editor | null; publicId: string; number: number; loadedRef: RefObject<DraftView>; autosaveRef: RefObject<Autosave | null>; mirrorRef: RefObject<MirrorWriter | null>; setStatus: Dispatch<SetStateAction<SaveStatus>>; setUnpublished: Dispatch<SetStateAction<boolean>>; setWords: Dispatch<SetStateAction<number>>; setResolving: Dispatch<SetStateAction<boolean>>; setResolveError: Dispatch<SetStateAction<boolean>> }): { resolveConflict: (keepMine: boolean) => Promise<void> }` — destructure ngay ở tham số; object `args` không bao giờ vào deps
- [ ] `type PublishError = { message: string; from: 'dialog' | 'banner' }` (export từ `use-chapter-publishing.ts`, `ChapterEditor` dùng cho `useState<PublishError | null>`)
- [ ] `useChapterPublishing(args: { editor: Editor | null; publicId: string; number: number; chapter: AuthorChapterView; autosaveRef; mirrorRef; setChapter: Dispatch<SetStateAction<AuthorChapterView>>; setUnpublished; setPublishing: Dispatch<SetStateAction<boolean>>; setPublishError: Dispatch<SetStateAction<PublishError | null>>; setNotice: Dispatch<SetStateAction<string | null>> }): { publishNow: () => Promise<boolean>; schedule: (at: Date, from?: 'dialog' | 'banner') => Promise<boolean>; unschedule: () => Promise<void> }` — gọi `useQueryClient()` bên trong cho `refreshStories`
- [ ] `useRevisionRestore(args: { editor: Editor | null; publicId: string; number: number; autosaveRef; mirrorRef; setStatus; setWords; setUnpublished; setNotice; setPublishError }): { restoreRevision: (revision: RevisionSummary) => Promise<string | null> }` — gọi `useQueryClient()` bên trong cho invalidate revisions
- [ ] `EditorHeader(props: { editor: Editor | null; publicId: string; number: number; chapter: AuthorChapterView; showUnpublished: boolean; status: SaveStatus; words: number; focus: boolean; onFocusChange: (v: boolean) => void; publishing: boolean; dialogError: string | null; onPublish: () => Promise<boolean>; onSchedule: (at: Date) => Promise<boolean>; onRestore: (revision: RevisionSummary) => Promise<string | null> })` (kiểu callback khớp `PublishDialog` `publish-dialog.tsx:65-66`, `RevisionHistorySheet` `revision-history-sheet.tsx:43`, `FocusToggle` `focus-toggle.tsx:39-45`)
- [ ] `EditorBanners(props: { status: SaveStatus; resolving: boolean; resolveError: boolean; onResolve: (keepMine: boolean) => void; chapter: AuthorChapterView; publishing: boolean; onUnschedule: () => void; onReschedule: () => void; notice: string | null; bannerError: string | null; restore: DraftMirror | null; onApplyRestore: () => void; onDiscardRestore: () => void })`
- [ ] `ChapterMetaField({ kind, publicId, number, initial })` (chữ ký hiện tại, chỉ thêm `export`)

`Editor` lấy từ `@tiptap/react`; `RefObject`, `Dispatch`, `SetStateAction` từ `react`; `Autosave`, `SaveStatus` từ `@/lib/autosave`; `DraftView`, `AuthorChapterView`, `RevisionSummary` từ `@/lib/chapters`; `DraftMirror` từ `@/lib/draft-mirror`.

## Dependency map

- **Cần từ trước:** P2 đã đổi import `CHAPTER_STATUS_LABELS` (dòng 10) sang `story/story-labels.ts` — chuyển cùng JSX header sang `editor-header.tsx`.
- **Phase sau dùng:** P10 sửa giao diện trên các file nhỏ này (`editor-header.tsx`, `editor-banners.tsx`, `chapter-meta-field.tsx`, `editor-toolbar.tsx`…), không đụng 3 hook trừ khi cần.

## Implementation Steps

1. Ghi lại baseline: `pnpm --filter @novel-hub/web exec playwright test editor publish revision` xanh trước khi sửa.
2. `chapter-editor-helpers.ts` (di chuyển `WORD_COUNT_DELAY_MS`, `wordsOf`, `pad2`, `shortDateTime`).
3. `chapter-meta-field.tsx` (di chuyển nguyên `ChapterMetaField` + import của nó).
4. `use-editor-autosave.ts`: di chuyển effect + `resolveConflict`; deps như Requirements + comment. `pnpm typecheck && pnpm lint` (không cảnh báo `react-hooks`).
5. `use-chapter-publishing.ts`, `use-revision-restore.ts`: di chuyển nguyên hàm; thay biến cục bộ bằng tham số.
6. `editor-header.tsx`, `editor-banners.tsx`: di chuyển JSX; callback inline giữ ở `ChapterEditor` (ví dụ `onReschedule={() => void schedule(new Date(chapter.scheduledAt ?? ''), 'banner')}`).
7. `chapter-editor.tsx` còn state + ghép. Kiểm: `rg -n 'createAutosave\(' apps/web/src/components/editor` đúng 1 chỗ (trong `use-editor-autosave.ts`); `rg -n 'useCallback|useMemo' apps/web/src/components/editor/use-*.ts` rỗng; `git diff --color-moved=zebra` chỉ thấy khối di chuyển + import/tham số.
8. Gate đầy đủ (e2e editor/publish/revision phải xanh y như baseline).

## Accessible name phải giữ

Toàn bộ không đổi: textbox "Nội dung chương", label "Tên chương", toolbar "Định dạng", nút "Đăng"/"Cập nhật" (exact), "Lịch sử", "Chế độ tập trung", "Tải bản mới nhất", "Giữ bản của tôi"; chữ "Đã lưu lúc…", "Chưa lưu", "Xung đột", "Có thay đổi chưa đăng", "Nháp"/"Đã đăng"/"Hẹn giờ", "N chữ"; link "Về trang truyện"; `role=status`, `alertdialog`; một `banner`; class `.chapter-editor-content`.

## i18n

Không key mới, không đổi key.

## Success Criteria

- [ ] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] Mọi file trong `components/editor/` ≤ 200 dòng, trừ `publish-dialog.tsx` (185) và `revision-history-sheet.tsx` (197) không đụng
- [ ] `lib/autosave.ts`, `lib/draft-mirror.ts`, `lib/chapters.ts` không đổi; không file ngoài `components/editor/` đổi
- [ ] `createAutosave(` xuất hiện đúng 1 lần; không `useCallback`/`useMemo` trong hook mới; `pnpm lint` không cảnh báo `react-hooks/exhaustive-deps`
- [ ] Không đổi chuỗi/class/thứ tự DOM (`git diff --color-moved` chỉ là di chuyển)

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Effect autosave chạy lại mỗi render (callback vào deps) → 409 giả, banner xung đột | M × H | chỉ ref/setter vào deps; cấm hàm bọc; e2e `toHaveCount(0)` bắt |
| Closure cũ (memo) đọc `chapter.status` sai → sai notice | L × M | cấm `useCallback`/`useMemo`; hàm tạo mới mỗi render như hiện tại |
| Đổi thứ tự pause/resume khi di chuyển | L × H | di chuyển nguyên văn; e2e publish/revision |
| Hook import Tiptap ngoài `components/editor/` | L × M | mọi file mới đặt trong `components/editor/`; `lint-boundaries.test.ts` |

**Rollback:** revert `chapter-editor.tsx`, xoá 7 file mới (một commit riêng, độc lập phase 10).

## Ngoài phạm vi phase

Mọi thay đổi giao diện editor (header 68px, toolbar, focus, dialog/sheet đăng, sheet lịch sử, banner, chấm trạng thái lưu, ô lời nhắn, badge chung) — phase 10; tách `publish-dialog.tsx`/`revision-history-sheet.tsx` — phase 10; đổi API/autosave/mirror.
