# Code review: phase 09, tách file editor

- Phạm vi: `chapter-editor.tsx` (553 → 190) + 7 file mới trong `components/editor/`; mọi file ≤ 200 dòng.
- Đã chạy: so từng khối với `git show HEAD:...`; `pnpm typecheck`, `pnpm lint` (gồm `react-hooks/exhaustive-deps`), `prettier --check` xanh; rg `createAutosave(` = 1 (`use-editor-autosave.ts:53`), không `useCallback/useMemo/useState/useRef` trong hook/component mới.

| Tiêu chí | Kết quả |
| --- | --- |
| (a) chỉ di chuyển, không đổi i18n/class/JSX/accessible name | PASS |
| (b) state/ref giữ trong ChapterEditor; deps autosave đúng 9 giá trị ổn định, không hàm bọc | PASS |
| (c) hàm hành động là closure mỗi render, đọc `chapter.status` mới | PASS |
| (d) thứ tự setEditable → pause → finally resume/setEditable giữ nguyên | PASS |
| (e) DOM tương đương; `bannerError !== null` khớp điều kiện gốc (kể cả chuỗi rỗng) | PASS |
| (f) không file ngoài `components/editor/`; lib không đổi; Tiptap đúng ranh giới | PASS |
| (g) comment tiếng Anh, không nhắc plan | PASS |

Critical/High/Medium: không.

Ghi chú (không phải lỗi): `useQueryClient()` gọi trong 2 hook, sau `useEditor` — chỉ đọc context, không đổi hành vi. Doc comment trùng phía trên `resyncAfter` (`use-chapter-publishing.ts`) có từ bản gốc, giữ nguyên vì phase chỉ di chuyển.

**Status:** DONE — không phát hiện lỗi.
