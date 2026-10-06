---
phase: 2
title: "Bình luận theo đoạn"
status: completed
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Bình luận theo đoạn

<!-- Red Team: không chèn UI vào nội dung chương (spec §8), đếm theo đoạn không tải mỗi lượt đọc, cho phép pid của heading -->

## Context Links

- Spec: §5 Gđ2 checkbox 1 ("sau đó bình luận theo đoạn"), §4 (`chapter_contents.paragraph_ids`, `data-pid` ổn định), §8 khu đọc ("Không chèn gì vào giữa nội dung"), §10 (`comments.paragraph_id`)
- Phase 1: `phase-01-binh-luan-chuong-hai-cap.md` (service, hook, component bình luận)
- Scout: `reports/scout-261006-0225-frontend-tests-report.md` §2 (`data-pid`, `chapter-content.tsx`, sheet adaptive)
- Red team: Finding 8 trong `plan.md` (`## Red Team Review`)

## Overview

Người đọc bình luận vào một đoạn văn mà **không chèn gì vào nội dung chương**: bôi chọn chữ trong một đoạn (nhấn giữ trên mobile, kéo chọn trên desktop) → nút nổi "Bình luận đoạn này" hiện ở đáy màn hình → mở sheet luồng bình luận của đoạn (đáy dưới `lg`, panel phải từ `lg`). Khu bình luận cuối chương (phase 1) thêm tab "Theo đoạn" liệt kê các đoạn có bình luận (trích đoạn + số), bấm để cuộn tới đoạn và mở sheet. Xong phase này đánh `[x]` checkbox 1.

## Key Insights

- `data-pid` 8 ký tự `[a-z2-9]` (`packages/shared/src/editor/pid.ts`, `isValidPid`) có trên `<p>`, `<h2>`, `<h3>` (`packages/core/src/content/walker.ts:25-27,56,59`); `chapter_contents.paragraph_ids text[]` (`packages/db/src/schema/chapters.ts:56`) gồm pid của **cả đoạn và heading** → cho phép bình luận trên mọi phần tử có `data-pid`, để không có bình luận "vô hình".
- Spec §8 dòng "Không chèn gì vào giữa nội dung" → không chèn bong bóng/nút vào `<p>`; nút nổi đặt ngoài `.reader-content` (portal, `position: fixed`), không đổi DOM bên trong HTML chương.
- `useNavVisibility.onReadingAreaClick` đã bỏ qua click khi đang có vùng chọn (`apps/web/src/lib/reader/use-nav-visibility.ts:43-44`) → chọn chữ không bật/tắt thanh điều hướng.
- Mọi `/api/*` là `no-store` (`packages/api/src/app.ts:36`) → số đếm theo đoạn chỉ tải cùng khu bình luận (lười, phase 1), không tải ở mỗi lượt đọc.
- `ui/sheet.tsx:40-78` có `side="adaptive-right"`; sheet portal ra ngoài `.reader-page` nên dùng token site.

## Requirements

**Functional**
- `POST /comments` nhận thêm `paragraphId` (chỉ cho bình luận gốc; trả lời kế thừa đoạn của gốc). Server kiểm `isValidPid` và pid nằm trong `paragraph_ids` của bản đã đăng → không thì 422 `COMMENT_PARAGRAPH_INVALID`.
- `GET /comments/paragraph-counts?story&chapter` → `{ counts: Record<pid, number> }` (gốc + trả lời visible, người viết không bị ban, chỉ pid còn trong `paragraph_ids`). Gọi khi khu bình luận cuối chương được tải (cùng lúc với danh sách) và sau khi đăng/xoá trong sheet.
- `GET /comments?story&chapter&paragraph=<pid>` → luồng của một đoạn (cùng cấu trúc phase 1).
- Danh sách chương (không có `paragraph`) chỉ gồm bình luận `paragraph_id is null` **hoặc** pid không còn trong `paragraph_ids` (đoạn đã sửa); mục mồ côi gắn nhãn nhỏ "Bình luận về đoạn đã sửa". `total` ở tab chương đếm theo cùng điều kiện.
- Nút nổi: hiện khi vùng chọn (không rỗng) nằm gọn trong **một** phần tử `[data-pid]` thuộc `.reader-content`; ẩn khi vùng chọn mất hoặc trải nhiều đoạn. Vị trí: cố định ở đáy, phía trên thanh dưới (mobile) / giữa đáy cột chữ (desktop); pill `default`, cao 44px; không che vùng chọn (chọn ở nửa dưới màn hình thì nút lên đỉnh dưới thanh trên).
- Sheet đoạn: trích đoạn (text lấy từ DOM theo pid, `line-clamp-3`, font content), danh sách luồng, composer (cùng trạng thái khách/chưa xác thực/muted như phase 1). Khi sheet mở, phần tử đoạn có thuộc tính `data-pc-active` → CSS nền `--reader-card` nhẹ (chỉ đổi thuộc tính, không chèn node).
- Tab "Theo đoạn (M)" trong khu bình luận cuối chương: danh sách đoạn có bình luận theo thứ tự xuất hiện trong chương, mỗi mục là nút (trích đoạn 2 dòng + "N bình luận"); bấm → `scrollIntoView` đoạn + mở sheet. Đây cũng là đường cho người dùng bàn phím mở luồng đoạn đã có bình luận.

**Non-functional**
- Không đổi HTML SSR, không đổi `walker.ts`/sanitize, không thêm node vào `.reader-content`.
- Không request mới khi người đọc chưa cuộn tới khu bình luận (trừ khi họ bôi chọn và bấm nút nổi).
- Chế độ gate 18+ (`inert`) không gắn listener chọn chữ.

## Architecture

```
route chương
  useParagraphSelection(contentRef, enabled=!gated) → selectedPid | null   (selectionchange, debounce 150ms)
  <ParagraphCommentFab pid onOpen />  (portal, fixed; ngoài .reader-content)
  <ParagraphCommentsSheet pid />       (adaptive-right; set/remove data-pc-active trên phần tử pid)
  <ChapterComments> (phase 1) + tab "Theo đoạn" ← useParagraphCommentCounts (tải cùng lúc với danh sách)
      └─ ParagraphThreadIndex: counts → phần tử theo thứ tự DOM → nút mở sheet
core/comments: createComment(+paragraphId), listChapterComments(+paragraph filter / orphan), countParagraphComments
```

- Migration (`pnpm db:generate`, gợi ý `paragraph_comment_index`): `comments_chapter_paragraph_idx (chapter_id, paragraph_id) where paragraph_id is not null and parent_id is null`.
- Đếm: gốc theo `paragraph_id` + trả lời join về gốc, `where root.paragraph_id = any(cc.paragraph_ids)` → một query.
- Mồ côi: `paragraph_id is null or not (paragraph_id = any(cc.paragraph_ids))` join `chapter_contents cc`.
- Tìm phần tử theo pid ở client: duyệt `contentRef.current.querySelectorAll('[data-pid]')` so sánh `dataset.pid`, không ghép selector chuỗi.

## Related Code Files

| Hành động | File |
|---|---|
| Modify | `packages/db/src/schema/community.ts` + migration mới |
| Modify | `packages/shared/src/schemas/comment.ts` (+ test): `paragraphId` tuỳ chọn (dùng `isValidPid`), query `paragraph`, `paragraphCountsQuerySchema`, DTO `orphanedParagraph?: boolean` |
| Modify | `packages/core/src/comments/create-comment.ts`, `list-comments.ts`; Create `paragraph-counts.ts`; mở rộng `comments.int.test.ts` |
| Modify | `packages/api/src/routes/comments.ts` (+ int test), `lib/core-errors.ts` (`COMMENT_PARAGRAPH_INVALID` 422) |
| Modify | `apps/web/src/lib/comments.ts` (`useParagraphCommentCounts`, tham số `paragraphId`) |
| Create | `apps/web/src/lib/reader/use-paragraph-selection.ts` + `paragraph-selection.ts` (hàm thuần: từ `Selection` ra pid hoặc null) (+ `paragraph-selection.test.ts`) |
| Create | `apps/web/src/components/comments/paragraph-comment-fab.tsx`, `paragraph-comments-sheet.tsx`, `paragraph-thread-index.tsx` |
| Modify | `apps/web/src/components/comments/chapter-comments.tsx` (tab chương / theo đoạn dùng `segmented-link-classes`-kiểu nút), `comment-item.tsx` (nhãn đoạn đã sửa), route chương (state `openPid`) |
| Modify | `apps/web/src/styles/reader.css` (`[data-pc-active]` nền `--reader-card`) |
| Modify | `packages/shared/messages/vi.json` (`comment_paragraph_*`) |
| Modify | `apps/web/e2e/comments.spec.ts` (kịch bản đoạn) |
| Modify | `docs/project-spec.md` (đánh `[x]` checkbox 1) |

## Function / Interface Checklist

- [x] `countParagraphComments(db, {publicId, number}) → Result<Record<string, number>, 'NOT_FOUND'>`
- [x] `createComment` kiểm `paragraphId ∈ paragraph_ids` (`COMMENT_PARAGRAPH_INVALID`); trả lời bỏ qua `paragraphId` client gửi (lấy theo gốc)
- [x] `listChapterComments({…, paragraphId?})` — có `paragraphId` thì lọc đúng đoạn, không có thì "không gắn đoạn hoặc mồ côi"
- [x] `pidFromSelection(selection, root) → string | null` (thuần, test bằng DOM giả tối thiểu hoặc tách logic so khớp tổ tiên)
- [x] `useParagraphSelection(contentRef, {enabled}) → string | null`

## Implementation Steps

1. Schema Zod + migration index, `pnpm db:migrate`.
2. Core: kiểm pid khi tạo; đếm theo đoạn; lọc danh sách chương/đoạn; int test (pid không tồn tại → lỗi; pid heading hợp lệ; đoạn bị bỏ ở bản đăng mới → bình luận chuyển sang danh sách chương với `orphanedParagraph: true`, đếm bỏ qua).
3. API: query `paragraph`, endpoint đếm; int test.
4. Web: hook chọn chữ + nút nổi + sheet + tab "Theo đoạn". Đăng/xoá trong sheet → invalidate đếm, luồng đoạn và danh sách chương.
5. CSS `[data-pc-active]`; tôn trọng `prefers-reduced-motion` (không animate cuộn).
6. i18n, e2e: bôi chọn chữ trong đoạn 2 (Playwright: `page.evaluate` tạo Range trong `p[data-pid]`) → nút nổi hiện → mở sheet → gửi → tab "Theo đoạn (1)" có mục → bấm mục mở lại sheet có bình luận; danh sách chương không chứa bình luận đoạn; DOM `.reader-content` không có phần tử mới; chạm giữa màn hình (không chọn) vẫn bật/tắt thanh điều hướng.
7. Gate xanh → đánh `[x]` checkbox 1 trong `docs/project-spec.md`.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | schema: `paragraphId` sai định dạng bị từ chối; `pidFromSelection` (một đoạn, hai đoạn → null, ngoài `.reader-content` → null, collapsed → null) |
| Int (core) | tạo bình luận đoạn hợp lệ/không hợp lệ/heading; trả lời kế thừa đoạn; đếm đúng (gốc + trả lời, bỏ banned, bỏ ẩn); mồ côi sau khi đăng lại chương bỏ đoạn |
| Int (api) | `GET paragraph-counts` cho chương không đọc được → 404; `COMMENT_PARAGRAPH_INVALID` 422 |
| E2E | bước 6 |

## Dependency Map

- Cần phase 1: service, schema, hook, component bình luận, `canPostCommunityContent`, `useNearViewport`.
- Không phase sau nào phụ thuộc trực tiếp.

## Todo List

- [x] Zod + migration
- [x] Core + API
- [x] Chọn chữ + nút nổi + sheet + tab theo đoạn
- [x] i18n, e2e, gate
- [x] Đánh `[x]` checkbox 1

## Success Criteria

- [x] Gate xanh
- [x] Bình luận theo đoạn end-to-end; đoạn bị sửa không làm mất bình luận (về danh sách chương)
- [x] Không node nào được chèn vào nội dung chương; HTML SSR không đổi; thanh điều hướng vẫn hoạt động như cũ
- [x] Checkbox 1 spec `[x]`

## Risk Assessment

- Khó phát hiện: người đọc không thấy chỉ báo trong khi đọc → tab "Theo đoạn" + gợi ý một dòng ở khu bình luận ("Bôi chọn một đoạn để bình luận về nó"). Chỉ báo trong nội dung (kiểu 段评) đã bị loại ở Validation Session 1 [auto] (giữ spec §8); muốn thêm sau thì user đổi spec trước. <!-- Updated: Validation Session 1 - không chỉ báo trong nội dung -->
- Nhấn giữ trên iOS/Android bật thanh công cụ chọn chữ của hệ điều hành ở gần vùng chọn → nút nổi đặt ở đáy/đỉnh màn hình, không cạnh vùng chọn.
- Bàn phím: mở luồng đoạn đã có bình luận qua tab "Theo đoạn"; tạo bình luận đoạn mới cần chọn chữ bằng bàn phím (caret browsing) → chấp nhận năm đầu, vẫn bình luận chương được.

## Security Considerations

- `paragraphId` qua `isValidPid` + kiểm trong `paragraph_ids` → không chèn được giá trị tuỳ ý; client tìm phần tử bằng so khớp `dataset.pid`, không ghép selector chuỗi.

## Next Steps

Phase 3: theo dõi + thông báo.
